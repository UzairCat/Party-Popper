interface RoomCodeCardProps {
  code: string
  onCopyCode: () => void
  onCopyInvite: () => void
}

export function RoomCodeCard({
  code,
  onCopyCode,
  onCopyInvite,
}: RoomCodeCardProps) {
  return (
    <section className="room-code-card" aria-labelledby="room-code-title">
      <div>
        <p className="eyebrow" id="room-code-title">
          Join with room code
        </p>
        <div className="room-code" aria-label={`Room code ${code.split('').join(' ')}`}>
          {code}
        </div>
        <p className="room-code-card__hint">Share it with everyone playing</p>
      </div>
      <div className="room-code-card__actions">
        <button className="button button--secondary" type="button" onClick={onCopyCode}>
          Copy code
        </button>
        <button className="text-button" type="button" onClick={onCopyInvite}>
          Copy invite link
        </button>
      </div>
    </section>
  )
}
