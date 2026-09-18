import { describe, expect, it } from 'vitest'
import { normaliseRoomCode, validateDisplayName } from './validation'

describe('normaliseRoomCode', () => {
  it('uppercases, removes spaces, and caps the code at four characters', () => {
    expect(normaliseRoomCode(' j 7kq extra')).toBe('J7KQ')
  })

  it('removes visually confusing room-code characters', () => {
    expect(normaliseRoomCode('OI1L2A')).toBe('2A')
  })
})

describe('validateDisplayName', () => {
  it('rejects blank, short, and long names', () => {
    expect(validateDisplayName('   ')).toBe('Enter a name first.')
    expect(validateDisplayName('A')).toBe('Use at least 2 characters.')
    expect(validateDisplayName('This name is much too long')).toBe(
      'Keep your name to 16 characters.',
    )
  })

  it('accepts a trimmed name within the length boundary', () => {
    expect(validateDisplayName('  Uzair  ')).toBeNull()
  })
})
