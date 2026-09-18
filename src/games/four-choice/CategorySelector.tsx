import { useEffect } from 'react'
import {
  FOUR_CHOICE_CATEGORIES,
  type FourChoiceCategoryId,
} from '../../../shared/four-choice'
import { Button } from '../../components/common/Button'

interface CategorySelectorProps {
  selected: FourChoiceCategoryId[]
  canEdit: boolean
  isPending: boolean
  onChange: (categories: FourChoiceCategoryId[]) => void
  onClose: () => void
}

export function CategorySelector({
  selected,
  canEdit,
  isPending,
  onChange,
  onClose,
}: CategorySelectorProps) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const selectedSet = new Set(selected)
  const toggleCategory = (categoryId: FourChoiceCategoryId) => {
    if (!canEdit || isPending) return

    onChange(
      selectedSet.has(categoryId)
        ? selected.filter((id) => id !== categoryId)
        : [...selected, categoryId],
    )
  }

  return (
    <div className="category-layer">
      <button
        className="category-backdrop"
        type="button"
        aria-label="Close categories"
        onClick={onClose}
      />
      <section
        className="category-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="category-title"
      >
        <header className="category-panel__header">
          <div>
            <p className="eyebrow eyebrow--accent">Four Choice</p>
            <h2 id="category-title">Categories</h2>
            <p>
              {canEdit
                ? 'Choose which topics can appear in this match.'
                : 'The host chooses which topics can appear.'}
            </p>
          </div>
          <button className="icon-button icon-button--large" type="button" onClick={onClose}>
            <span aria-hidden="true">×</span>
            <span className="sr-only">Close categories</span>
          </button>
        </header>

        <div className="category-panel__toolbar">
          <strong>{selected.length} / {FOUR_CHOICE_CATEGORIES.length} selected</strong>
          {canEdit ? (
            <div>
              <Button
                type="button"
                variant="secondary"
                disabled={isPending || selected.length === FOUR_CHOICE_CATEGORIES.length}
                onClick={() => onChange(FOUR_CHOICE_CATEGORIES.map((category) => category.id))}
              >
                Select all
              </Button>
              <Button
                type="button"
                variant="quiet"
                disabled={isPending || selected.length === 0}
                onClick={() => onChange([])}
              >
                Unselect all
              </Button>
            </div>
          ) : null}
        </div>

        <div className="category-grid">
          {FOUR_CHOICE_CATEGORIES.map((category) => {
            const isSelected = selectedSet.has(category.id)
            return (
              <button
                key={category.id}
                className={`category-option ${isSelected ? 'is-selected' : ''}`}
                type="button"
                aria-pressed={isSelected}
                disabled={!canEdit || isPending}
                onClick={() => toggleCategory(category.id)}
              >
                <span className="category-option__icon" aria-hidden="true">{category.icon}</span>
                <span>{category.label}</span>
                <span className="category-option__check" aria-hidden="true">
                  {isSelected ? '✓' : ''}
                </span>
              </button>
            )
          })}
        </div>

        {selected.length === 0 ? (
          <p className="category-warning" role="status">
            Select at least one category before starting the game.
          </p>
        ) : null}

        <footer className="category-panel__footer">
          <Button type="button" size="large" onClick={onClose}>Done</Button>
        </footer>
      </section>
    </div>
  )
}
