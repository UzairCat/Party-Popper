import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Button } from '../components/common/Button'
import { Modal } from '../components/common/Modal'
import { Toast } from '../components/common/Toast'
import { PlayerCard } from '../components/player/PlayerCard'
import { RoomCodeCard } from '../components/room/RoomCodeCard'
import { SettingsPanel } from '../components/room/SettingsPanel'
import {
  closeRoom as closeRoomOnServer,
  disconnectSocket,
  ensureSocketConnected,
  kickPlayer,
  leaveRoom as leaveRoomOnServer,
  reconnectRoom,
  socket,
  startGame,
  transferHost,
  updateReady,
  updateRoomSettings,
} from '../lib/socket'
import { clearSession, loadSession } from '../lib/session'
import { normaliseRoomCode, ROOM_CODE_LENGTH } from '../lib/validation'
import type { Player, RoomSettings, RoomSnapshot, SessionCredentials } from '../types/room'

type PlayerAction = 'kick' | 'transfer'
type ConnectionState = 'connecting' | 'connected' | 'reconnecting'

interface PendingPlayerAction {
  action: PlayerAction
  player: Player
}

export function LobbyPage() {
  const { roomCode: routeRoomCode } = useParams()
  const navigate = useNavigate()
  const roomCode = normaliseRoomCode(routeRoomCode ?? '')
  const initialSession =
    roomCode.length === ROOM_CODE_LENGTH ? loadSession(roomCode) : null
  const toastTimer = useRef<number | undefined>(undefined)
  const [session, setSession] = useState<SessionCredentials | null>(initialSession)
  const [room, setRoom] = useState<RoomSnapshot | null>(null)
  const [connectionState, setConnectionState] = useState<ConnectionState>('connecting')
  const [pageError, setPageError] = useState<string | null>(() => {
    if (roomCode.length !== ROOM_CODE_LENGTH) return 'That room code is not valid.'
    if (!initialSession) {
      return 'Join this room first so the server can verify your player session.'
    }
    return null
  })
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [pendingPlayerAction, setPendingPlayerAction] = useState<PendingPlayerAction | null>(null)
  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false)
  const [closeDialogOpen, setCloseDialogOpen] = useState(false)
  const [gameDialogOpen, setGameDialogOpen] = useState(false)
  const [actionPending, setActionPending] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  const notify = useCallback((message: string) => {
    window.clearTimeout(toastTimer.current)
    setToast(message)
    toastTimer.current = window.setTimeout(() => setToast(null), 2800)
  }, [])

  useEffect(() => {
    let cancelled = false
    let restoreInFlight = false

    if (roomCode.length !== ROOM_CODE_LENGTH || !session) return

    const endSession = (message: string) => {
      clearSession()
      setSession(null)
      setRoom(null)
      setSettingsOpen(false)
      setPageError(message)
      disconnectSocket()
    }

    const restoreSession = async () => {
      if (restoreInFlight) return
      restoreInFlight = true

      try {
        const response = await reconnectRoom(session)
        if (cancelled) return

        if (!response.ok) {
          endSession(response.error.message)
          return
        }

        setRoom(response.data)
        setPageError(null)
        setConnectionState('connected')
      } catch (error) {
        if (!cancelled) {
          setPageError(
            error instanceof Error ? error.message : 'Could not reconnect to this room.',
          )
        }
      } finally {
        restoreInFlight = false
      }
    }

    const handleConnect = () => {
      setConnectionState('connected')
      void restoreSession()
    }
    const handleDisconnect = () => setConnectionState('reconnecting')
    const handleRoomState = (nextRoom: RoomSnapshot) => setRoom(nextRoom)
    const handleNotice = ({ message }: { message: string }) => notify(message)
    const handleRoomClosed = ({ message }: { message: string }) => endSession(message)
    const handleKicked = ({ message }: { message: string }) => endSession(message)
    const handleSessionEnded = ({ message }: { message: string }) => endSession(message)
    const handleGamePlaceholder = () => setGameDialogOpen(true)

    socket.on('connect', handleConnect)
    socket.on('disconnect', handleDisconnect)
    socket.on('room:state', handleRoomState)
    socket.on('room:notice', handleNotice)
    socket.on('room:closed', handleRoomClosed)
    socket.on('player:kicked', handleKicked)
    socket.on('session:ended', handleSessionEnded)
    socket.on('game:placeholder', handleGamePlaceholder)

    if (socket.connected) {
      void restoreSession()
    } else {
      void ensureSocketConnected().catch((error: unknown) => {
        if (!cancelled) {
          setPageError(
            error instanceof Error ? error.message : 'Could not connect to the game server.',
          )
        }
      })
    }

    return () => {
      cancelled = true
      window.clearTimeout(toastTimer.current)
      socket.off('connect', handleConnect)
      socket.off('disconnect', handleDisconnect)
      socket.off('room:state', handleRoomState)
      socket.off('room:notice', handleNotice)
      socket.off('room:closed', handleRoomClosed)
      socket.off('player:kicked', handleKicked)
      socket.off('session:ended', handleSessionEnded)
      socket.off('game:placeholder', handleGamePlaceholder)
      disconnectSocket()
    }
  }, [notify, roomCode, session])

  const currentPlayerId = session?.playerId
  const currentPlayer = room?.players.find((player) => player.id === currentPlayerId)
  const isCurrentPlayerHost = Boolean(room && currentPlayerId === room.hostId)
  const requiredPlayers = room?.players.filter((player) => player.id !== room.hostId) ?? []
  const waitingCount = requiredPlayers.filter(
    (player) => !player.isReady || !player.isConnected,
  ).length
  const disconnectedCount = room?.players.filter((player) => !player.isConnected).length ?? 0
  const connectedPlayerCount = room?.players.length
    ? room.players.length - disconnectedCount
    : 0
  const canStart = Boolean(
    room &&
      connectedPlayerCount >= 2 &&
      (!room.settings.requireReady || waitingCount === 0),
  )

  const runAction = async (action: () => Promise<void>) => {
    if (actionPending) return
    setActionPending(true)
    try {
      await action()
    } finally {
      setActionPending(false)
    }
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
    void runAction(async () => {
      const response = await updateRoomSettings(nextSettings)
      if (!response.ok) {
        notify(response.error.message)
        return
      }

      setRoom(response.data)
      notify('Room settings updated.')
    })
  }

  const handlePlayerAction = () => {
    if (!pendingPlayerAction) return
    const selectedAction = pendingPlayerAction

    void runAction(async () => {
      const response =
        selectedAction.action === 'kick'
          ? await kickPlayer(selectedAction.player.id)
          : await transferHost(selectedAction.player.id)

      if (!response.ok) {
        notify(response.error.message)
        return
      }

      setRoom(response.data)
      notify(
        selectedAction.action === 'kick'
          ? `${selectedAction.player.name} was removed.`
          : `${selectedAction.player.name} is now the host.`,
      )
      setPendingPlayerAction(null)
    })
  }

  const toggleReady = () => {
    if (!currentPlayer) return

    void runAction(async () => {
      const response = await updateReady(!currentPlayer.isReady)
      if (!response.ok) {
        notify(response.error.message)
        return
      }

      setRoom(response.data)
      notify(response.data.players.find((player) => player.id === currentPlayer.id)?.isReady
        ? 'You’re ready!'
        : 'You’re no longer ready.')
    })
  }

  const confirmLeave = () => {
    void runAction(async () => {
      const response = await leaveRoomOnServer()
      if (!response.ok) {
        notify(response.error.message)
        return
      }

      clearSession()
      setSession(null)
      disconnectSocket()
      navigate('/', { replace: true })
    })
  }

  const confirmClose = () => {
    void runAction(async () => {
      const response = await closeRoomOnServer()
      if (!response.ok) {
        notify(response.error.message)
        return
      }

      clearSession()
      setSession(null)
      disconnectSocket()
      navigate('/', { replace: true })
    })
  }

  const handleStart = () => {
    void runAction(async () => {
      const response = await startGame()
      if (!response.ok) notify(response.error.message)
    })
  }

  if (pageError) {
    return (
      <section className="lobby-page page-enter">
        <div className="lobby-message-card" role="alert">
          <div className="not-found__mark" aria-hidden="true">!</div>
          <p className="eyebrow eyebrow--accent">Room unavailable</p>
          <h1>We couldn’t open this lobby.</h1>
          <p>{pageError}</p>
          <div className="lobby-message-card__actions">
            <Link className="button button--primary button--large" to={`/join/${roomCode}`}>
              Join room
            </Link>
            <Link className="button button--quiet button--large" to="/">
              Back home
            </Link>
          </div>
        </div>
      </section>
    )
  }

  if (!room || !currentPlayer) {
    return (
      <section className="lobby-page page-enter">
        <div className="lobby-message-card" role="status">
          <span className="large-loader" aria-hidden="true" />
          <p className="eyebrow eyebrow--accent">Connecting</p>
          <h1>Opening room {roomCode}…</h1>
          <p>Restoring your player session.</p>
        </div>
      </section>
    )
  }

  const lobbyMessage =
    room.players.length < 2
      ? 'Waiting for more players…'
      : disconnectedCount > 0
        ? `Waiting for ${disconnectedCount} ${disconnectedCount === 1 ? 'player' : 'players'} to reconnect…`
      : waitingCount > 0 && room.settings.requireReady
        ? `Waiting for ${waitingCount} ${waitingCount === 1 ? 'player' : 'players'}…`
        : isCurrentPlayerHost
          ? 'Everyone’s ready — start whenever you want.'
          : 'Everyone’s ready! The host can start the game.'

  return (
    <section className="lobby-page page-enter">
      <div className="lobby-toolbar">
        <div>
          <div className={`connection-chip connection-chip--${connectionState}`}>
            <span aria-hidden="true" />
            {connectionState === 'connected'
              ? 'Connected'
              : connectionState === 'reconnecting'
                ? 'Reconnecting…'
                : 'Connecting…'}
          </div>
          <h1>Party lobby</h1>
          <p className="prototype-label">Live room · server synchronized</p>
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
        code={room.code}
        onCopyCode={() => void copyText(room.code, 'Room code copied!')}
        onCopyInvite={() =>
          void copyText(`${window.location.origin}/join/${room.code}`, 'Invite link copied!')
        }
      />

      <section className="players-section" aria-labelledby="players-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">The group</p>
            <h2 id="players-title">Players</h2>
          </div>
          <span className="player-count">
            {room.players.length} / {room.settings.maxPlayers}
          </span>
        </div>

        <div className="player-grid">
          {room.players.map((player) => (
            <PlayerCard
              key={player.id}
              player={player}
              isHost={player.id === room.hostId}
              isCurrentPlayer={player.id === currentPlayer.id}
              canManage={isCurrentPlayerHost}
              onKick={(selectedPlayer) =>
                setPendingPlayerAction({ action: 'kick', player: selectedPlayer })
              }
              onTransferHost={(selectedPlayer) =>
                setPendingPlayerAction({ action: 'transfer', player: selectedPlayer })
              }
            />
          ))}

          {room.players.length < room.settings.maxPlayers ? (
            <div className="waiting-card">
              <span aria-hidden="true">+</span>
              <strong>Waiting for friends</strong>
              <small>Share code {room.code}</small>
            </div>
          ) : null}
        </div>
      </section>

      <section className="lobby-action-bar" aria-label="Lobby status and controls">
        <div className="lobby-status">
          <span
            className={canStart ? 'lobby-status__icon is-ready' : 'lobby-status__icon'}
            aria-hidden="true"
          >
            {canStart ? '✓' : '…'}
          </span>
          <div>
            <strong>{lobbyMessage}</strong>
            <span>{room.settings.requireReady ? 'Ready check is on' : 'Ready check is off'}</span>
          </div>
        </div>

        {isCurrentPlayerHost ? (
          <Button
            type="button"
            size="large"
            disabled={!canStart || actionPending}
            title={!canStart ? 'At least two connected players must be ready.' : undefined}
            onClick={handleStart}
          >
            Start game <span aria-hidden="true">→</span>
          </Button>
        ) : (
          <Button
            type="button"
            size="large"
            variant={currentPlayer.isReady ? 'secondary' : 'primary'}
            disabled={actionPending || connectionState !== 'connected'}
            onClick={toggleReady}
          >
            {currentPlayer.isReady ? '✓ Ready' : 'I’m ready'}
          </Button>
        )}
      </section>

      {settingsOpen && isCurrentPlayerHost ? (
        <SettingsPanel
          settings={room.settings}
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
              ? 'You’re the host. Host control will transfer to another player.'
              : 'You can rejoin later with the same room code.'
          }
          confirmLabel="Leave room"
          confirmVariant="danger"
          onConfirm={confirmLeave}
          onClose={() => setLeaveDialogOpen(false)}
        />
      ) : null}

      {closeDialogOpen ? (
        <Modal
          title="Close this room?"
          description="Everyone will be disconnected and this room code will stop working."
          confirmLabel="Close room"
          confirmVariant="danger"
          onConfirm={confirmClose}
          onClose={() => setCloseDialogOpen(false)}
        />
      ) : null}

      {gameDialogOpen ? (
        <Modal
          title="Games are coming next!"
          description="The multiplayer lobby is live. Game selection and the first minigame belong to the next phase."
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
