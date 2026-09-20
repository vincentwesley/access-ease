// Pure CSS generation. buildCss(settings, fonts) returns '' when nothing is changed.
//
// Text size: CSS cannot multiply an arbitrary px value, so the builder emits
// TOKENS that lib/inject.js resolves inside the page, where the page's own
// computed sizes can be read:
//  1. `html{font-size:__AE_ROOT(N)__ !important}` becomes an ABSOLUTE size,
//     round1(original root px * N / 100). An absolute value (not a percentage)
//     means sites with `html{font-size:62.5%}` scale by exactly N%, not 2.4x.
//     This scales everything sized in rem/em/%.
//  2. A floor block (`body :is(text elements){font-size:max(1em,__AE_BASE(N)__)}`,
//     heading floors of 1.6/1.35/1.2/1.05 x base, and `height:auto` on inputs),
//     wrapped in AE_FLOOR markers. The injected function keeps it ONLY when
//     sampled body text did not grow after step 1 (i.e. the site sizes text in
//     px). It sets the floor to the sampled paragraph size * N/100, so text on
//     px sites grows; small print inside such text is lifted to that size
//     (limitation, see IMPLEMENTATION_NOTES.md). `zoom` is not used: it breaks
//     layouts, fixed positioning and selection on many pages.
//
// Contrast: colour overrides only (no CSS filter), so photos, video, canvas, svg
// and iframes are untouched. Background *images* are kept. Button-like elements
// get a 2px border so they stay recognisable once their fill is flattened, and
// ::before/::after pseudo-elements (icon glyphs) get the foreground colour.

const MEDIA_EXCLUDE =
  ':not(img):not(picture):not(video):not(canvas):not(svg):not(svg *):not(iframe)';

const TEXT_ELEMENTS =
  'p,li,dd,dt,td,th,blockquote,figcaption,label,summary,input,textarea,select,button';

// Elements whose font must not be replaced (icon fonts, code).
const FONT_EXCLUDE =
  ':not(code):not(pre):not(kbd):not(samp):not(i[class]):not([class*="icon" i]):not([class*="fa-"]):not([class*="material" i]):not(svg):not(svg *)';

const PALETTES = {
  dark: { bg: '#000000', fg: '#ffffff', link: '#9ec1ff', visited: '#d9b3ff' },
  light: { bg: '#ffffff', fg: '#000000', link: '#0000ee', visited: '#551a8b' },
};

const B = ' !important';

const BUTTONLIKE =
  'button,[role="button"],[type="button"],[type="submit"],a[class*="btn" i],a[class*="button" i]';
// Things that are usually filled with a gradient or image: badges, chips, pills, tags.
const CHIPLIKE = '[class*="badge" i],[class*="chip" i],[class*="pill" i],[class~="tag" i]';
const HEADING_FLOORS = [['h1', 1.6], ['h2', 1.35], ['h3', 1.2], ['h4,h5,h6', 1.05]];

function textScaleCss(scale) {
  if (!(scale > 100)) return '';
  return [
    `html{font-size:__AE_ROOT(${scale})__${B}}`,
    // Floor block (px-sized sites only, see the header): body text, headings that
    // must never end up smaller than body text, and inputs that must not clip.
    `/*AE_FLOOR_START*/body :is(${TEXT_ELEMENTS}){font-size:max(1em,__AE_BASE(${scale})__)${B}}`,
    ...HEADING_FLOORS.map(
      ([sel, m]) => `body :is(${sel}){font-size:max(1em,calc(__AE_BASE(${scale})__ * ${m}))${B}}`,
    ),
    `body :is(input,textarea,select){height:auto${B}}/*AE_FLOOR_END*/`,
  ].join('\n');
}

function contrastCss(mode) {
  const p = PALETTES[mode];
  if (!p) return '';
  return [
    `html,body,body *${MEDIA_EXCLUDE}{background-color:${p.bg}${B};color:${p.fg}${B};text-shadow:none${B}}`,
    `body input,body textarea,body select,body button{border-color:${p.fg}${B}}`,
    // Invalid fields keep their own cue: dashed outline instead of the solid button border.
    `body :is(${BUTTONLIKE}):not(:invalid):not([aria-invalid="true"]){border:2px solid ${p.fg}${B}}`,
    `body :is(input,select,textarea,button):invalid,body [aria-invalid="true"]{outline:2px dashed ${p.fg}${B};outline-offset:2px${B}}`,
    `body :is(${BUTTONLIKE},${CHIPLIKE}){background-image:none${B}}`,
    `body *::before,body *::after{color:${p.fg}${B}}`,
    `body ::placeholder{color:${p.fg}${B};opacity:.75${B}}`,
    `body a:any-link,body a:any-link *${MEDIA_EXCLUDE}{color:${p.link}${B}}`,
    `body a:visited,body a:visited *${MEDIA_EXCLUDE}{color:${p.visited}${B}}`,
    `body a:any-link::before,body a:any-link::after{color:${p.link}${B}}`,
    `body a:visited::before,body a:visited::after{color:${p.visited}${B}}`,
  ].join('\n');
}

function fontFaceCss(fonts) {
  const { fontUrlRegular, fontUrlBold } = fonts || {};
  if (!fontUrlRegular) return '';
  const face = (weight, url) =>
    `@font-face{font-family:"AccessEase OpenDyslexic";font-weight:${weight};font-style:normal;font-display:swap;src:url("${url}") format("woff2")}`;
  const faces = [face(400, fontUrlRegular)];
  if (fontUrlBold) faces.push(face(700, fontUrlBold));
  return faces.join('\n');
}

function dyslexiaCss(fonts) {
  return [
    fontFaceCss(fonts),
    `html,body,body *${FONT_EXCLUDE}{font-family:"AccessEase OpenDyslexic",sans-serif${B};word-spacing:.05em${B}}`,
    `body :is(${TEXT_ELEMENTS},div,span,a,h1,h2,h3,h4,h5,h6){line-height:1.6${B}}`,
  ]
    .filter(Boolean)
    .join('\n');
}

function motionCss() {
  // Near-zero duration (not `none`) so elements that animate *in* still end visible.
  return `*,*::before,*::after{animation-duration:.001ms${B};animation-delay:0s${B};animation-iteration-count:1${B};transition-duration:0s${B};transition-delay:0s${B};scroll-behavior:auto${B}}`;
}

/** Font URLs for a given chrome.runtime.getURL-like function. */
export function fontUrls(getURL) {
  return {
    fontUrlRegular: getURL('fonts/OpenDyslexic-Regular.woff2'),
    fontUrlBold: getURL('fonts/OpenDyslexic-Bold.woff2'),
  };
}

export function buildCss(settings, fonts = {}) {
  const s = settings || {};
  const parts = [textScaleCss(s.textScale), contrastCss(s.contrast)];
  if (s.dyslexiaFont) parts.push(dyslexiaCss(fonts));
  if (s.reduceMotion) parts.push(motionCss());
  return parts.filter(Boolean).join('\n');
}
