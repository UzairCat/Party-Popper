import { useState, type CSSProperties } from 'react'
import {
  FOUR_CHOICE_CATEGORIES,
  FOUR_CHOICE_DIFFICULTIES,
  FOUR_CHOICE_QUESTION_MAX,
  FOUR_CHOICE_QUESTION_MIN,
  FOUR_CHOICE_QUESTION_STEP,
  FOUR_CHOICE_TIME_MAX,
  FOUR_CHOICE_TIME_MIN,
  FOUR_CHOICE_TIME_STEP,
  type FourChoiceCategoryId,
  type FourChoiceDifficulty,
  type FourChoiceSettings,
  type FourChoiceSetupSnapshot,
} from '../../../shared/four-choice'
import { Button } from '../../components/common/Button'
import { getAvatarEmoji, getColourHex } from '../../data/playerOptions'
import type { RoomSnapshot } from '../../types/room'
import { CategorySelector } from './CategorySelector'

interface FourChoiceMenuProps {
  room: RoomSnapshot
  currentPlayerId: string
  setup: FourChoiceSetupSnapshot
  isPending: boolean
  onSettingsChange: (settings: FourChoiceSettings) => void
  onBackToGames: () => void
  onStart: () => void
  onLeave: () => void
}

interface StepperProps {
  label: string
  value: number
  suffix: string
  minimum: number
  maximum: number
  step: number
  canEdit: boolean
  disabled: boolean
  onChange: (value: number) => void
}

function Stepper({
  label,
  value,
  suffix,
  minimum,
  maximum,
  step,
  canEdit,
  disabled,
  onChange,
}: StepperProps) {
  if (!canEdit) {
    return <strong className="quiz-setting__readout">{value} {suffix}</strong>
  }

  return (
    <div className="quiz-stepper" aria-label={`${label}: ${value} ${suffix}`}>
      <button
        type="button"
        aria-label={`Decrease ${label}`}
        disabled={disabled || value <= minimum}
        onClick={() => onChange(Math.max(minimum, value - step))}
      >
        −
      </button>
      <strong>
        {value}
        <small>{suffix}</small>
      </strong>
      <button
        type="button"
        aria-label={`Increase ${label}`}
        disabled={disabled || value >= maximum}
        onClick={() => onChange(Math.min(maximum, value + step))}
      >
        +
      </button>
    </div>
  )
}

function titleCase(value: string) {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`
}

export function FourChoiceMenu({
  room,
  currentPlayerId,
  setup,
  isPending,
  onSettingsChange,
  onBackToGames,
  onStart,
  onLeave,
}: FourChoiceMenuProps) {
  const [categoriesOpen, setCategoriesOpen] = useState(false)
  const isHost = room.hostId === currentPlayerId
  const settings = setup.settings
  const connectedPlayers = room.players.filter((player) => player.isConnected)
  const allCategoriesSelected = settings.categories.length === FOUR_CHOICE_CATEGORIES.length
  const canStart = connectedPlayers.length >= 2 && settings.categories.length > 0

  const updateSetting = <Key extends keyof FourChoiceSettings>(
    key: Key,
    value: FourChoiceSettings[Key],
  ) => {
    if (!isHost || isPending) return
    onSettingsChange({ ...settings, [key]: value })
  }

  const startHint =
    connectedPlayers.length < 2
      ? 'At least two connected players are required.'
      : settings.categories.length === 0
        ? 'Select at least one category.'
        : 'The quiz is ready to prepare.'

  return (
    <section className="quiz-menu-page page-enter">
      <header className="quiz-menu-toolbar">
        <div className="quiz-menu-toolbar__room">
          <span>Room</span>
          <strong>{room.code}</strong>
        </div>
        <div className="quiz-menu-toolbar__players" aria-label={`${connectedPlayers.length} connected players`}>
          <div aria-hidden="true">
            {room.players.map((player) => (
              <span
                key={player.id}
                className={!player.isConnected ? 'is-away' : ''}
                style={{ '--player-colour': getColourHex(player.colour) } as CSSProperties}
              >
                {getAvatarEmoji(player.avatar)}
              </span>
            ))}
          </div>
          <strong>{connectedPlayers.length} connected</strong>
        </div>
        <Button type="button" variant="quiet" disabled={isPending} onClick={onLeave}>
          Leave room
        </Button>
      </header>

      <div className="quiz-menu-hero">
        <div className="quiz-menu-hero__mark" aria-hidden="true">
          <span>A</span><span>B</span><span>C</span><span>D</span>
          <strong>?</strong>
        </div>
        <div>
          <p className="eyebrow">Trivia · Classic</p>
          <h1>Four Choice</h1>
          <p>Read the question. Pick one of four answers. Be correct. Be fast.</p>
        </div>
        <span className="quiz-role-chip">{isHost ? 'Host controls' : 'Player view'}</span>
      </div>

      <div className="quiz-menu-layout">
        <section className="quiz-menu-card" aria-labelledby="mode-title">
          <div className="quiz-menu-card__heading">
            <div>
              <p className="eyebrow">Game mode</p>
              <h2 id="mode-title">Classic</h2>
            </div>
            <span className="selected-chip">✓ Selected</span>
          </div>
          <div className="mode-card">
            <span className="mode-card__icon" aria-hidden="true">⚡</span>
            <div>
              <strong>Free-for-all</strong>
              <p>Everyone plays individually. Correct and faster answers earn more points.</p>
            </div>
          </div>
        </section>

        <section className="quiz-menu-card quiz-menu-card--settings" aria-labelledby="settings-title">
          <div className="quiz-menu-card__heading">
            <div>
              <p className="eyebrow">Match setup</p>
              <h2 id="settings-title">Settings</h2>
            </div>
            {!isHost ? <span className="live-sync-chip">● Live</span> : null}
          </div>

          <div className="quiz-settings-list">
            <div className="quiz-setting quiz-setting--categories">
              <div>
                <span>Categories</span>
                <strong>
                  {allCategoriesSelected ? 'All Categories' : `${settings.categories.length} selected`}
                </strong>
              </div>
              <Button type="button" variant="secondary" onClick={() => setCategoriesOpen(true)}>
                {isHost ? 'Edit' : 'View'} <span aria-hidden="true">→</span>
              </Button>
            </div>

            <div className="quiz-setting">
              <div>
                <span>Time per question</span>
                <small>How long everyone has to answer</small>
              </div>
              <Stepper
                label="time per question"
                value={settings.timePerQuestion}
                suffix="sec"
                minimum={FOUR_CHOICE_TIME_MIN}
                maximum={FOUR_CHOICE_TIME_MAX}
                step={FOUR_CHOICE_TIME_STEP}
                canEdit={isHost}
                disabled={isPending}
                onChange={(value) => updateSetting('timePerQuestion', value)}
              />
            </div>

            <div className="quiz-setting">
              <div>
                <span>Amount of questions</span>
                <small>Five to one hundred questions</small>
              </div>
              <Stepper
                label="question count"
                value={settings.questionCount}
                suffix="questions"
                minimum={FOUR_CHOICE_QUESTION_MIN}
                maximum={FOUR_CHOICE_QUESTION_MAX}
                step={FOUR_CHOICE_QUESTION_STEP}
                canEdit={isHost}
                disabled={isPending}
                onChange={(value) => updateSetting('questionCount', value)}
              />
            </div>

            <div className="quiz-setting quiz-setting--difficulty">
              <div>
                <span>Difficulty</span>
                <small>How specific and challenging questions feel</small>
              </div>
              {isHost ? (
                <div className="difficulty-control" role="group" aria-label="Difficulty">
                  {FOUR_CHOICE_DIFFICULTIES.map((difficulty) => (
                    <button
                      key={difficulty}
                      className={settings.difficulty === difficulty ? 'is-selected' : ''}
                      type="button"
                      aria-pressed={settings.difficulty === difficulty}
                      disabled={isPending}
                      onClick={() => updateSetting('difficulty', difficulty as FourChoiceDifficulty)}
                    >
                      {titleCase(difficulty)}
                    </button>
                  ))}
                </div>
              ) : (
                <strong className="quiz-setting__readout">{titleCase(settings.difficulty)}</strong>
              )}
            </div>
          </div>
        </section>
      </div>

      <footer className="quiz-menu-actions">
        <div className={`quiz-start-status ${canStart ? 'is-ready' : ''}`} role="status">
          <span aria-hidden="true">{canStart ? '✓' : '!'}</span>
          <div>
            <strong>{canStart ? 'Ready to start' : 'Not ready yet'}</strong>
            <small>{startHint}</small>
          </div>
        </div>
        {isHost ? (
          <div className="quiz-menu-actions__buttons">
            <Button type="button" variant="quiet" disabled={isPending} onClick={onBackToGames}>
              Back to games
            </Button>
            <Button
              type="button"
              size="large"
              disabled={!canStart || isPending}
              title={!canStart ? startHint : undefined}
              onClick={onStart}
            >
              Start game <span aria-hidden="true">→</span>
            </Button>
          </div>
        ) : (
          <div className="waiting-for-host" role="status">
            <span aria-hidden="true" />
            Waiting for the host to start…
          </div>
        )}
      </footer>

      {categoriesOpen ? (
        <CategorySelector
          selected={settings.categories}
          canEdit={isHost}
          isPending={isPending}
          onChange={(categories: FourChoiceCategoryId[]) => updateSetting('categories', categories)}
          onClose={() => setCategoriesOpen(false)}
        />
      ) : null}
    </section>
  )
}
