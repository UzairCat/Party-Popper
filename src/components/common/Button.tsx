import type { ButtonHTMLAttributes, ReactNode } from 'react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode
  variant?: 'primary' | 'secondary' | 'quiet' | 'danger'
  size?: 'normal' | 'large'
  isLoading?: boolean
}

export function Button({
  children,
  className = '',
  variant = 'primary',
  size = 'normal',
  isLoading = false,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      className={`button button--${variant} button--${size} ${className}`.trim()}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? <span className="button__loader" aria-hidden="true" /> : null}
      <span>{isLoading ? 'Working…' : children}</span>
    </button>
  )
}
