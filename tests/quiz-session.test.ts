// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { QuizSessionManager, quizScore } from '../server/games/quiz-session-manager'
import { GenerationError, type QuizQuestion } from '../server/games/quiz-generator'
import { DEFAULT_FOUR_CHOICE_SETTINGS } from '../shared/four-choice'
import type { RoomSnapshot } from '../shared/protocol'

const room: RoomSnapshot = {
  code: 'ABCD', status: 'GAME_SETUP', selectedGameId: 'FOUR_CHOICE', hostId: 'host',
  players: [{ id: 'host', name: 'Host', avatar: 'robot', colour: 'purple', isReady: true, isConnected: true },
    { id: 'guest', name: 'Guest', avatar: 'frog', colour: 'green', isReady: true, isConnected: true }],
  settings: { maxPlayers: 8, requireReady: true, allowLateJoin: false, filterNames: true }, createdAt: '', updatedAt: '',
}
const settings = { ...DEFAULT_FOUR_CHOICE_SETTINGS, questionCount: 5, timePerQuestion: 5 }
const questions: QuizQuestion[] = Array.from({length: 5}, (_, i) => ({
  id: `q${i}`, question: `What is ${i} plus one?`, answers: [`${i + 1}`, '100', '200', '300'],
  correctAnswer: 0, category: 'science', difficulty: 'medium', concept: `addition.${i}`,
}))
async function harness() {
  let now = 0
  const history: QuizQuestion[][] = []
  const manager = new QuizSessionManager({generate: async (_settings, recent) => { history.push(recent); return structuredClone(questions) }}, () => now)
  const advance = (ms: number) => { now += ms; manager.tick() }
  manager.start(room, settings)
  await Promise.resolve()
  advance(3000); advance(1000)
  return {manager, advance, history, state: (id = 'host') => manager.snapshot(room.code, id)}
}

describe('Server-authoritative quiz', () => {
  it('scores using receive time, hides solutions and other answers, rejects changes and scores once', async () => {
    const {manager, advance, state} = await harness()
    expect(state().phase).toBe('QUESTION')
    expect(state().correctAnswer).toBeNull()
    expect(JSON.stringify(state())).not.toContain('addition.')
    manager.answer('ABCD', 'host', 'q0', 0)
    manager.answer('ABCD', 'host', 'q0', 0) // network retry is safe
    expect(() => manager.answer('ABCD', 'host', 'q0', 1)).toThrow('already locked')
    expect(state('guest').ownAnswer).toBeNull()
    expect(state().ownPoints).toBeNull()
    expect(state().standings.every(p => p.score === 0)).toBe(true)
    advance(1000)
    manager.answer('ABCD', 'guest', 'q0', 0)
    advance(999); expect(state().phase).toBe('QUESTION')
    advance(1); expect(state().phase).toBe('ANSWER_REVEAL')
    expect(state().ownPoints).toBe(1000)
    expect(state('guest').ownPoints).toBe(900)
    expect(state().correctAnswer).toBe(0)
    advance(1000)
    expect(state().standings[0].score).toBe(1000)
  })

  it('enforces the deadline, zero for no answer, and an eight-second leaderboard gate', async () => {
    const {manager, advance, state} = await harness()
    expect(() => manager.answer('ABCD', 'guest', 'stale-question', 0)).toThrow()
    expect(() => manager.answer('ABCD', 'guest', 'q0', 4)).toThrow()
    manager.answer('ABCD', 'host', 'q0', 1)
    advance(5000)
    expect(() => manager.answer('ABCD', 'guest', 'q0', 0)).toThrow()
    expect(state('guest').ownPoints).toBe(0)
    expect(state().ownPoints).toBe(0)
    advance(3500)
    expect(state().phase).toBe('LEADERBOARD')
    expect(() => manager.next('ABCD')).toThrow('eight seconds')
    advance(7999); expect(() => manager.next('ABCD')).toThrow()
    advance(1); manager.next('ABCD')
    expect(state().phase).toBe('QUESTION_INTRO')
    expect(state().question).toBeNull()
    advance(1000)
    expect(state().question?.id).toBe('q1')
  })

  it('retains answers across reconnects, removes departed players and keeps the game running', async () => {
    const {manager, advance, state} = await harness()
    manager.answer('ABCD', 'guest', 'q0', 0)
    manager.syncPlayers({...room, players: room.players.map(p => ({...p, isConnected: false}))})
    advance(1000)
    manager.syncPlayers(room)
    expect(state('guest').ownAnswer).toBe(0)
    expect(() => manager.answer('ABCD', 'guest', 'q0', 1)).toThrow()
    manager.syncPlayers({...room, players: [room.players[1]]})
    advance(1000)
    expect(state('guest').phase).toBe('ANSWER_REVEAL')
    expect(state().standings).toHaveLength(1)
  })

  it('plays all five questions, skips the last intermediate leaderboard and sends recent history on replay', async () => {
    const {manager, advance, state, history} = await harness()
    for (let i = 0; i < 5; i++) {
      manager.answer('ABCD', 'host', `q${i}`, 0)
      manager.answer('ABCD', 'guest', `q${i}`, 1)
      advance(1000); advance(3500)
      if (i < 4) { advance(8000); manager.next('ABCD'); advance(1000) }
    }
    expect(state().phase).toBe('FINAL_RESULTS')
    expect(state().standings[0]).toMatchObject({playerId: 'host', score: 5000, rank: 1})
    manager.start(room, settings)
    await Promise.resolve()
    expect(history[1]).toHaveLength(5)
    expect(state().standings.every(p => p.score === 0)).toBe(true)
    expect(state().phase).toBe('INTRO')
  })

  it('handles provider errors, cooldowns and cancellation without reviving an abandoned match', async () => {
    const failing = new QuizSessionManager({generate: async () => {throw new GenerationError('Try again.')}}, () => 0)
    failing.start(room, settings); await Promise.resolve()
    expect(failing.snapshot('ABCD', 'host')).toMatchObject({phase: 'ERROR', error: 'Try again.'})
    expect(() => failing.start(room, settings)).toThrow('30 seconds')
    let finish!: (q: QuizQuestion[]) => void
    const pending = new QuizSessionManager({generate: () => new Promise(resolve => { finish = resolve })})
    pending.start(room, settings)
    expect(() => pending.start(room, settings)).toThrow('already running')
    pending.returnToSettings('ABCD')
    finish(questions); await Promise.resolve()
    expect(pending.has('ABCD')).toBe(false)
  })

  it('clamps correct scores to 500–1000 and gives incorrect answers zero', () => {
    expect(quizScore(true, -10, 5000)).toBe(1000)
    expect(quizScore(true, 10000, 5000)).toBe(500)
    expect(quizScore(false, 0, 5000)).toBe(0)
  })
})
