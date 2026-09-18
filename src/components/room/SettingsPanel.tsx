import { useEffect, useId } from 'react'
import type { RoomSettings } from '../../types/room'
import { Button } from '../common/Button'

interface SettingsPanelProps {
  settings: RoomSettings
  onChange: (settings: RoomSettings) => void
  onClose: () => void
  onCloseRoom: () => void
}

interface ToggleRowProps {
  checked: boolean
  description: string
  label: string
  onChange: (checked: boolean) => void
}

function ToggleRow({ checked, description, label, onChange }: ToggleRowProps) {
  const inputId = useId()

  return (
    <div className="setting-row">
      <label htmlFor={inputId}>
        <strong>{label}</strong>
        <span>{description}</span>
      </label>
      <input
        id={inputId}
        className="switch"
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
    </div>
  )
}

export function SettingsPanel({
  settings,
  onChange,
  onClose,
  onCloseRoom,
}: SettingsPanelProps) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return (
    <div className="settings-layer">
      <button
        className="settings-backdrop"
        type="button"
        aria-label="Close room settings"
        onClick={onClose}
      />
      <aside className="settings-panel" role="dialog" aria-modal="true" aria-label="Room settings">
        <div className="settings-panel__header">
          <div>
            <p className="eyebrow">Host controls</p>
            <h2>Room settings</h2>
          </div>
          <button className="icon-button icon-button--large" type="button" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="settings-panel__content">
          <div className="select-setting">
            <label htmlFor="max-players">
              <strong>Maximum players</strong>
              <span>Choose how many people can join this room.</span>
            </label>
            <select
              id="max-players"
              value={settings.maxPlayers}
              onChange={(event) =>
                onChange({ ...settings, maxPlayers: Number(event.target.value) })
              }
            >
              {[4, 6, 8, 10, 12].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </div>

          <ToggleRow
            label="Require ready status"
            description="Everyone must be ready before the host starts."
            checked={settings.requireReady}
            onChange={(requireReady) => onChange({ ...settings, requireReady })}
          />
          <ToggleRow
            label="Allow late joining"
            description="Reserved for games that support joining in progress."
            checked={settings.allowLateJoin}
            onChange={(allowLateJoin) => onChange({ ...settings, allowLateJoin })}
          />
          <ToggleRow
            label="Filter player names"
            description="Keep player names friendly for the group."
            checked={settings.filterNames}
            onChange={(filterNames) => onChange({ ...settings, filterNames })}
          />
        </div>

        <div className="settings-panel__footer">
          <Button type="button" variant="danger" onClick={onCloseRoom}>
            Close room
          </Button>
          <p>Changes sync to everyone in the room.</p>
        </div>
      </aside>
    </div>
  )
}
