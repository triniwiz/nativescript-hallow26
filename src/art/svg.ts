/**
 * Inline SVG for <Svg src="...">, rendered natively by @nativescript/canvas-svg
 * with Skia, SMIL animations included: flames flicker, ghosts bob, bats flap.
 *
 * Each document states its size in dp and the <Svg> showing it gets the same
 * size: percentage sizes resolve against the view's laid-out size, which
 * Windows doesn't report for views inside a MasonKit layout.
 */

const svg = (body: string, viewBox: string, width: number, height = width) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${viewBox}">${body}</svg>`;

/** A wax candle: lit, its flame flickers and glows; out, a thread of smoke. */
export function candle(lit: boolean, size = 28) {
  const flame = lit
    ? `
  <defs>
    <radialGradient id="halo" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#fde68a" stop-opacity="0.75"/>
      <stop offset="45%" stop-color="#f97316" stop-opacity="0.25"/>
      <stop offset="100%" stop-color="#f97316" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="fire" x1="0" y1="1" x2="0" y2="0">
      <stop offset="0%" stop-color="#f97316"/>
      <stop offset="55%" stop-color="#fbbf24"/>
      <stop offset="100%" stop-color="#fef3c7"/>
    </linearGradient>
  </defs>
  <circle cx="20" cy="15" r="15" fill="url(#halo)">
    <animate attributeName="r" values="14;16;13;15;14" dur="1.3s" repeatCount="indefinite"/>
  </circle>
  <g transform="translate(20 20)">
    <path d="M0 -15 C 5 -8, 5 -3, 0 0 C -5 -3, -5 -8, 0 -15 Z" fill="url(#fire)">
      <animateTransform attributeName="transform" type="scale" values="1 1;0.92 1.08;1.04 0.95;0.96 1.05;1 1" dur="0.9s" repeatCount="indefinite"/>
    </path>
    <path d="M0 -8 C 2 -5, 2 -2, 0 0 C -2 -2, -2 -5, 0 -8 Z" fill="#fffbeb" opacity="0.9"/>
  </g>`
    : `
  <path d="M20 19 C 17 14, 23 11, 20 6 C 18 3, 21 1, 20 -2" fill="none" stroke="#6f6577" stroke-width="1.2" stroke-linecap="round" opacity="0.6">
    <animate attributeName="opacity" values="0.6;0.15;0.6" dur="2.6s" repeatCount="indefinite"/>
  </path>`;
  return svg(
    `${flame}
  <line x1="20" y1="20" x2="20" y2="23" stroke="#1c1917" stroke-width="1.5"/>
  <path d="M12 23 H28 V54 Q28 56 26 56 H14 Q12 56 12 54 Z" fill="${lit ? '#f4efe6' : '#a99d8c'}"/>
  <path d="M12 23 H28 V27 Q26 27 26 31 Q26 34 24.5 34 Q23 34 23 30 Q23 27 20 27 Q17 27 17 33 Q17 36 15.5 36 Q14 36 14 31 Q14 27 12 27 Z" fill="${lit ? '#ffffff' : '#ddd3c2'}"/>
  <rect x="9" y="55" width="22" height="3" rx="1.5" fill="#57534e"/>`,
    '0 -2 40 62',
    size,
    Math.round(size * 1.55),
  );
}

/**
 * A row of candles in one SVG: one view to re-render per frame instead of
 * one per candle.
 */
export function candleRow(lit: boolean[], size = 26, gap = 12) {
  const unit = 40;
  const step = unit + (gap * unit) / size;
  const inner = lit
    .map((on, i) => {
      const body = candle(on, size)
        .replace(/^<svg[^>]*>/, '')
        .replace(/<\/svg>$/, '')
        .replace(/id="(halo|fire)"/g, `id="$1${i}"`)
        .replace(/url\(#(halo|fire)\)/g, `url(#$1${i})`);
      return `<g transform="translate(${(i * step).toFixed(1)} 0)">${body}</g>`;
    })
    .join('');
  const width = Math.round((lit.length * unit + (lit.length - 1) * (step - unit)) * (size / unit));
  return svg(inner, `0 -2 ${(lit.length * unit + (lit.length - 1) * (step - unit)).toFixed(1)} 62`, width, Math.round(size * 1.55));
}

/** A star for the results card. */
export function star(filled: boolean, size = 44) {
  const path = 'M24 3 L30.2 16.6 L45 18.3 L34 28.4 L37 43 L24 35.6 L11 43 L14 28.4 L3 18.3 L17.8 16.6 Z';
  return svg(
    filled
      ? `<defs><radialGradient id="s" cx="50%" cy="40%" r="60%">
           <stop offset="0%" stop-color="#fef3c7"/><stop offset="60%" stop-color="#fbbf24"/><stop offset="100%" stop-color="#d97706"/>
         </radialGradient></defs>
         <path d="${path}" fill="url(#s)" stroke="#fde68a" stroke-width="1.5" stroke-linejoin="round"/>`
      : `<path d="${path}" fill="#171021" stroke="#352545" stroke-width="2" stroke-linejoin="round"/>`,
    '0 0 48 48',
    size,
  );
}

/** Two bars. */
export const pauseIcon = svg(
  `<rect x="6" y="5" width="4.5" height="14" rx="1.5" fill="#ddd3c2"/><rect x="13.5" y="5" width="4.5" height="14" rx="1.5" fill="#ddd3c2"/>`,
  '0 0 24 24',
  22,
);

/**
 * The jump-scare face: a hollow-eyed, screaming wraith. Shown for a split
 * second over the canvas.
 */
export const scareFace = svg(
  `<defs>
    <radialGradient id="skin" cx="50%" cy="38%" r="62%">
      <stop offset="0%" stop-color="#f4efe6"/>
      <stop offset="55%" stop-color="#b9c4bd"/>
      <stop offset="100%" stop-color="#2a2f2e" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="void" cx="50%" cy="45%" r="55%">
      <stop offset="0%" stop-color="#000"/>
      <stop offset="80%" stop-color="#0b0507"/>
      <stop offset="100%" stop-color="#3b0606"/>
    </radialGradient>
    <radialGradient id="pupil" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#fff7ed"/>
      <stop offset="35%" stop-color="#f05252"/>
      <stop offset="100%" stop-color="#f05252" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <path d="M160 18 C 238 18, 282 86, 276 168 C 272 228, 250 262, 226 296 C 204 326, 186 344, 160 344 C 134 344, 116 326, 94 296 C 70 262, 48 228, 44 168 C 38 86, 82 18, 160 18 Z" fill="url(#skin)"/>
  <path d="M86 132 C 96 98, 140 104, 146 140 C 150 170, 128 196, 104 190 C 82 184, 78 156, 86 132 Z" fill="url(#void)"/>
  <path d="M234 132 C 224 98, 180 104, 174 140 C 170 170, 192 196, 216 190 C 238 184, 242 156, 234 132 Z" fill="url(#void)"/>
  <circle cx="114" cy="152" r="9" fill="url(#pupil)"/>
  <circle cx="206" cy="152" r="9" fill="url(#pupil)"/>
  <path d="M150 196 L160 228 L170 196 Z" fill="#1a0f12" opacity="0.7"/>
  <path d="M112 252 C 120 232, 200 232, 208 252 C 216 290, 196 336, 160 338 C 124 336, 104 290, 112 252 Z" fill="url(#void)"/>
  <path d="M120 256 L128 268 L136 254 L146 270 L156 254 L166 270 L176 254 L186 268 L196 256" fill="none" stroke="#ddd3c2" stroke-width="3" stroke-linejoin="round" opacity="0.8"/>
  <path d="M70 110 C 90 80, 120 76, 140 96 M250 110 C 230 80, 200 76, 180 96" fill="none" stroke="#2a2f2e" stroke-width="5" stroke-linecap="round" opacity="0.6"/>`,
  '0 0 320 360',
  320,
  360,
);

/**
 * A colony of bats, for the title screen. Each wing is its own path whose
 * shape morphs through the stroke (raised, level, swept down), the body
 * bobs against the wingbeat, and each bat loops along its own flight path.
 */
export function bats(width = 360, height = 140) {
  // One wing, reaching right from the body. Every pose uses the same
  // commands, so SMIL can morph between them.
  const level = 'M0 -1 C 6 -6, 14 -7, 24 -4 C 21 -1, 20 1, 21 4 C 17 1, 13 2, 10 5 C 8 2, 4 2, 0 3 Z';
  const raised = 'M0 -1 C 5 -9, 11 -15, 18 -19 C 17 -14, 17 -11, 18 -8 C 14 -9, 11 -7, 8 -4 C 6 -5, 3 -2, 0 3 Z';
  const lowered = 'M0 -1 C 6 0, 12 4, 17 12 C 14 11, 12 11, 10 12 C 9 9, 7 8, 5 9 C 4 6, 2 4, 0 3 Z';
  const stroke = `${level};${raised};${level};${lowered};${level}`;
  const bat = (path: string, scale: number, beat: number, flight: number, delay: number) => {
    const wing = `<path fill="#05030a" d="${level}">
          <animate attributeName="d" values="${stroke}" dur="${beat}s" begin="${delay}s" repeatCount="indefinite"/>
        </path>`;
    return `
  <g>
    <animateMotion path="${path}" dur="${flight}s" begin="-${delay * 7}s" repeatCount="indefinite"/>
    <g transform="scale(${scale})">
      <g>
        <animateTransform attributeName="transform" type="translate" values="0 0;0 1.5;0 0;0 -2;0 0" dur="${beat}s" begin="${delay}s" repeatCount="indefinite"/>
        ${wing}
        <g transform="scale(-1 1)">${wing}</g>
        <ellipse cx="0" cy="1" rx="3.2" ry="4.6" fill="#05030a"/>
        <path d="M-2.6 -2.4 L-1.8 -6 L-0.6 -2.9 Z M2.6 -2.4 L1.8 -6 L0.6 -2.9 Z" fill="#05030a"/>
        <circle cx="-1.1" cy="-0.4" r="0.6" fill="#f05252"/><circle cx="1.1" cy="-0.4" r="0.6" fill="#f05252"/>
      </g>
    </g>
  </g>`;
  };
  return svg(
    [
      bat('M60 74 C 110 40, 150 100, 200 70 S 300 30, 250 80 S 90 110, 60 74 Z', 1.25, 0.34, 9, 0),
      bat('M150 40 C 210 20, 260 60, 300 44 S 330 90, 260 96 S 110 70, 150 40 Z', 0.9, 0.29, 11, 0.4),
      bat('M300 100 C 250 120, 180 90, 120 104 S 30 70, 80 50 S 330 70, 300 100 Z', 1.05, 0.31, 13, 0.9),
      bat('M30 30 C 90 10, 140 40, 200 24 S 250 50, 180 56 S 20 50, 30 30 Z', 0.65, 0.26, 10, 0.2),
      bat('M320 60 C 280 30, 230 50, 240 76 S 340 110, 320 60 Z', 0.55, 0.24, 8, 1.3),
    ].join(''),
    `0 0 ${width} ${height}`,
    width,
    height,
  );
}

/** A friendly-ish sheet ghost, bobbing. */
export function ghost(size = 64) {
  return svg(
    `<defs><radialGradient id="gg" cx="50%" cy="35%" r="70%">
       <stop offset="0%" stop-color="#ffffff"/><stop offset="70%" stop-color="#d7f5ec"/><stop offset="100%" stop-color="#5eead4" stop-opacity="0.4"/>
     </radialGradient></defs>
     <g>
       <animateTransform attributeName="transform" type="translate" values="0 0;0 -5;0 0" dur="2.6s" repeatCount="indefinite"/>
       <path d="M32 6 C 48 6, 54 20, 54 34 L54 56 L47 51 L41 57 L35 51 L29 57 L23 51 L17 57 L10 52 L10 34 C 10 20, 16 6, 32 6 Z" fill="url(#gg)" opacity="0.92"/>
       <ellipse cx="25" cy="28" rx="3.5" ry="5" fill="#0e0814"/><ellipse cx="39" cy="28" rx="3.5" ry="5" fill="#0e0814"/>
       <ellipse cx="32" cy="40" rx="4" ry="5.5" fill="#0e0814">
         <animate attributeName="ry" values="5.5;3;5.5" dur="2.6s" repeatCount="indefinite"/>
       </ellipse>
     </g>`,
    '0 0 64 64',
    size,
  );
}

const ICON = 72;

/** One animated emblem per rite, for the map. */
export const riteIcons = {
  graveyard: svg(
    `<defs>
       <radialGradient id="m" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#fde68a"/><stop offset="100%" stop-color="#fde68a" stop-opacity="0"/></radialGradient>
       <linearGradient id="st" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#6f6577"/><stop offset="100%" stop-color="#352545"/></linearGradient>
     </defs>
     <circle cx="54" cy="18" r="14" fill="url(#m)" opacity="0.5"/>
     <circle cx="54" cy="18" r="7" fill="#fef3c7"/>
     <g opacity="0.85">
       <animateTransform attributeName="transform" type="translate" values="0 6;0 -2;0 6" dur="3s" repeatCount="indefinite"/>
       <path d="M22 14 C 30 14, 33 21, 33 28 L33 38 L29 35 L26 39 L22 35 L18 39 L15 35 L11 38 L11 28 C 11 21, 14 14, 22 14 Z" fill="#d7f5ec"/>
       <circle cx="18.5" cy="25" r="2" fill="#0e0814"/><circle cx="25.5" cy="25" r="2" fill="#0e0814"/>
     </g>
     <path d="M36 66 V40 C 36 30, 60 30, 60 40 V66 Z" fill="url(#st)"/>
     <path d="M44 44 H52 M48 40 V54" stroke="#0e0814" stroke-width="2.5" stroke-linecap="round"/>
     <path d="M4 66 C 20 60, 50 62, 68 66 Z" fill="#171021"/>`,
    '0 0 72 72',
    ICON,
  ),
  patch: svg(
    `<defs>
       <radialGradient id="pk" cx="45%" cy="40%" r="65%"><stop offset="0%" stop-color="#fdba74"/><stop offset="70%" stop-color="#f97316"/><stop offset="100%" stop-color="#9a3412"/></radialGradient>
       <radialGradient id="glow" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#fef08a"/><stop offset="100%" stop-color="#f59e0b"/></radialGradient>
     </defs>
     <path d="M35 14 C 36 9, 40 6, 44 6" fill="none" stroke="#4d7c0f" stroke-width="4" stroke-linecap="round"/>
     <ellipse cx="24" cy="40" rx="16" ry="22" fill="url(#pk)"/>
     <ellipse cx="48" cy="40" rx="16" ry="22" fill="url(#pk)"/>
     <ellipse cx="36" cy="40" rx="15" ry="24" fill="url(#pk)"/>
     <g fill="url(#glow)">
       <animate attributeName="opacity" values="1;0.55;0.9;0.7;1" dur="1.4s" repeatCount="indefinite"/>
       <path d="M20 32 L28 32 L24 25 Z"/><path d="M44 32 L52 32 L48 25 Z"/>
       <path d="M33 37 L39 37 L36 42 Z"/>
       <path d="M17 46 L22 49 L27 46 L31 50 L36 46 L41 50 L45 46 L50 49 L55 46 C 52 56, 20 56, 17 46 Z"/>
     </g>`,
    '0 0 72 72',
    ICON,
  ),
  corridor: svg(
    `<defs>
       <radialGradient id="lamp" cx="50%" cy="0%" r="80%"><stop offset="0%" stop-color="#fef3c7" stop-opacity="0.8"/><stop offset="100%" stop-color="#fef3c7" stop-opacity="0"/></radialGradient>
     </defs>
     <rect x="2" y="2" width="68" height="68" rx="6" fill="#0e0814"/>
     <path d="M2 2 L28 24 H44 L70 2 Z" fill="#241831"/>
     <path d="M2 70 L28 48 H44 L70 70 Z" fill="#352545"/>
     <path d="M2 2 L28 24 V48 L2 70 Z" fill="#171021"/>
     <path d="M70 2 L44 24 V48 L70 70 Z" fill="#171021"/>
     <rect x="28" y="24" width="16" height="24" fill="#05030a"/>
     <path d="M2 2 L28 24 H44 L70 2 Z" fill="url(#lamp)">
       <animate attributeName="opacity" values="1;1;0.2;1;0.4;1;1" keyTimes="0;0.5;0.53;0.56;0.6;0.63;1" dur="3s" repeatCount="indefinite"/>
     </path>
     <g fill="#f05252">
       <animate attributeName="opacity" values="0;0;1;1;0;0" keyTimes="0;0.55;0.6;0.85;0.9;1" dur="5s" repeatCount="indefinite"/>
       <circle cx="33.5" cy="33" r="1.4"/><circle cx="38.5" cy="33" r="1.4"/>
     </g>`,
    '0 0 72 72',
    ICON,
  ),
  sigil: svg(
    `<defs>
       <radialGradient id="ring" cx="50%" cy="50%" r="50%"><stop offset="60%" stop-color="#7c3aed" stop-opacity="0"/><stop offset="100%" stop-color="#a78bfa" stop-opacity="0.45"/></radialGradient>
     </defs>
     <circle cx="36" cy="36" r="32" fill="url(#ring)"/>
     <circle cx="36" cy="36" r="28" fill="none" stroke="#c4b5fd" stroke-width="1.5" opacity="0.7"/>
     <path d="M36 9 L52 58 L10 27 H62 L20 58 Z" fill="none" stroke="#f0abfc" stroke-width="2.5" stroke-linejoin="round"
       stroke-dasharray="230" stroke-dashoffset="230">
       <animate attributeName="stroke-dashoffset" values="230;0;0;230" keyTimes="0;0.5;0.85;1" dur="4s" repeatCount="indefinite"/>
     </path>
     <g fill="#fde68a">
       <circle cx="36" cy="9" r="2.5"/><circle cx="52" cy="58" r="2.5"/><circle cx="10" cy="27" r="2.5"/><circle cx="62" cy="27" r="2.5"/><circle cx="20" cy="58" r="2.5"/>
     </g>`,
    '0 0 72 72',
    ICON,
  ),
  seance: svg(
    `<defs>
       <linearGradient id="bw" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#c9a06a"/><stop offset="100%" stop-color="#7a4b25"/></linearGradient>
       <radialGradient id="lens" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#fde68a" stop-opacity="0.9"/><stop offset="100%" stop-color="#fde68a" stop-opacity="0"/></radialGradient>
     </defs>
     <rect x="4" y="14" width="64" height="44" rx="8" fill="url(#bw)" stroke="#2a1608" stroke-width="2"/>
     <g fill="#2b1407" font-family="serif" font-weight="700" font-size="11" text-anchor="middle">
       <text x="16" y="34">A</text><text x="29" y="30">B</text><text x="43" y="30">C</text><text x="56" y="34">D</text>
       <text x="20" y="22" font-size="6">YES</text><text x="52" y="22" font-size="6">NO</text>
     </g>
     <g>
       <animateTransform attributeName="transform" type="translate" values="12 16;26 11;40 11;12 16" keyTimes="0;0.35;0.7;1" dur="3.6s" repeatCount="indefinite"/>
       <circle cx="4" cy="15" r="9" fill="url(#lens)">
         <animate attributeName="opacity" values="0.3;1;0.3" dur="1.2s" repeatCount="indefinite"/>
       </circle>
       <path d="M4 4 C 10 9, 14 16, 13 22 C 12 28, 8 30, 4 30 C 0 30, -4 28, -5 22 C -6 16, -2 9, 4 4 Z" fill="#e2c29a" stroke="#3b2010" stroke-width="1.5" opacity="0.95"/>
       <circle cx="4" cy="16" r="4" fill="#0e0814" fill-opacity="0.25" stroke="#c8a45a" stroke-width="1.2"/>
     </g>`,
    '0 0 72 72',
    ICON,
  ),
  souls: svg(
    `<defs>
       <radialGradient id="gate" cx="50%" cy="50%" r="50%"><stop offset="55%" stop-color="#5eead4" stop-opacity="0"/><stop offset="80%" stop-color="#5eead4" stop-opacity="0.7"/><stop offset="100%" stop-color="#5eead4" stop-opacity="0"/></radialGradient>
       <radialGradient id="wisp" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#ecfeff"/><stop offset="100%" stop-color="#67e8f9" stop-opacity="0"/></radialGradient>
     </defs>
     <circle cx="36" cy="36" r="24" fill="url(#gate)">
       <animate attributeName="r" values="22;26;22" dur="2.4s" repeatCount="indefinite"/>
     </circle>
     <g>
       <animateTransform attributeName="transform" type="rotate" from="0 36 36" to="360 36 36" dur="7s" repeatCount="indefinite"/>
       <circle cx="36" cy="8" r="5" fill="url(#wisp)"/><circle cx="62" cy="40" r="4" fill="url(#wisp)"/>
       <circle cx="16" cy="56" r="4.5" fill="url(#wisp)"/><circle cx="12" cy="22" r="3" fill="url(#wisp)"/>
     </g>
     <g>
       <animateTransform attributeName="transform" type="rotate" from="360 36 36" to="0 36 36" dur="11s" repeatCount="indefinite"/>
       <circle cx="36" cy="22" r="3" fill="url(#wisp)"/><circle cx="50" cy="46" r="3.5" fill="url(#wisp)"/><circle cx="24" cy="44" r="2.5" fill="url(#wisp)"/>
     </g>`,
    '0 0 72 72',
    ICON,
  ),
};

/** A back arrow, drawn so it sits dead centre in a round button. */
export const backIcon = svg(
  `<path d="M15 5 L8 12 L15 19" fill="none" stroke="#ddd3c2" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>`,
  '0 0 24 24',
  22,
);

/**
 * Blood running off the bottom edge of a button, `width` dp wide: drips that
 * slowly lengthen, and now and then a drop that falls away.
 */
export function bloodDrips(width: number, height = 34) {
  const r = (() => {
    let state = 7;
    return () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 4294967296);
  })();
  const drips: string[] = [];
  for (let x = 14; x < width - 10; x += 18 + r() * 34) {
    const w = 4 + r() * 6;
    const h = 4 + r() * (height * 0.45);
    const dur = (5 + r() * 6).toFixed(1);
    drips.push(`
    <g>
      <rect x="${(x - w / 2).toFixed(1)}" y="0" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="${(w / 2).toFixed(1)}" fill="url(#blood)">
        <animate attributeName="height" values="${h.toFixed(1)};${(h * 1.35).toFixed(1)};${h.toFixed(1)}" dur="${dur}s" repeatCount="indefinite"/>
      </rect>
      ${
        r() < 0.35
          ? `<circle cx="${x.toFixed(1)}" cy="${h.toFixed(1)}" r="${(w * 0.42).toFixed(1)}" fill="#5c0606">
        <animate attributeName="cy" values="${h.toFixed(1)};${h.toFixed(1)};${height + 6}" keyTimes="0;0.7;1" dur="${(3 + r() * 3).toFixed(1)}s" begin="${(r() * 3).toFixed(1)}s" repeatCount="indefinite"/>
        <animate attributeName="opacity" values="1;1;0" keyTimes="0;0.85;1" dur="${(3 + r() * 3).toFixed(1)}s" repeatCount="indefinite"/>
      </circle>`
          : ''
      }
    </g>`);
  }
  return svg(
    `<defs><linearGradient id="blood" x1="0" y1="0" x2="0" y2="1">
       <stop offset="0%" stop-color="#4a0707"/><stop offset="100%" stop-color="#7f1010"/>
     </linearGradient></defs>
     <rect x="8" y="0" width="${width - 16}" height="3" fill="#4a0707"/>
     ${drips.join('')}`,
    `0 0 ${width} ${height}`,
    width,
    height,
  );
}

/** A small bone-white skull, for flanking a label. */
export function skullGlyph(size = 26) {
  return svg(
    `<path d="M2 11 C 2 2, 22 2, 22 11 C 22 15, 19 16, 18 19 L 6 19 C 5 16, 2 15, 2 11 Z" fill="#f4efe6"/>
     <ellipse cx="8" cy="11" rx="3" ry="3.4" fill="#2a0505"/><ellipse cx="16" cy="11" rx="3" ry="3.4" fill="#2a0505"/>
     <path d="M12 14 L 10.5 17 L 13.5 17 Z" fill="#2a0505"/>
     <path d="M8 19 V 22 M11 19 V 22 M14 19 V 22 M17 19 V 22" stroke="#f4efe6" stroke-width="1.6"/>`,
    '0 0 24 24',
    size,
  );
}

/** An open grimoire with a candle-lit page. */
export function bookGlyph(size = 26) {
  return svg(
    `<path d="M2 6 C 6 4, 10 4, 12 6 C 14 4, 18 4, 22 6 V 20 C 18 18, 14 18, 12 20 C 10 18, 6 18, 2 20 Z" fill="#2a1a10" stroke="#ddd3c2" stroke-width="1.4" stroke-linejoin="round"/>
     <path d="M12 6 V 20" stroke="#ddd3c2" stroke-width="1.2"/>
     <path d="M4.5 9 H 9.5 M4.5 12 H 9.5 M14.5 9 H 19.5 M14.5 12 H 18" stroke="#a99d8c" stroke-width="1"/>
     <circle cx="17" cy="15.5" r="1.6" fill="#fbbf24"><animate attributeName="opacity" values="1;0.5;0.9;1" dur="1.3s" repeatCount="indefinite"/></circle>`,
    '0 0 24 24',
    size,
  );
}

/**
 * One drip, hanging from a surface at `top`: it flares out of the surface
 * (so it reads as running off it, not stuck on), narrows to a stem of width
 * `w` and ends in a round bead `len` below. Every drip uses the same path
 * commands, so SMIL can morph its length.
 */
function dripPath(x: number, top: number, w: number, len: number) {
  const f = w * 0.9;
  const l = x - w / 2;
  const r = x + w / 2;
  const n = (v: number) => v.toFixed(1);
  return `M${n(l - f)} ${n(top)} Q ${n(l)} ${n(top)} ${n(l)} ${n(top + f)} L ${n(l)} ${n(top + len)} A ${n(w / 2)} ${n(w / 2)} 0 0 0 ${n(r)} ${n(top + len)} L ${n(r)} ${n(top + f)} Q ${n(r)} ${n(top)} ${n(r + f)} ${n(top)} Z`;
}

/** A repeatable random sequence (each surface bleeds the same way every time). */
function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => (state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 4294967296;
}

/**
 * Drips along a surface from x0 to x1 at `top`: each slowly lengthens and
 * shrinks back, and the longest let a drop go now and then. `surge` makes
 * them run longer (a pressed button).
 */
function drips(r: () => number, xs: number[], top: number, maxLen: number, color: string, shine: string, surge = 1) {
  return xs
    .map((x) => {
      const w = 3 + r() * 5;
      const len = (4 + r() * maxLen) * surge;
      const dur = (4 + r() * 5).toFixed(1);
      const grow = Math.min(len * 1.5, maxLen * 1.6 * surge);
      const drop =
        len > maxLen * 0.55
          ? `<circle cx="${x.toFixed(1)}" cy="${(top + grow).toFixed(1)}" r="${(w * 0.45).toFixed(1)}" fill="${color}" opacity="0">
          <animate attributeName="cy" values="${(top + grow).toFixed(1)};${(top + grow).toFixed(1)};${(top + grow + 40).toFixed(1)}" keyTimes="0;0.8;1" dur="${dur}s" repeatCount="indefinite"/>
          <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.79;0.95;1" dur="${dur}s" repeatCount="indefinite"/>
        </circle>`
          : '';
      return `<path d="${dripPath(x, top, w, len)}" fill="${color}">
        <animate attributeName="d" values="${dripPath(x, top, w, len)};${dripPath(x, top, w, grow)};${dripPath(x, top, w, len)}" keyTimes="0;0.8;1" dur="${dur}s" repeatCount="indefinite"/>
      </path>
      <path d="M${(x - w * 0.15).toFixed(1)} ${(top + w * 1.4).toFixed(1)} L ${(x - w * 0.15).toFixed(1)} ${(top + len * 0.85).toFixed(1)}" stroke="${shine}" stroke-width="${(w * 0.2).toFixed(1)}" stroke-linecap="round" opacity="0.3"/>
      ${drop}`;
    })
    .join('');
}

/**
 * The title's call to action, drawn whole: a glowing slab of fresh blood,
 * `width` × `height` dp, running off its bottom edge (34 dp more below).
 * `pressed` sinks the shine and makes the blood run.
 */
export function bloodButton(width: number, height = 64, pressed = false) {
  const r = seededRandom(7);
  const glow = [10, 7, 4]
    .map((g, i) => `<rect x="${12 - g}" y="${8 - g}" width="${width - 24 + g * 2}" height="${height - 16 + g * 2}" rx="${18 + g}" fill="#dc2626" opacity="${(pressed ? 0.16 : 0.1) + i * 0.07}"/>`)
    .join('');
  const bottom = height - 8;
  const xs: number[] = [];
  for (let x = 40; x < width - 40; x += 22 + r() * 30) {
    xs.push(x);
  }
  return svg(
    `<defs>
       <linearGradient id="slab" x1="0" y1="0" x2="0" y2="1">
         <stop offset="0%" stop-color="${pressed ? '#a51818' : '#c21d1d'}"/><stop offset="55%" stop-color="#8a1111"/><stop offset="100%" stop-color="#5a0909"/>
       </linearGradient>
     </defs>
     ${glow}
     <rect x="12" y="8" width="${width - 24}" height="${height - 16}" rx="18" fill="url(#slab)"/>
     <rect x="12" y="8" width="${width - 24}" height="${height - 16}" rx="18" fill="none" stroke="#f87171" stroke-opacity="0.4" stroke-width="1.5"/>
     ${pressed ? '' : `<rect x="28" y="11" width="${width - 56}" height="3" rx="1.5" fill="#fecaca" opacity="0.25"/>`}
     ${drips(r, xs, bottom - 2, 16, '#5a0909', '#e05a5a', pressed ? 1.7 : 1)}`,
    `0 0 ${width} ${height + 34}`,
    width,
    height + 34,
  );
}

/**
 * Blood running from the bottoms of the title's letters. `width` × `height`
 * dp, laid under the word: letters are placed by Creepster's rough widths,
 * and each bleeds from where its strokes meet the baseline.
 */
export function titleDrips(width: number, height: number, word = 'HALLOW') {
  const widths: Record<string, number> = { H: 0.95, A: 0.9, L: 0.72, O: 0.92, W: 1.18 };
  // Where, across each letter, its strokes come down.
  const stems: Record<string, number[]> = { H: [0.18, 0.8], A: [0.15, 0.82], L: [0.22, 0.85], O: [0.5], W: [0.2, 0.52, 0.82] };
  const total = [...word].reduce((sum, c) => sum + (widths[c] ?? 0.9), 0);
  const r = seededRandom(31);
  const xs: number[] = [];
  let run = 0;
  for (const c of word) {
    const w = ((widths[c] ?? 0.9) / total) * width;
    for (const at of stems[c] ?? [0.5]) {
      if (r() < 0.8) {
        xs.push(run + at * w);
      }
    }
    run += w;
  }
  return svg(drips(r, xs, 0, height * 0.45, '#dc2626', '#fca5a5'), `0 0 ${width} ${height}`, width, height);
}

/** A worn stone tablet of a button, `width` × `height` dp. */
export function stoneButton(width: number, height = 56) {
  return svg(
    `<defs>
       <linearGradient id="stone" x1="0" y1="0" x2="0" y2="1">
         <stop offset="0%" stop-color="#2a1d37"/><stop offset="100%" stop-color="#0e0814"/>
       </linearGradient>
     </defs>
     <rect x="12" y="4" width="${width - 24}" height="${height - 8}" rx="16" fill="url(#stone)" stroke="#ddd3c2" stroke-opacity="0.3" stroke-width="1.5"/>
     <path d="M${width - 70} 5 L ${width - 78} 18 L ${width - 70} 26 L ${width - 82} 40" fill="none" stroke="#000" stroke-opacity="0.6" stroke-width="1.5"/>
     <path d="M30 ${height - 5} L 38 ${height - 16} L 34 ${height - 24}" fill="none" stroke="#000" stroke-opacity="0.5" stroke-width="1.2"/>`,
    `0 0 ${width} ${height}`,
    width,
    height,
  );
}

/** A grimoire's cover as a button: dark leather, gold tooling, stitched edges. */
export function leatherButton(width: number, height = 56) {
  const r = seededRandom(19);
  const grain = Array.from({ length: Math.round(width / 3) }, () => {
    const x = 14 + r() * (width - 28);
    const y = 6 + r() * (height - 12);
    return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(0.6 + r()).toFixed(1)}" fill="#000" opacity="${(0.15 + r() * 0.2).toFixed(2)}"/>`;
  }).join('');
  const corner = (x: number, y: number) =>
    `<path d="M${x} ${y - 5} L ${x + 5} ${y} L ${x} ${y + 5} L ${x - 5} ${y} Z" fill="#c9a24a" opacity="0.85"/>`;
  return svg(
    `<defs>
       <linearGradient id="leather" x1="0" y1="0" x2="0" y2="1">
         <stop offset="0%" stop-color="#4a2c19"/><stop offset="100%" stop-color="#22130a"/>
       </linearGradient>
     </defs>
     <rect x="12" y="4" width="${width - 24}" height="${height - 8}" rx="10" fill="url(#leather)" stroke="#0e0603" stroke-width="2"/>
     ${grain}
     <rect x="20" y="10" width="${width - 40}" height="${height - 20}" rx="6" fill="none" stroke="#c9a24a" stroke-width="1.4" opacity="0.8"/>
     <rect x="24" y="14" width="${width - 48}" height="${height - 28}" rx="4" fill="none" stroke="#c9a24a" stroke-width="0.8" opacity="0.5"/>
     <rect x="15" y="7" width="${width - 30}" height="${height - 14}" rx="8" fill="none" stroke="#d9c7a3" stroke-width="1" stroke-dasharray="4 4" opacity="0.25"/>
     ${corner(20, 10)}${corner(width - 20, 10)}${corner(20, height - 10)}${corner(width - 20, height - 10)}`,
    `0 0 ${width} ${height}`,
    width,
    height,
  );
}

/** How often a witch crosses the moon, and how long her crossing takes (s). */
export const WITCH_LAP = 45;
export const WITCH_PASS = 5;

/**
 * A witch on a broomstick, in silhouette, sweeping once across a `width` dp
 * sky, bobbing, her cloak streaming behind her. Mount it for a crossing and
 * unmount it after: an SVG that's animating re-renders even off-screen.
 */
export function witch(width: number, height = 120) {
  const y = height / 2;
  const cloak = (tail: number) => `M50 40 C 36 ${34 + tail}, 22 ${28 + tail * 1.5}, 8 ${32 + tail * 2} C 24 40, 36 44, 52 46 Z`;
  return svg(
    `<g>
      <animateTransform attributeName="transform" type="translate" values="-160 ${y + 20};${width * 0.5} ${y - 10};${width + 160} ${y + 6}" dur="${WITCH_PASS}s" fill="freeze"/>
      <g>
        <animateTransform attributeName="transform" type="translate" values="0 0;0 -6;0 0" dur="1.3s" repeatCount="indefinite"/>
        <g fill="#05030a" transform="translate(-60 -24) scale(0.9)">
          <path d="M6 50 L 116 41" stroke="#05030a" stroke-width="3.5" stroke-linecap="round"/>
          <path d="M8 49 L -16 38 L -22 50 L -16 61 Z"/>
          <path d="${cloak(0)}">
            <animate attributeName="d" values="${cloak(0)};${cloak(-6)};${cloak(0)}" dur="0.7s" repeatCount="indefinite"/>
          </path>
          <path d="M45 44 C 40 30, 50 18, 60 16 L 68 18 C 72 26, 70 36, 74 45 Z"/>
          <circle cx="64" cy="12" r="6"/>
          <path d="M70 11 L 78 14 L 70 15 Z"/>
          <path d="M52 10 L 76 10 L 67 -12 L 73 -18 L 62 -8 Z"/>
          <path d="M63 44 L 67 53 L 75 53" stroke="#05030a" stroke-width="3" fill="none" stroke-linecap="round"/>
        </g>
      </g>
    </g>`,
    `0 0 ${width} ${height}`,
    width,
    height,
  );
}
