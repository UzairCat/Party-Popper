// Real sockets + the production handlers, with an injected generator and clock.
// Never sends requests to OpenAI or spends API credits.
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { Server } from 'socket.io'
import { io as client } from 'socket.io-client'
import { RoomManager } from '../dist-server/server/room-manager.js'
import { FourChoiceManager } from '../dist-server/server/games/four-choice-manager.js'
import { QuizSessionManager } from '../dist-server/server/games/quiz-session-manager.js'
import { registerSocketHandlers } from '../dist-server/server/socket-handlers.js'

let now = 1_000_000
let generations = 0
const matches = new QuizSessionManager({generate: async (settings) => {
  generations++
  return Array.from({length:settings.questionCount}, (_, i) => ({id:`match${generations}-q${i}`, question:`What is ${i} plus one?`, answers:[`${i+1}`, '100', '200', '300'], correctAnswer:0, category:'science', difficulty:settings.difficulty, concept:`addition.${generations}.${i}`}))
}}, () => now)
const http = createServer()
const io = new Server(http)
const rooms = new RoomManager({now:() => now})
const stop = registerSocketHandlers(io, rooms, new FourChoiceManager(), matches)
await new Promise(resolve => http.listen(0, '127.0.0.1', resolve))
const url = `http://127.0.0.1:${http.address().port}`
const sockets = []
const connect = async () => {
  const socket = client(url, {forceNew:true, reconnection:false})
  sockets.push(socket)
  await new Promise((resolve,reject) => {socket.once('connect',resolve); socket.once('connect_error',reject)})
  return socket
}
const ack = (socket, event, ...args) => new Promise((resolve,reject) => socket.timeout(3000).emit(event,...args,(error,result) => error ? reject(error) : resolve(result)))
const good = async (socket, event, ...args) => {const response = await ack(socket,event,...args); assert.equal(response.ok,true, response.error?.message); return response.data}
const advance = ms => {now += ms; matches.tick()}

try {
  const host = await connect()
  let guest = await connect()
  const created = await good(host,'room:create',{name:'Host',avatar:'robot',colour:'purple'})
  const code = created.room.code
  const joined = await good(guest,'room:join',{roomCode:code,name:'Guest',avatar:'frog',colour:'green'})
  await good(guest,'player:ready',{isReady:true})
  await good(host,'games:open')
  await good(host,'game:select',{gameId:'FOUR_CHOICE'})
  await good(host,'quiz:settings:update',{settings:{mode:'CLASSIC',timePerQuestion:5,questionCount:5,difficulty:'medium',categories:['science']}})
  assert.equal((await ack(guest,'quiz:start')).error.code,'HOST_ONLY')
  await good(host,'quiz:start')
  assert.equal((await ack(host,'quiz:start')).ok,false)
  assert.equal((await ack(host,'quiz:settings:update',{settings:{}})).ok,false)
  const late = await connect()
  assert.equal((await ack(late,'room:join',{roomCode:code,name:'Late',avatar:'robot',colour:'purple'})).error.code,'GAME_STARTED')
  advance(3000); advance(1000)
  let state = await good(host,'quiz:sync')
  assert.equal(state.phase,'QUESTION')
  assert.equal(state.correctAnswer,null)
  assert.equal(state.question.answers.length,4)
  assert.equal(JSON.stringify(state).includes('concept'),false)
  assert.equal((await ack(guest,'quiz:next')).error.code,'HOST_ONLY')

  for (let i=0;i<5;i++) {
    state = await good(host,'quiz:sync')
    const q = state.question.id
    await good(host,'quiz:answer',{questionId:q,answer:0})
    assert.equal((await ack(host,'quiz:answer',{questionId:q,answer:1})).ok,false)
    const guestState = await good(guest,'quiz:sync')
    assert.equal(guestState.ownAnswer,null)
    assert.equal(guestState.ownPoints,null)
    await good(guest,'quiz:answer',{questionId:q,answer:1})
    if (i===0) {
      guest.disconnect()
      guest = await connect()
      await good(guest,'room:reconnect',joined.session)
      const restored = await good(guest,'quiz:sync')
      assert.equal(restored.ownAnswer,1)
      assert.equal(restored.correctAnswer,null)
      assert.equal((await ack(guest,'quiz:answer',{questionId:q,answer:0})).ok,false)
    }
    advance(1000)
    state = await good(host,'quiz:sync')
    assert.equal(state.phase,'ANSWER_REVEAL')
    assert.equal(state.ownPoints,1000)
    assert.equal(state.correctAnswer,0)
    advance(3500)
    if (i<4) {
      assert.equal((await ack(host,'quiz:next')).ok,false)
      advance(7999)
      assert.equal((await ack(host,'quiz:next')).ok,false)
      advance(1)
      await good(host,'quiz:next')
      advance(1000)
    }
  }
  state = await good(host,'quiz:sync')
  assert.equal(state.phase,'FINAL_RESULTS')
  assert.equal(state.standings[0].score,5000)
  await good(host,'host:transfer',{playerId:joined.session.playerId})
  assert.equal((await ack(host,'quiz:menu')).error.code,'HOST_ONLY')
  await good(guest,'quiz:start')
  const replay = await good(guest,'quiz:sync')
  assert.notEqual(replay.matchId,state.matchId)
  assert.equal(replay.standings[0].score,0)
  advance(3000); advance(1000)
  // Finish using timeouts, then return everyone to settings and game selection.
  for (let i=0;i<5;i++) {
    advance(5000); advance(3500)
    if (i<4) {advance(8000); await good(guest,'quiz:next'); advance(1000)}
  }
  await good(guest,'quiz:menu')
  const setup = await good(guest,'quiz:settings:get')
  assert.equal(setup.settings.questionCount,5)
  await good(guest,'game:back')
  await good(guest,'room:close')
  console.log('Quiz verification passed: two complete matches, permissions, privacy, deadlines, reconnect, host transfer, replay and menus.')
} finally {
  for (const socket of sockets) socket.disconnect()
  await new Promise(resolve => io.close(resolve))
  stop()
}
