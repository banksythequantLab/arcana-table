// ── Arcana Table · placeholder token art ─────────────────────────────────────
// Cel-shaded cartoon style: flat fills, chunky dark outlines, one highlight.
// These are stand-ins with the same silhouette language the final AI art batch
// will use (see README · Art pipeline).

const OUT = '#2E2233';   // outline ink
const SW = 7;            // outline weight

function svg(body) {
  const doc = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
    <g stroke="${OUT}" stroke-width="${SW}" stroke-linejoin="round" stroke-linecap="round">${body}</g></svg>`;
  const img = new Image();
  img.src = 'data:image/svg+xml;utf8,' + encodeURIComponent(doc);
  return img;
}

export const TOKEN_ART = {
  knight: svg(`
    <path d="M50 14 L72 26 L72 52 Q72 74 50 86 Q28 74 28 52 L28 26 Z" fill="#4E7BD0"/>
    <path d="M50 14 L72 26 L72 40 L50 30 Z" fill="#7FA8EA" stroke="none"/>
    <path d="M36 44 L64 44" fill="none"/>
    <circle cx="42" cy="54" r="4" fill="${OUT}" stroke="none"/>
    <circle cx="58" cy="54" r="4" fill="${OUT}" stroke="none"/>
    <path d="M50 30 L50 86" fill="none" stroke-width="5"/>
    <path d="M42 16 L50 6 L58 16" fill="#F2C14E"/>
  `),
  wizard: svg(`
    <circle cx="50" cy="58" r="26" fill="#F4D8B8"/>
    <path d="M24 40 L50 6 L76 40 Q50 30 24 40 Z" fill="#7A4FBF"/>
    <path d="M50 6 L62 22" fill="none" stroke-width="5"/>
    <circle cx="70" cy="14" r="6" fill="#F2C14E"/>
    <circle cx="41" cy="56" r="4" fill="${OUT}" stroke="none"/>
    <circle cx="59" cy="56" r="4" fill="${OUT}" stroke="none"/>
    <path d="M36 72 Q50 92 64 72 Q57 80 50 78 Q43 80 36 72 Z" fill="#E8E4EC"/>
  `),
  goblin: svg(`
    <path d="M18 40 L38 32 M82 40 L62 32" fill="none"/>
    <path d="M14 36 Q26 22 38 32 L38 44 Q24 46 14 36 Z" fill="#79B255"/>
    <path d="M86 36 Q74 22 62 32 L62 44 Q76 46 86 36 Z" fill="#79B255"/>
    <circle cx="50" cy="54" r="30" fill="#8FCB66"/>
    <circle cx="40" cy="48" r="6" fill="#FFF7E0"/>
    <circle cx="62" cy="48" r="6" fill="#FFF7E0"/>
    <circle cx="41" cy="49" r="2.6" fill="${OUT}" stroke="none"/>
    <circle cx="63" cy="49" r="2.6" fill="${OUT}" stroke="none"/>
    <path d="M38 68 Q50 78 64 66 L58 72 L52 66 L46 73 L40 68 Z" fill="#FFF7E0"/>
  `),
  skeleton: svg(`
    <circle cx="50" cy="46" r="28" fill="#F4EFE3"/>
    <path d="M34 74 L66 74 L62 92 L38 92 Z" fill="#F4EFE3"/>
    <circle cx="40" cy="42" r="7" fill="${OUT}" stroke="none"/>
    <circle cx="60" cy="42" r="7" fill="${OUT}" stroke="none"/>
    <circle cx="42" cy="40" r="2" fill="#8BE0D6" stroke="none"/>
    <circle cx="62" cy="40" r="2" fill="#8BE0D6" stroke="none"/>
    <path d="M42 62 L58 62 M46 58 L46 66 M54 58 L54 66" fill="none" stroke-width="4"/>
  `),
  dragon: svg(`
    <path d="M20 30 Q8 18 24 14 L34 26 M80 30 Q92 18 76 14 L66 26" fill="#B33A3A"/>
    <path d="M50 12 Q80 18 82 50 Q82 78 50 88 Q18 78 18 50 Q20 18 50 12 Z" fill="#D9534F"/>
    <path d="M50 12 Q66 16 74 32 Q60 26 50 28 Z" fill="#F08A7E" stroke="none"/>
    <path d="M32 46 Q38 40 44 46" fill="none"/>
    <path d="M56 46 Q62 40 68 46" fill="none"/>
    <circle cx="38" cy="50" r="3.4" fill="#F2C14E" stroke="none"/>
    <circle cx="62" cy="50" r="3.4" fill="#F2C14E" stroke="none"/>
    <path d="M36 66 Q50 76 64 66" fill="none"/>
    <path d="M40 68 L42 74 M50 71 L50 78 M60 68 L58 74" fill="none" stroke-width="4"/>
  `),
  wolf: svg(`
    <path d="M26 30 L34 12 L44 28 M74 30 L66 12 L56 28" fill="#8C93A8"/>
    <path d="M50 24 Q76 28 76 54 Q76 78 50 86 Q24 78 24 54 Q24 28 50 24 Z" fill="#A6ADC2"/>
    <path d="M50 24 Q66 28 72 44 Q58 36 50 36 Z" fill="#C9CEDD" stroke="none"/>
    <circle cx="40" cy="50" r="4" fill="#F2C14E" stroke="none"/>
    <circle cx="60" cy="50" r="4" fill="#F2C14E" stroke="none"/>
    <path d="M44 66 Q50 72 56 66 L50 78 Z" fill="#3E3A4A"/>
  `),
  chest: svg(`
    <path d="M18 44 Q18 26 50 26 Q82 26 82 44 L82 50 L18 50 Z" fill="#B07B3E"/>
    <path d="M18 50 L82 50 L82 80 L18 80 Z" fill="#8A5A2B"/>
    <path d="M18 50 L82 50" fill="none"/>
    <path d="M44 44 L56 44 L56 62 L44 62 Z" fill="#F2C14E"/>
    <circle cx="50" cy="55" r="3" fill="${OUT}" stroke="none"/>
    <path d="M26 32 Q34 28 42 27 M26 62 L26 74 M74 62 L74 74" fill="none" stroke-width="4"/>
  `),
  villager: svg(`
    <circle cx="50" cy="40" r="22" fill="#F4D8B8"/>
    <path d="M28 46 Q28 24 50 22 Q72 24 72 46 Q60 38 50 38 Q40 38 28 46 Z" fill="#8A5A2B"/>
    <circle cx="42" cy="42" r="3.6" fill="${OUT}" stroke="none"/>
    <circle cx="58" cy="42" r="3.6" fill="${OUT}" stroke="none"/>
    <path d="M42 52 Q50 58 58 52" fill="none"/>
    <path d="M30 92 Q32 66 50 66 Q68 66 70 92 Z" fill="#5F8F5A"/>
  `),
};

// Cartoony tile palette (cel-shade: flat fill + darker edge, no gradients)
export const TILE_COLORS = {
  dungeon: { '#': '#3A2E4A', '.': '#8C7B9C', ',': '#7A6A8A', '~': '#3E7BB5', 'D': '#B07B3E', 'L': '#E0662E', edge: '#2E2233', floorDot: '#9E8FAE' },
  forest:  { '#': '#2E5B33', '.': '#7CAF5C', ',': '#6B9E4E', '~': '#3E8BB5', 'D': '#B07B3E', 'L': '#E0662E', edge: '#1F4023', floorDot: '#8CBd6C' },
  crypt:   { '#': '#33262B', '.': '#7D6E74', ',': '#6D5E64', '~': '#3E5BB5', 'D': '#8A5A2B', 'L': '#E8562E', edge: '#241A1E', floorDot: '#8D7E84' },
};
