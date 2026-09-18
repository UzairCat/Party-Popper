import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { Button } from '../components/common/Button'
import { Modal } from '../components/common/Modal'
import { Toast } from '../components/common/Toast'
import { PlayerCard } from '../components/player/PlayerCard'
import { RoomCodeCard } from '../components/room/RoomCodeCard'
import { SettingsPanel } from '../components/room/SettingsPanel'
import { DEMO_PLAYERS, DEMO_ROOM_CODE } from '../data/playerOptions'
import { normaliseRoomCode } from '../lib/validation'
import type { LobbyNavigationState, Player, RoomSettings } from '../types/room'

type PlayerAction = 'kick' | 'transfer'

interface PendingPlayerAction {
  action: PlayerAction
  player: Player
}

const CURRENT_PLAYER_ID = 'current-player'

function getNavigationState(value: unknown): LobbyNavigationState | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as Partial<LobbyNavigationState>

  if (
    (candidate.mode === 'host' || candidate.mode === 'guest') &&
    typeof candidate.name === 'string' &&
    typeof candidate.avatar === 'string' &&
    typeof candidate.colour === 'string'
  ) {
    return candidate as LobbyNavigationState
  }

  return null
}

export function LobbyPage() {
  const { roomCode: routeRoomCode } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const navigationState = useMemo(() => getNavigationState(location.state), [location.state])
  const roomCode = normaliseRoomCode(routeRoomCode ?? '') || DEMO_ROOM_CODE
  const joinedAsGuest = navigationState?.mode === 'guest'

  const initialPlayers = useMemo<Player[]>(() => {
    const currentPlayer: Player = {
      id: CURRENT_PLAYER_ID,
      name: navigationState?.name ?? 'Uzair',
      avatar: navigationState?.avatar ?? 'robot',
      colour: navigationState?.colour ?? 'purple',
      isReady: !joinedAsGuest,
      isConnected: true,
    }

    if (joinedAsGuest) {
      return [DEMO_PLAYERS[0], DEMO_PLAYERS[1], currentPlayer]
    }

    return [currentPlayer, DEMO_PLAYERS[1], DEMO_PLAYERS[2]]
  }, [joinedAsGuest, navigationState])

  const [players, setPlayers] = useState(initialPlayers)
  const [hostId, setHostId] = useState(joinedAsGuest ? DEMO_PLAYERS[0].id : CURRENT_PLAYER_ID)
  const [settings, setSettings] = useState<RoomSettings>({
    maxPlayers: 8,
    requireReady: true,
    allowLateJoin: false,
    filterNames: true,
  })
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [pendingPlayerAction, setPendingPlayerAction] = useState<PendingPlayerAction | null>(null)
  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false)
  const [closeDialogOpen, setCloseDialogOpen] = useState(false)
  const [gameDialogOpen, setGameDialogOpen] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const toastTimer = useRef<number | undefined>(undefined)

  useEffect(() => {
    return () => window.clearTimeout(toastTimer.current)
  }, [])

  const currentPlayer = players.find((player) => player.id === CURRENT_PLAYER_ID)
  const isCurrentPlayerHost = hostId === CURRENT_PLAYER_ID
  const requiredPlayers = players.filter((player) => player.id !== hostId)
  const unreadyCount = requiredPlayers.filter((player) => !player.isReady).length
  const canStart = players.length >= 2 && (!settings.requireReady || unreadyCount === 0)

  const notify = (message: string) => {
    window.clearTimeout(toastTimer.current)
    setToast(message)
    toastTimer.current = window.setTimeout(() => setToast(null), 2600)
  }

  const copyText = async (value: string, successMessage: string) => {
    try {
      await navigator.clipboard.writeText(value)
      notify(successMessage)
    } catch {
      notify('Copy failed — select the room code instead.')
    }
  }

  const handleSettingsChange = (nextSettings: RoomSettings) => {
    setSettings(nextSettings)
    notify('Room settings updated.')
  }

  const handlePlayerAction = () => {
    if (!pendingPlayerAction) return

    if (pendingPlayerAction.action === 'kick') {
      setPlayers((currentPlayers) =>
        currentPlayers.filter((player) => player.id !== pendingPlayerAction.player.id),
      )
      notify(`${pendingPlayerAction.player.name} was removed.`)
    } else {
      setHostId(pendingPlayerAction.player.id)
      setSettingsOpen(false)
      notify(`${pendingPlayerAction.player.name} is now the host.`)
    }

    setPendingPlayerAction(null)
  }

  const toggleReady = () => {
    if (!currentPlayer) return
    const nextReadyState = !currentPlayer.isReady

    setPlayers((currentPlayers) =>
      currentPlayers.map((player) =>
        player.id === CURRENT_PLAYER_ID ? { ...player, isReady: nextReadyState } : player,
      ),
    )
    notify(nextReadyState ? 'You’re ready!' : 'You’re no longer ready.')
  }

  const lobbyMessage =
    players.length < 2
      ? 'Waiting for more players…'
      : unreadyCount > 0 && settings.requireReady
        ? `Waiting for ${unreadyCount} ${unreadyCount === 1 ? 'player' : 'players'} to get ready…`
        : isCurrentPlayerHost
          ? 'Everyone’s ready — start whenever you want.'
          : 'Everyone’s ready! The host can start the game.'

  return (
    <section className="lobby-page page-enter">
      <div className="lobby-toolbar">
        <div>
          <div className="connection-chip">
            <span aria-hidden="true" /> Connected
          </div>
          <h1>Party lobby</h1>
          <p className="prototype-label">Layout preview · sample players</p>
        </div>
        <div className="lobby-toolbar__actions">
          {isCurrentPlayerHost ? (
            <Button type="button" variant="secondary" onClick={() => setSettingsOpen(true)}>
              <span aria-hidden="true">⚙</span> Room settings
            </Button>
          ) : null}
          <Button type="button" variant="quiet" onClick={() => setLeaveDialogOpen(true)}>
            Leave room
          </Button>
        </div>
      </div>

      <RoomCodeCard
        code={roomCode}
        onCopyCode={() => void copyText(roomCode, 'Room code copied!')}
        onCopyInvite={() =>
          void copyText(
            `${window.location.origin}/join/${roomCode}`,
            'Invite link copied!',
          )
        }
      />

      <section className="players-section" aria-labelledby="players-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">The group</p>
            <h2 id="players-title">Players</h2>
          </div>
          <span className="player-count">
            {players.length} / {settings.maxPlayers}
          </span>
        </div>

        <div className="player-grid">
          {players.map((player) => (
            <PlayerCard
              key={player.id}
              player={player}
              isHost={player.id === hostId}
              isCurrentPlayer={player.id === CURRENT_PLAYER_ID}
              canManage={isCurrentPlayerHost}
              onKick={(selectedPlayer) =>
                setPendingPlayerAction({ action: 'kick', player: selectedPlayer })
              }
              onTransferHost={(selectedPlayer) =>
                setPendingPlayerAction({ action: 'transfer', player: selectedPlayer })
              }
            />
          ))}

          {players.length < settings.maxPlayers ? (
            <div className="waiting-card">
              <span aria-hidden="true">+</span>
              <strong>Waiting for friends</strong>
              <small>Share code {roomCode}</small>
            </div>
          ) : null}
        </div>
      </section>

      <section className="lobby-action-bar" aria-label="Lobby status and controls">
        <div className="lobby-status">
          <span className={canStart ? 'lobby-status__icon is-ready' : 'lobby-status__icon'} aria-hidden="true">
            {canStart ? '✓' : '…'}
          </span>
          <div>
            <strong>{lobbyMessage}</strong>
            <span>{settings.requireReady ? 'Ready check is on' : 'Ready check is off'}</span>
          </div>
        </div>

        {isCurrentPlayerHost ? (
          <Button
            type="button"
            size="large"
            disabled={!canStart}
            title={!canStart ? 'At least two players and all required players must be ready.' : undefined}
            onClick={() => setGameDialogOpen(true)}
          >
            Start game <span aria-hidden="true">→</span>
          </Button>
        ) : (
          <Button
            type="button"
            size="large"
            variant={currentPlayer?.isReady ? 'secondary' : 'primary'}
            onClick={toggleReady}
          >
            {currentPlayer?.isReady ? '✓ Ready' : 'I’m ready'}
          </Button>
        )}
      </section>

      {settingsOpen && isCurrentPlayerHost ? (
        <SettingsPanel
          settings={settings}
          onChange={handleSettingsChange}
          onClose={() => setSettingsOpen(false)}
          onCloseRoom={() => {
            setSettingsOpen(false)
            setCloseDialogOpen(true)
          }}
        />
      ) : null}

      {pendingPlayerAction ? (
        <Modal
          title={
            pendingPlayerAction.action === 'kick'
              ? `Remove ${pendingPlayerAction.player.name}?`
              : `Make ${pendingPlayerAction.player.name} the host?`
          }
          description={
            pendingPlayerAction.action === 'kick'
              ? 'They’ll leave this lobby and will need the room code to come back.'
              : 'You’ll become a regular player and they’ll get the host controls.'
          }
          confirmLabel={pendingPlayerAction.action === 'kick' ? 'Remove player' : 'Make host'}
          confirmVariant={pendingPlayerAction.action === 'kick' ? 'danger' : 'primary'}
          onConfirm={handlePlayerAction}
          onClose={() => setPendingPlayerAction(null)}
        />
      ) : null}

      {leaveDialogOpen ? (
        <Modal
          title="Leave this room?"
          description={
            isCurrentPlayerHost
              ? 'You’re the host. Host control would transfer to another player in the live version.'
              : 'You can rejoin later with the same room code.'
          }
          confirmLabel="Leave room"
          confirmVariant="danger"
          onConfirm={() => navigate('/')}
          onClose={() => setLeaveDialogOpen(false)}
        />
      ) : null}

      {closeDialogOpen ? (
        <Modal
          title="Close this room?"
          description="Everyone will be disconnected and this room code will stop working."
          confirmLabel="Close room"
          confirmVariant="danger"
          onConfirm={() => navigate('/')}
          onClose={() => setCloseDialogOpen(false)}
        />
      ) : null}

      {gameDialogOpen ? (
        <Modal
          title="Games are coming next!"
          description="The lobby shell is ready. Game selection and the first minigame belong to the next phase."
          onClose={() => setGameDialogOpen(false)}
        >
          <div className="coming-soon-card">
            <span aria-hidden="true">🎉</span>
            <strong>Game select</strong>
            <small>Coming in Phase 2</small>
          </div>
        </Modal>
      ) : null}

      {toast ? <Toast message={toast} /> : null}
    </section>
  )
}
