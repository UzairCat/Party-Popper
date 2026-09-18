import { useCallback, useEffect, useRef, useState } from 'react'
import { FOUR_CHOICE_CATEGORIES, type QuizSnapshot } from '../../../shared/four-choice'
import type { RoomSnapshot } from '../../types/room'
import { Button } from '../../components/common/Button'
import { AvatarArt } from '../../components/player/AvatarArt'
import { socket, syncQuiz, submitQuizAnswer, nextQuizQuestion, quizMenu, startFourChoice, returnToGameSelection } from '../../lib/socket'
import './quiz-game.css'

const letters = ['A', 'B', 'C', 'D']
const loadingLines = ['Mixing your categories…', 'Thinking up convincing wrong answers…', 'Giving every question a second look…', 'Preparing your next friendly rivalry…']

export function QuizGame({ room, playerId, onLeave }: { room: RoomSnapshot; playerId: string; onLeave: () => void }) {
  const [state, setState] = useState<QuizSnapshot | null>(null)
  const [remaining, setRemaining] = useState(0)
  const [message, setMessage] = useState<string | null>(null)
  const [connected, setConnected] = useState(socket.connected)
  const [pending, setPending] = useState(false)
  const [loadingIndex, setLoadingIndex] = useState(0)
  const busy = useRef(false)
  const clock = useRef({ deadline: 0, receivedAt: 0, serverNow: 0 })
  const isHost = room.hostId === playerId

  const receive = useCallback((next: QuizSnapshot) => {
    clock.current = { deadline: next.deadline ?? 0, receivedAt: performance.now(), serverNow: next.serverNow }
    setRemaining(Math.max(0, (next.deadline ?? next.serverNow) - next.serverNow))
    setState(next)
  }, [])

  useEffect(() => {
    let active = true
    const restore = () => {
      setConnected(true)
      void syncQuiz().then(response => {
        if (!active) return
        if (response.ok) receive(response.data)
        else setMessage(response.error.message)
      })
    }
    const disconnect = () => setConnected(false)
    socket.on('quiz:match', receive)
    socket.on('connect', restore)
    socket.on('disconnect', disconnect)
    if (socket.connected) restore()
    const timer = window.setInterval(() => {
      const c = clock.current
      setRemaining(Math.max(0, c.deadline - c.serverNow - (performance.now() - c.receivedAt)))
    }, 100)
    const loading = window.setInterval(() => setLoadingIndex(i => (i + 1) % loadingLines.length), 3500)
    return () => {
      active = false
      socket.off('quiz:match', receive); socket.off('connect', restore); socket.off('disconnect', disconnect)
      window.clearInterval(timer); window.clearInterval(loading)
    }
  }, [receive])

  const answer = useCallback(async (choice: number) => {
    if (!state?.question || state.phase !== 'QUESTION' || state.ownAnswer !== null || busy.current || !connected || remaining <= 0) return
    busy.current = true; setPending(true); setMessage(null)
    try {
      const response = await submitQuizAnswer(state.question.id, choice)
      if (response.ok) receive(response.data)
      else setMessage(response.error.message)
    } finally { busy.current = false; setPending(false) }
  }, [state, connected, remaining, receive])

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.repeat || event.altKey || event.ctrlKey || event.metaKey || document.querySelector('[role="dialog"]')) return
      const index = '1234'.indexOf(event.key) >= 0 ? '1234'.indexOf(event.key) : letters.indexOf(event.key.toUpperCase())
      if (index >= 0) { event.preventDefault(); void answer(index) }
    }
    window.addEventListener('keydown', keydown)
    return () => window.removeEventListener('keydown', keydown)
  }, [answer])

  const act = async (action: 'next' | 'again' | 'menu' | 'games') => {
    if (busy.current || !connected) return
    busy.current = true; setPending(true); setMessage(null)
    try {
      if (action === 'next') {
        const response = await nextQuizQuestion()
        if (response.ok) receive(response.data)
        else setMessage(response.error.message)
      } else if (action === 'again') {
        const response = await startFourChoice()
        if (!response.ok) setMessage(response.error.message)
      } else {
        const response = await quizMenu()
        if (!response.ok) { setMessage(response.error.message); return }
        if (action === 'games') await returnToGameSelection()
      }
    } finally { busy.current = false; setPending(false) }
  }

  const seconds = Math.ceil(remaining / 1000)
  const phase = state?.phase
  const correct = state?.ownAnswer !== null && state?.ownAnswer === state?.correctAnswer
  const ownStanding = state?.standings.find(p => p.playerId === playerId)
  const winner = state?.standings[0]
  const winners = state?.standings.filter(p => p.rank === 1) ?? []
  const revealed = phase === 'ANSWER_REVEAL'

  return (
    <section className="quiz-play">
      <header className="quiz-play__bar">
        <div><span className="eyebrow">FOUR CHOICE</span><strong>Room {room.code}</strong></div>
        <span className="quiz-play__score">{(ownStanding?.score ?? 0).toLocaleString()} <small>points</small></span>
        <Button variant="quiet" onClick={onLeave}>Leave room</Button>
      </header>
      {!connected ? <p className="quiz-alert" role="status">Connection lost. Reconnecting… Your answer and score are saved.</p> : null}
      {message ? <p className="quiz-alert" role="alert">{message}</p> : null}

      {!state ? <div className="quiz-center"><span className="large-loader" /><h1>Rejoining the action…</h1></div> : null}

      {phase === 'GENERATING' ? <div className="quiz-center quiz-center--purple">
        <div className="quiz-loading-mark" aria-hidden="true">✳</div>
        <p className="eyebrow">A FRESH MATCH, JUST FOR YOUR ROOM</p>
        <h1>Building your quiz.</h1>
        <p aria-live="polite">{loadingLines[loadingIndex]}</p>
        <small>Preparing and reviewing all {state?.questionCount} questions before we begin. This can take a few minutes.</small>
        {isHost ? <Button variant="secondary" disabled={pending || !connected} onClick={() => void act('menu')}>Back to settings</Button> : null}
      </div> : null}

      {phase === 'ERROR' ? <div className="quiz-center">
        <div className="quiz-big-symbol" aria-hidden="true">!</div><h1>A small party delay.</h1>
        <p>{state?.error}</p>
        {isHost ? <div className="quiz-buttons"><Button disabled={pending || !connected} onClick={() => void act('again')}>Try again</Button><Button variant="quiet" disabled={pending || !connected} onClick={() => void act('menu')}>Back to settings</Button></div> : <p>Waiting for the host to try again.</p>}
      </div> : null}

      {phase === 'INTRO' || phase === 'QUESTION_INTRO' ? <div className="quiz-center quiz-center--purple" key={`${state?.matchId}-${phase}-${state?.questionNumber}`}>
        <p className="eyebrow">{phase === 'INTRO' ? 'QUIZ READY. EVERYONE IN?' : 'BE CORRECT. BE FAST.'}</p>
        <h1>{phase === 'INTRO' ? 'Here we go!' : state?.questionNumber === state?.questionCount ? 'Final question!' : `Question ${state?.questionNumber}`}</h1>
        <div className="quiz-countdown" key={seconds}>{phase === 'INTRO' ? seconds || 'GO!' : '✦'}</div>
      </div> : null}

      {(phase === 'QUESTION' || revealed) && state?.question ? <div className="quiz-question" key={state.question.id}>
        <div className="quiz-question__meta"><span>QUESTION {state.questionNumber} / {state.questionCount}</span><span className={`quiz-clock ${seconds <= 5 && !revealed ? 'is-urgent' : ''}`} aria-label={revealed ? 'Answers revealed' : `${seconds} seconds remaining`}>{revealed ? '✓' : seconds}</span></div>
        <div className="quiz-timer-track" aria-hidden="true"><span style={{width: `${revealed ? 0 : Math.min(100, remaining / (state.timePerQuestion * 10))}%`}} /></div>
        <p className="eyebrow quiz-category">{FOUR_CHOICE_CATEGORIES.find(c => c.id === state.question?.category)?.label}</p>
        <h1>{state.question.text}</h1>
        <div className="quiz-answer-grid">
          {state.question.answers.map((option, index) => <button
            key={index}
            className={`quiz-answer quiz-answer--${index} ${state.ownAnswer === index ? 'is-picked' : ''} ${revealed ? state.correctAnswer === index ? 'is-correct' : 'is-wrong' : ''}`}
            disabled={revealed || pending || state.ownAnswer !== null || !connected || remaining <= 0}
            aria-pressed={state.ownAnswer === index}
            onClick={() => void answer(index)}>
            <span className="quiz-answer__letter">{letters[index]}</span><strong>{option}</strong>
            <span className="quiz-answer__mark" aria-hidden="true">{revealed && state.correctAnswer === index ? '✓' : state.ownAnswer === index ? revealed ? '×' : '●' : ''}</span>
          </button>)}
        </div>
        <div className="quiz-answer-status" aria-live="polite">
          {revealed ? <><strong>{state.ownAnswer === null ? 'No answer this time.' : correct ? 'You got it!' : 'Not this time!'}</strong><span className="quiz-points" key={state.question.id}>+{state.ownPoints ?? 0}</span><p>Correct answer: {letters[state.correctAnswer!]} — {state.question.answers[state.correctAnswer!]}</p></> : <>
            <strong>{pending ? 'Locking your answer…' : state.ownAnswer !== null ? `Answer locked: ${letters[state.ownAnswer]} — ${state.question.answers[state.ownAnswer]}` : seconds === 0 ? 'Time’s up. Locking answers…' : 'Make your choice.'}</strong>
            <p>{state.answeredCount} / {state.playerCount} answered {state.answeredCount === state.playerCount ? '· Everyone’s in!' : ''}</p>
            <small>Keyboard: A–D or 1–4</small>
          </>}
        </div>
      </div> : null}

      {(phase === 'LEADERBOARD' || phase === 'FINAL_RESULTS') && state ? <section className="quiz-results" key={`${phase}-${state.questionNumber}`}>
        {phase === 'FINAL_RESULTS' && winner ? <div className="quiz-winner">
          <div className="quiz-confetti" aria-hidden="true">✦ ● ✳ ◆ ✦ ● ✳</div>
          <p className="eyebrow">{winners.length > 1 ? 'SHARED VICTORY' : 'TONIGHT’S BRAGGING RIGHTS GO TO…'}</p>
          <span className="quiz-crown" aria-hidden="true">♛</span><div className="quiz-winner__avatar"><AvatarArt avatar={winner.avatar} /></div>
          <h1>{winners.map(p => p.name).join(' & ')}</h1><p>{winner.score.toLocaleString()} points</p>
        </div> : <><p className="eyebrow">QUESTION {state.questionNumber} / {state.questionCount}</p><h1>The leaderboard.</h1><p className="quiz-results__subtitle">A little friendly competition never hurt.</p></>}
        <ol className="quiz-standings" aria-label={phase === 'FINAL_RESULTS' ? 'Final results' : 'Leaderboard'}>
          {state.standings.map((p, index) => <li key={p.playerId} className={p.playerId === playerId ? 'is-you' : ''} style={{animationDelay: `${phase === 'FINAL_RESULTS' ? Math.max(0, 2 - index) * .5 : index * .08}s`}}>
            <span className="quiz-rank">{p.rank}</span><span className="quiz-standing-avatar"><AvatarArt avatar={p.avatar} /></span>
            <div className="quiz-standing-name"><strong>{p.name}{p.playerId === playerId ? ' (you)' : ''}</strong><small>{p.isConnected ? `+${p.points} this question` : 'Reconnecting…'}</small></div>
            <span className="quiz-rank-change" aria-label={`Rank change ${p.previousRank - p.rank}`}>{p.previousRank === p.rank ? '—' : p.previousRank > p.rank ? `▲ ${p.previousRank - p.rank}` : `▼ ${p.rank - p.previousRank}`}</span>
            <strong>{p.score.toLocaleString()}</strong>
          </li>)}
        </ol>
        {isHost ? phase === 'FINAL_RESULTS' ? <div className="quiz-buttons"><Button disabled={pending || !connected} onClick={() => void act('again')}>Play again ↗</Button><Button variant="secondary" disabled={pending || !connected} onClick={() => void act('menu')}>Game settings</Button><Button variant="quiet" disabled={pending || !connected} onClick={() => void act('games')}>Change game</Button></div> : <div className="quiz-next"><p>{seconds > 0 ? `Take it in. Next question available in ${seconds}s.` : 'Ready when you are. The host sets the pace.'}</p><Button size="large" disabled={seconds > 0 || pending || !connected} onClick={() => void act('next')}>Next question →</Button></div> : <p className="quiz-wait">{seconds > 0 && phase === 'LEADERBOARD' ? `Next question available in ${seconds}s` : 'Waiting for the host…'}</p>}
      </section> : null}
    </section>
  )
}
