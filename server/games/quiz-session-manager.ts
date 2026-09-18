import { randomUUID } from 'node:crypto'
import type { FourChoiceSettings, QuizPhase, QuizSnapshot, QuizStanding } from '../../shared/four-choice.js'
import type { RoomSnapshot } from '../../shared/protocol.js'
import { RoomError } from '../room-manager.js'
import { GenerationError, type QuestionGenerator, type QuizQuestion } from './quiz-generator.js'

interface Answer { choice: number; receivedAt: number; points: number }
interface Match {
  id: string
  phase: QuizPhase
  settings: FourChoiceSettings
  players: Map<string, QuizStanding>
  questions: QuizQuestion[]
  index: number
  startedAt: number
  deadline: number | null
  earlyEnd: number | null
  answers: Map<string, Answer>
  controller: AbortController
  error: string | null
}

export function quizScore(correct: boolean, elapsed: number, duration: number) {
  return correct ? Math.round(500 + 500 * Math.max(0, Math.min(1, 1 - elapsed / duration))) : 0
}

export class QuizSessionManager {
  private readonly matches = new Map<string, Match>()
  private readonly history = new Map<string, QuizQuestion[]>()
  private readonly lastStart = new Map<string, number>()
  onChange: (roomCode: string) => void = () => {}

  constructor(private readonly generator: QuestionGenerator, private readonly now: () => number = Date.now) {}

  has(roomCode: string) { return this.matches.has(roomCode) }

  start(room: RoomSnapshot, settings: FourChoiceSettings) {
    const current = this.matches.get(room.code)
    if (current && !['ERROR', 'FINAL_RESULTS'].includes(current.phase)) this.fail('A quiz is already running.')
    if (this.now() - (this.lastStart.get(room.code) ?? -Infinity) < 30_000) this.fail('Please wait 30 seconds before preparing another quiz.')
    if (room.players.filter(p => p.isConnected).length < 2) this.fail('At least two connected players are needed.')
    current?.controller.abort()
    const match: Match = {
      id: randomUUID(), phase: 'GENERATING', settings: structuredClone(settings),
      players: new Map(room.players.map(p => [p.id, { playerId: p.id, name: p.name, avatar: p.avatar,
        isConnected: p.isConnected, score: 0, points: 0, rank: 1, previousRank: 1 }])),
      questions: [], index: 0, startedAt: 0, deadline: null, earlyEnd: null,
      answers: new Map(), controller: new AbortController(), error: null,
    }
    this.lastStart.set(room.code, this.now())
    this.matches.set(room.code, match)
    // Synchronous reservation prevents double-starts; generation finishes independently of the socket ack.
    void this.prepare(room.code, match)
  }

  private async prepare(code: string, match: Match) {
    try {
      const questions = await this.generator.generate(match.settings, this.history.get(code) ?? [], match.controller.signal)
      if (this.matches.get(code) !== match || match.controller.signal.aborted) return
      if (questions.length !== match.settings.questionCount) throw new Error('Incomplete match')
      match.questions = questions
      this.history.set(code, [...(this.history.get(code) ?? []), ...questions].slice(-500))
      match.phase = 'INTRO'
      match.deadline = this.now() + 3_000
    } catch (error) {
      if (this.matches.get(code) !== match || match.controller.signal.aborted) return
      match.phase = 'ERROR'
      match.deadline = null
      match.error = error instanceof GenerationError ? error.publicMessage : 'We couldn’t prepare the quiz. Please try again.'
    }
    this.onChange(code)
  }

  syncPlayers(room: RoomSnapshot) {
    const match = this.matches.get(room.code)
    if (!match) return
    for (const [id, standing] of match.players) {
      const player = room.players.find(p => p.id === id)
      if (!player) match.players.delete(id)
      else standing.isConnected = player.isConnected
    }
    this.updateEarlyEnd(match)
  }

  snapshot(code: string, playerId: string): QuizSnapshot {
    const match = this.require(code)
    const q = match.questions[match.index]
    const reveal = ['ANSWER_REVEAL', 'LEADERBOARD', 'FINAL_RESULTS'].includes(match.phase)
    const visible = reveal || match.phase === 'QUESTION'
    const answer = match.answers.get(playerId)
    return {
      matchId: match.id, phase: match.phase, serverNow: this.now(), deadline: match.deadline,
      questionNumber: match.index + 1, questionCount: match.settings.questionCount,
      timePerQuestion: match.settings.timePerQuestion,
      question: visible && q ? { id: q.id, text: q.question, answers: [...q.answers], category: q.category } : null,
      correctAnswer: reveal && q ? q.correctAnswer : null,
      ownAnswer: answer?.choice ?? null, ownPoints: reveal ? answer?.points ?? 0 : null,
      answeredCount: [...match.answers.keys()].filter(id => match.players.has(id)).length,
      playerCount: match.players.size,
      standings: this.rank(match).map(p => ({ ...p })), error: match.error,
    }
  }

  answer(code: string, playerId: string, questionId: string, choice: number) {
    this.tickRoom(code)
    const match = this.require(code)
    const q = match.questions[match.index]
    if (match.phase !== 'QUESTION' || !q || q.id !== questionId || !match.deadline || this.now() >= match.deadline) this.fail('This question is no longer accepting answers.')
    if (!match.players.has(playerId)) this.fail('You are not a player in this match.')
    if (!Number.isInteger(choice) || choice < 0 || choice > 3) this.fail('Choose one of the four answers.')
    const existing = match.answers.get(playerId)
    // Idempotent retries survive a lost acknowledgement; changing the choice is forbidden.
    if (existing) {
      if (existing.choice !== choice) this.fail('Your answer is already locked.')
      return
    }
    match.answers.set(playerId, { choice, receivedAt: this.now(), points: 0 })
    this.updateEarlyEnd(match)
    this.onChange(code)
  }

  next(code: string) {
    const match = this.require(code)
    if (match.phase !== 'LEADERBOARD' || this.now() < (match.deadline ?? Infinity)) this.fail('The leaderboard must stay visible for at least eight seconds.')
    match.index++
    match.phase = 'QUESTION_INTRO'
    match.deadline = this.now() + 1_000
    match.answers.clear()
    match.earlyEnd = null
    for (const player of match.players.values()) player.points = 0
    this.onChange(code)
  }

  returnToSettings(code: string) {
    const match = this.require(code)
    if (!['ERROR', 'FINAL_RESULTS', 'GENERATING'].includes(match.phase)) this.fail('Finish the match before changing settings.')
    match.controller.abort()
    this.matches.delete(code)
  }

  remove(code: string) {
    this.matches.get(code)?.controller.abort()
    this.matches.delete(code)
    this.history.delete(code)
    this.lastStart.delete(code)
  }

  tick() { for (const code of this.matches.keys()) this.tickRoom(code) }

  private tickRoom(code: string) {
    const match = this.require(code)
    const now = this.now()
    if (match.phase === 'QUESTION' && (now >= (match.deadline ?? Infinity) || now >= (match.earlyEnd ?? Infinity))) {
      const q = match.questions[match.index]
      for (const standing of this.rank(match)) {
        standing.previousRank = standing.rank
        const answer = match.answers.get(standing.playerId)
        const points = answer ? quizScore(answer.choice === q.correctAnswer, answer.receivedAt - match.startedAt, match.settings.timePerQuestion * 1000) : 0
        standing.points = points
        standing.score += points
        if (answer) answer.points = points
      }
      match.phase = 'ANSWER_REVEAL'
      match.deadline = now + 3_500
      this.onChange(code)
    } else if (now >= (match.deadline ?? Infinity)) {
      if (match.phase === 'INTRO') {
        match.phase = 'QUESTION_INTRO'; match.deadline = now + 1_000
      } else if (match.phase === 'QUESTION_INTRO') {
        match.phase = 'QUESTION'; match.startedAt = now; match.deadline = now + match.settings.timePerQuestion * 1000
      } else if (match.phase === 'ANSWER_REVEAL') {
        match.phase = match.index === match.questions.length - 1 ? 'FINAL_RESULTS' : 'LEADERBOARD'
        match.deadline = match.phase === 'LEADERBOARD' ? now + 8_000 : null
      } else return
      this.onChange(code)
    }
  }

  private updateEarlyEnd(match: Match) {
    if (match.phase !== 'QUESTION') return
    // Disconnected participants retain their opportunity to reconnect until the normal deadline.
    const everyone = match.players.size > 0 && [...match.players.keys()].every(id => match.answers.has(id))
    match.earlyEnd = everyone ? match.earlyEnd ?? this.now() + 1_000 : null
  }

  private rank(match: Match) {
    const list = [...match.players.values()].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name) || a.playerId.localeCompare(b.playerId))
    list.forEach((player, index) => { player.rank = index > 0 && list[index - 1].score === player.score ? list[index - 1].rank : index + 1 })
    return list
  }

  private require(code: string) {
    const match = this.matches.get(code)
    if (!match) throw new RoomError('INVALID_GAME_STATE', 'No quiz is running in this room.')
    return match
  }

  private fail(message: string): never { throw new RoomError('INVALID_GAME_STATE', message) }
}
