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
  // Was a white circle with two dots — at token size that reads as a blank
  // egg, not a monster. Now it has a jaw, a ribcage and shoulders, so the
  // silhouette says "skeleton" before any colour does.
  skeleton: svg(`
    <path d="M22 60 L10 52 M78 60 L90 52" fill="none" stroke-width="6"/>
    <path d="M30 58 L70 58 L66 66 L34 66 Z" fill="#D8CFBE"/>
    <path d="M38 66 L62 66 L60 88 L40 88 Z" fill="#F4EFE3"/>
    <path d="M40 72 L60 72 M40 79 L60 79" fill="none" stroke-width="4"/>
    <path d="M50 66 L50 88" fill="none" stroke-width="3"/>
    <path d="M28 40 Q28 14 50 14 Q72 14 72 40 L72 48 Q72 54 66 54 L34 54 Q28 54 28 48 Z" fill="#F4EFE3"/>
    <path d="M38 54 L38 60 M50 54 L50 60 M62 54 L62 60" fill="none" stroke-width="3"/>
    <ellipse cx="40" cy="36" rx="8" ry="9" fill="${OUT}" stroke="none"/>
    <ellipse cx="60" cy="36" rx="8" ry="9" fill="${OUT}" stroke="none"/>
    <circle cx="41" cy="35" r="2.6" fill="#8BE0D6" stroke="none"/>
    <circle cx="61" cy="35" r="2.6" fill="#8BE0D6" stroke="none"/>
    <path d="M46 46 L50 41 L54 46 Z" fill="${OUT}" stroke="none"/>
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
  ooze: svg(`
    <path d="M14 62 Q14 34 50 34 Q86 34 86 62 L86 74 Q78 68 70 74 Q62 80 54 74 Q46 68 38 74 Q30 80 22 74 L14 74 Z" fill="#5FBF8F"/>
    <path d="M22 50 Q34 40 46 44 Q34 46 26 56 Z" fill="#9FE8C2" stroke="none"/>
    <circle cx="40" cy="56" r="6" fill="#FFF7E0"/>
    <circle cx="62" cy="56" r="6" fill="#FFF7E0"/>
    <circle cx="41" cy="57" r="2.6" fill="${OUT}" stroke="none"/>
    <circle cx="63" cy="57" r="2.6" fill="${OUT}" stroke="none"/>
    <circle cx="30" cy="24" r="5" fill="#5FBF8F"/>
    <circle cx="68" cy="20" r="3.5" fill="#5FBF8F"/>
  `),
  spider: svg(`
    <path d="M30 52 L8 38 M30 60 L6 60 M30 68 L10 82 M70 52 L92 38 M70 60 L94 60 M70 68 L90 82" fill="none" stroke-width="6"/>
    <ellipse cx="50" cy="64" rx="26" ry="22" fill="#4A3358"/>
    <path d="M38 56 Q50 48 62 56 Q50 60 38 56 Z" fill="#7A5B90" stroke="none"/>
    <circle cx="50" cy="36" r="16" fill="#5C4270"/>
    <circle cx="43" cy="34" r="4" fill="#F2C14E" stroke="none"/>
    <circle cx="57" cy="34" r="4" fill="#F2C14E" stroke="none"/>
    <circle cx="47" cy="26" r="2.4" fill="#F2C14E" stroke="none"/>
    <circle cx="55" cy="26" r="2.4" fill="#F2C14E" stroke="none"/>
  `),
  wraith: svg(`
    <path d="M50 10 Q78 16 78 48 Q78 70 72 88 Q64 78 56 88 Q50 78 44 88 Q36 78 28 88 Q22 70 22 48 Q22 16 50 10 Z" fill="#6E7FA8"/>
    <path d="M50 10 Q68 16 72 38 Q60 28 50 28 Z" fill="#95A6CC" stroke="none"/>
    <path d="M30 40 Q40 34 48 42 Q38 44 30 40 Z" fill="${OUT}" stroke="none"/>
    <path d="M70 40 Q60 34 52 42 Q62 44 70 40 Z" fill="${OUT}" stroke="none"/>
    <circle cx="39" cy="40" r="3" fill="#8BE0D6" stroke="none"/>
    <circle cx="61" cy="40" r="3" fill="#8BE0D6" stroke="none"/>
    <path d="M42 62 Q50 74 58 62 Q50 66 42 62 Z" fill="${OUT}" stroke="none"/>
  `),
  ogre: svg(`
    <path d="M26 34 Q26 12 50 12 Q74 12 74 34 L74 52 Q74 76 50 88 Q26 76 26 52 Z" fill="#B08A5E"/>
    <path d="M26 34 Q26 12 50 12 Q66 12 72 26 Q52 20 32 30 Z" fill="#CBA87C" stroke="none"/>
    <path d="M34 30 L44 38 M66 30 L56 38" fill="none" stroke-width="5"/>
    <circle cx="40" cy="46" r="5" fill="#FFF7E0"/>
    <circle cx="60" cy="46" r="5" fill="#FFF7E0"/>
    <circle cx="41" cy="47" r="2.4" fill="${OUT}" stroke="none"/>
    <circle cx="61" cy="47" r="2.4" fill="${OUT}" stroke="none"/>
    <path d="M36 64 Q50 74 64 64 L58 64 L56 70 L50 64 L44 70 L42 64 Z" fill="#FFF7E0"/>
    <path d="M40 58 L40 64 M60 58 L60 64" fill="none" stroke-width="4"/>
  `),
  // The Warden's ring used to spawn with the KNIGHT art — the same picture as
  // Brannok — so the thing barring the crypt door looked like your own fighter.
  // Carved stone, cracked down the face, lit from inside: nothing like a hero.
  warden: svg(`
    <path d="M24 26 L50 16 L76 26 L76 84 L24 84 Z" fill="#7C7A86"/>
    <path d="M24 26 L50 16 L76 26 L50 34 Z" fill="#9C9AA8" stroke="none"/>
    <path d="M30 40 L44 40 L44 52 L30 52 Z" fill="#3A3742"/>
    <path d="M56 40 L70 40 L70 52 L56 52 Z" fill="#3A3742"/>
    <path d="M33 43 L41 43 L41 49 L33 49 Z" fill="#F0762E" stroke="none"/>
    <path d="M59 43 L67 43 L67 49 L59 49 Z" fill="#F0762E" stroke="none"/>
    <path d="M50 34 L50 58" fill="none" stroke-width="4"/>
    <path d="M38 64 L62 64 M38 72 L62 72" fill="none" stroke-width="4"/>
    <path d="M52 16 L46 40 L58 44 L44 84" fill="none" stroke="#4A4753" stroke-width="3"/>
    <path d="M24 56 L14 62 L14 80 M76 56 L86 62 L86 80" fill="none" stroke-width="6"/>
  `),
  // The boss shared the plain skeleton art, so the thing wearing the Ember
  // Crown looked like every other walking bone pile. Bigger skull, burning
  // sockets, and the Crown itself alight on its brow.
  wight: svg(`
    <path d="M50 4 L44 16 L38 8 L34 18 L26 12 L28 24 L50 30 L72 24 L74 12 L66 18 L62 8 L56 16 Z" fill="#F0762E"/>
    <path d="M50 10 L47 18 L53 18 Z" fill="#FFE08A" stroke="none"/>
    <path d="M36 16 L34 22 L39 21 Z" fill="#FFE08A" stroke="none"/>
    <path d="M64 16 L66 22 L61 21 Z" fill="#FFE08A" stroke="none"/>
    <path d="M26 26 L74 26 L74 34 L26 34 Z" fill="#C9A227"/>
    <path d="M24 52 Q24 32 50 32 Q76 32 76 52 L76 62 Q76 70 68 70 L32 70 Q24 70 24 62 Z" fill="#E8E0CE"/>
    <ellipse cx="39" cy="50" rx="9" ry="10" fill="#2A1410" stroke="none"/>
    <ellipse cx="61" cy="50" rx="9" ry="10" fill="#2A1410" stroke="none"/>
    <circle cx="39" cy="50" r="4" fill="#F0762E" stroke="none"/>
    <circle cx="61" cy="50" r="4" fill="#F0762E" stroke="none"/>
    <path d="M45 60 L50 54 L55 60 Z" fill="#2A1410" stroke="none"/>
    <path d="M34 70 L34 78 M42 70 L42 78 M50 70 L50 78 M58 70 L58 78 M66 70 L66 78" fill="none" stroke-width="3"/>
    <path d="M30 78 L70 78 L66 94 L34 94 Z" fill="#E8E0CE"/>
    <path d="M40 84 L60 84 M40 90 L60 90 M50 78 L50 94" fill="none" stroke-width="3"/>
    <path d="M24 60 L10 66 M76 60 L90 66" fill="none" stroke-width="6"/>
  `),
  rat: svg(`
    <path d="M22 34 Q10 24 22 18 Q32 22 32 34 M78 34 Q90 24 78 18 Q68 22 68 34" fill="#8C7A6B"/>
    <path d="M50 26 Q76 32 76 56 Q76 78 50 86 Q24 78 24 56 Q24 32 50 26 Z" fill="#A8968A"/>
    <path d="M50 26 Q66 30 72 44 Q58 36 50 36 Z" fill="#C6B7AC" stroke="none"/>
    <circle cx="40" cy="52" r="4" fill="#D9534F" stroke="none"/>
    <circle cx="60" cy="52" r="4" fill="#D9534F" stroke="none"/>
    <path d="M50 66 Q44 72 46 78 M50 66 Q56 72 54 78" fill="none" stroke-width="4"/>
    <ellipse cx="50" cy="68" rx="5" ry="4" fill="#E0A8A8"/>
  `),
};

// Cartoony tile palette (cel-shade: flat fill + darker edge, no gradients).
// Warmer and more saturated than a literal "wet stone" grey — the board is lit
// by torchlight in the renderer, and mud-grey floors kill that light dead.
export const TILE_COLORS = {
  dungeon: { '#': '#332748', '.': '#6B5A87', ',': '#5D4D77', '~': '#2F6BA8', 'D': '#A9722F', 'L': '#F0762E', edge: '#1E1530', void: '#120C1D' },
  forest:  { '#': '#245730', '.': '#5E9448', ',': '#4F833B', '~': '#2F7FAD', 'D': '#A9722F', 'L': '#F0762E', edge: '#143119', void: '#0C1C11' },
  crypt:   { '#': '#3A2226', '.': '#76575D', ',': '#67494F', '~': '#3A4EA0', 'D': '#8E5526', 'L': '#FF6A2E', edge: '#241318', void: '#150B0E' },
};
