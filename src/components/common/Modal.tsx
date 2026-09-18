import { useEffect, useId, type ReactNode } from 'react'
import { Button } from './Button'

interface ModalProps {
  title: string
  description?: string
  children?: ReactNode
  confirmLabel?: string
  confirmVariant?: 'primary' | 'danger'
  onConfirm?: () => void
  onClose: () => void
}

export function Modal({
  title,
  description,
  children,
  confirmLabel,
  confirmVariant = 'primary',
  onConfirm,
  onClose,
}: ModalProps) {
  const titleId = useId()
  const descriptionId = useId()

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
    <div className="modal-layer">
      <button
        className="modal-backdrop"
        type="button"
        aria-label="Close dialog"
        onClick={onClose}
      />
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
      >
        <div className="modal__icon" aria-hidden="true">
          ✦
        </div>
        <h2 id={titleId}>{title}</h2>
        {description ? <p id={descriptionId}>{description}</p> : null}
        {children}
        <div className="modal__actions">
          <Button type="button" variant="quiet" onClick={onClose}>
            {confirmLabel ? 'Cancel' : 'Back to lobby'}
          </Button>
          {confirmLabel && onConfirm ? (
            <Button type="button" variant={confirmVariant} onClick={onConfirm}>
              {confirmLabel}
            </Button>
          ) : null}
        </div>
      </section>
    </div>
  )
}
