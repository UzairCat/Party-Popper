import type { PlayerAvatar } from '../../types/room'

/** Same little party characters on every device, without relying on emoji fonts. */
export function AvatarArt({ avatar }: { avatar: PlayerAvatar }) {
  const eyes = <><ellipse cx="24" cy="31" rx="3" ry="4" fill="#29271e" /><ellipse cx="40" cy="31" rx="3" ry="4" fill="#29271e" /></>
  const smile = <path d="M25 41q7 7 14 0" fill="none" stroke="#29271e" strokeWidth="2.5" strokeLinecap="round" />
  return (
    <svg className="avatar-art" viewBox="0 0 64 64" fill="none" aria-hidden="true">
      {avatar === 'robot' ? <>
        <path d="M32 8v8M8 29v12M56 29v12" stroke="#29271e" strokeWidth="4" strokeLinecap="round" />
        <circle cx="32" cy="7" r="4" fill="#ee673f" stroke="#29271e" strokeWidth="2" />
        <rect x="12" y="16" width="40" height="38" rx="10" fill="#c8b6ef" stroke="#29271e" strokeWidth="2.5" />
        <rect x="18" y="24" width="28" height="13" rx="5" fill="#29271e" />
        <circle cx="24" cy="30" r="3" fill="#eedb65" /><circle cx="40" cy="30" r="3" fill="#eedb65" />
        <path d="M25 45h14" stroke="#29271e" strokeWidth="3" strokeLinecap="round" />
      </> : avatar === 'frog' ? <>
        <path d="M12 31C3 7 27 5 32 20 37 5 61 7 52 31Q64 56 32 56 0 56 12 31Z" fill="#a9ce7f" stroke="#29271e" strokeWidth="2.5" />
        <circle cx="20" cy="22" r="7" fill="#fffdf6" /><circle cx="44" cy="22" r="7" fill="#fffdf6" />
        <circle cx="21" cy="22" r="3" fill="#29271e" /><circle cx="43" cy="22" r="3" fill="#29271e" />{smile}
      </> : avatar === 'alien' ? <>
        <path d="M32 7C-4 7 10 45 32 58 54 45 68 7 32 7Z" fill="#b8d8ce" stroke="#29271e" strokeWidth="2.5" />
        <ellipse cx="23" cy="29" rx="5" ry="9" fill="#29271e" transform="rotate(-30 23 29)" />
        <ellipse cx="41" cy="29" rx="5" ry="9" fill="#29271e" transform="rotate(30 41 29)" />{smile}
      </> : avatar === 'cat' ? <>
        <path d="M12 27 10 7 27 17h10L54 7l-2 20C66 63-2 63 12 27Z" fill="#efae76" stroke="#29271e" strokeWidth="2.5" strokeLinejoin="round" />
        {eyes}<path d="m29 38 3 3 3-3M32 41v4m-5 1 5-1 5 1M8 36l10 2M7 43l11-1M46 38l10-2M46 42l11 1" stroke="#29271e" strokeWidth="2" strokeLinecap="round" />
      </> : avatar === 'monkey' ? <>
        <circle cx="11" cy="32" r="8" fill="#b98465" stroke="#29271e" strokeWidth="2.5" /><circle cx="53" cy="32" r="8" fill="#b98465" stroke="#29271e" strokeWidth="2.5" />
        <ellipse cx="32" cy="31" rx="23" ry="25" fill="#b98465" stroke="#29271e" strokeWidth="2.5" />
        <path d="M17 29c-4-14 13-16 15-6 2-10 19-8 15 6 11 23-41 23-30 0Z" fill="#f4d8ad" />{eyes}{smile}
      </> : avatar === 'sparkle' ? <>
        <path d="m32 4 8 18 20 10-20 8-8 20-9-20L4 32l19-10Z" fill="#eedb65" stroke="#29271e" strokeWidth="2.5" strokeLinejoin="round" />{eyes}{smile}
      </> : <>
        <circle cx="32" cy="34" r="23" fill="#eedb65" stroke="#29271e" strokeWidth="2.5" />
        {avatar === 'cool' ? <><path d="M8 26h48M31 29h3" stroke="#29271e" strokeWidth="3" /><path d="M13 26h16v8c-2 9-14 9-16 0Zm22 0h16v8c-2 9-14 9-16 0Z" fill="#29271e" /><path d="m17 29 4 4m18-4 4 4" stroke="#fffdf6" strokeWidth="2" /></> : <>{eyes}<path d="M5 24q27 10 54 0M18 24 20 6l12 5L44 6l2 18Z" fill="#c58a65" stroke="#29271e" strokeWidth="2.5" strokeLinejoin="round" /></>}
        {smile}
      </>}
    </svg>
  )
}
