interface ToastProps {
  message: string
}

export function Toast({ message }: ToastProps) {
  return (
    <div className="toast" role="status" aria-live="polite">
      <span aria-hidden="true">✓</span>
      {message}
    </div>
  )
}
