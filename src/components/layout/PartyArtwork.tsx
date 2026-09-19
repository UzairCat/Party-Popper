/** Scalable, code-native poster art; decorative, with no remote image dependency. */
export function PartyArtwork() {
  return (
    <div className="party-art" aria-hidden="true">
      <div className="party-art__orbit" />
      <div className="party-art__ticket">ADMIT EVERYONE <span>★ ★ ★</span></div>
      <svg className="party-art__burst" viewBox="0 0 320 320" fill="none">
        <path d="M160 12 184 55 226 25 231 76 282 65 266 113 312 137 272 166 301 208 250 211 259 261 211 246 186 299 156 260 113 294 107 244 54 256 71 208 17 184 58 155 28 112 78 108 67 57 116 73 138 21Z" fill="#ff7448" stroke="#29271e" strokeWidth="4" strokeLinejoin="round" />
        <ellipse cx="128" cy="138" rx="11" ry="20" fill="#29271e" transform="rotate(-8 128 138)" />
        <ellipse cx="188" cy="133" rx="11" ry="20" fill="#29271e" transform="rotate(-8 188 133)" />
        <path d="M123 180Q164 224 203 174" stroke="#29271e" strokeWidth="7" strokeLinecap="round" />
        <ellipse cx="98" cy="169" rx="14" ry="8" fill="#f44332" />
        <ellipse cx="220" cy="159" rx="14" ry="8" fill="#f44332" />
      </svg>
      <div className="party-art__pack"><span>ONE ROOM. MANY GAMES.</span><strong>PLAY</strong><div><i>★</i><i>↗</i><i>✦</i></div></div>
      <div className="party-art__bolt">↯<span>BRING<br />YOUR A-GAME</span></div>
      <div className="party-art__seal">GOOD<br /><strong>TIMES</strong><br />GUARANTEED*</div>
      <span className="party-art__spark party-art__spark--one">✳</span>
      <span className="party-art__spark party-art__spark--two">✦</span>
      <div className="party-art__caption">*Friendly rivalries highly likely.</div>
    </div>
  )
}
