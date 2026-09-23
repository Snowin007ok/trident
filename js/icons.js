/**
 * TRIDENT icon system — original inline SVG, one consistent style:
 * 24×24 grid, no fill, 1.6 stroke, round caps and joins, currentColor.
 * Artefact and badge art use the same geometric language at larger sizes.
 * Nothing here copies a museum object, a logo or a national emblem.
 */

const NS = 'http://www.w3.org/2000/svg';

const PATHS = {
  home: '<path d="M4 11.2 12 4.5l8 6.7"/><path d="M6.4 9.6V19a.8.8 0 0 0 .8.8h3.2V15h3.2v4.8h3.2a.8.8 0 0 0 .8-.8V9.6"/>',
  learn: '<path d="M3.5 5.5h6a2.5 2.5 0 0 1 2.5 2.5v11a2 2 0 0 0-2-2h-6.5z"/><path d="M20.5 5.5h-6A2.5 2.5 0 0 0 12 8v11a2 2 0 0 1 2-2h6.5z"/>',
  quest: '<circle cx="12" cy="12" r="8.2"/><path d="m15 9-2 4.6L8.4 15l2-4.6z"/>',
  saved: '<path d="M7 4.5h10a1 1 0 0 1 1 1v14l-6-3.6-6 3.6v-14a1 1 0 0 1 1-1z"/>',
  progress: '<path d="M4 19.5h16"/><path d="M6.8 19.5v-6"/><path d="M11.6 19.5V8.2"/><path d="M16.4 19.5v-8.6"/>',
  story: '<path d="M6 4.5h10.5a1.5 1.5 0 0 1 1.5 1.5v13.5H7.5A1.5 1.5 0 0 1 6 18z"/><path d="M18 19.5h1.4a.6.6 0 0 0 .6-.6V7.4"/><path d="M9 8.5h6M9 11.5h6M9 14.5h3.5"/>',
  quiz: '<circle cx="12" cy="12" r="8.2"/><circle cx="12" cy="12" r="3.4"/><path d="M12 3.8v2.6M12 17.6v2.6M3.8 12h2.6M17.6 12h2.6"/>',
  event: '<circle cx="12" cy="12" r="8.2"/><path d="M3.8 12h16.4"/><path d="M12 3.8a12.6 12.6 0 0 1 0 16.4 12.6 12.6 0 0 1 0-16.4z"/>',
  flame: '<path d="M12 3.6c2.4 3 3.6 5.1 3.6 6.9a1.8 1.8 0 0 1-3.2 1.1c-.2 2 1.4 2.5 1.4 4.2a2.6 2.6 0 0 1-5.2.2c0-3.4 3.4-4 3.4-12.4z"/><path d="M8.2 9.4c-1 1.5-1.5 3-1.5 4.6a5.3 5.3 0 0 0 10.6 0c0-1-.2-2-.6-2.9"/>',
  check: '<path d="m5 12.6 4.4 4.4L19 7.4"/>',
  cross: '<path d="m6.5 6.5 11 11M17.5 6.5l-11 11"/>',
  lock: '<rect x="5.2" y="10.4" width="13.6" height="9.4" rx="1.4"/><path d="M8.4 10.4V8a3.6 3.6 0 0 1 7.2 0v2.4"/>',
  grip: '<path d="M9 7h.01M9 12h.01M9 17h.01M15 7h.01M15 12h.01M15 17h.01" stroke-width="2.4"/>',
  up: '<path d="m6.5 14 5.5-5.5L17.5 14"/>',
  down: '<path d="m6.5 10 5.5 5.5L17.5 10"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  evidence: '<path d="M6.5 3.8h8.2l4.8 4.8v11.6H6.5z"/><path d="M14.7 3.8v4.8h4.8"/><path d="M9.4 12.4h5.2M9.4 15.6h5.2"/>',
  map: '<path d="m3.8 6.6 5.4-2.2 5.6 2.2 5.4-2.2v13.2l-5.4 2.2-5.6-2.2-5.4 2.2z"/><path d="M9.2 4.4v13.2M14.8 6.6v13.2"/>',
  compassRose: '<circle cx="12" cy="12" r="8.4"/><path d="M12 4.6 13.4 10.6 19.4 12l-6 1.4L12 19.4l-1.4-6L4.6 12l6-1.4z"/>',
  clock: '<circle cx="12" cy="12" r="8.2"/><path d="M12 7.2V12l3.2 2"/>',
  star: '<path d="m12 4.4 2.3 4.9 5.3.7-3.9 3.7 1 5.3-4.7-2.6-4.7 2.6 1-5.3-3.9-3.7 5.3-.7z"/>',
  trophy: '<path d="M8 4.6h8v4.6a4 4 0 0 1-8 0z"/><path d="M8 6.2H5.4v1.4A2.8 2.8 0 0 0 8 10.4M16 6.2h2.6v1.4a2.8 2.8 0 0 1-2.6 2.8"/><path d="M12 13.2v3.2M9 19.4h6"/>',
  info: '<circle cx="12" cy="12" r="8.2"/><path d="M12 11v5.2M12 7.9h.01" stroke-width="2"/>',
  arrowRight: '<path d="M4.6 12h14.8M13.6 6.2 19.4 12l-5.8 5.8"/>',
  refresh: '<path d="M19.4 12a7.4 7.4 0 1 1-2.2-5.2"/><path d="M19.4 5.2V11h-5.8"/>',
  bolt: '<path d="M13.4 3.6 6.2 13.4h5.2l-.8 7 7.2-9.8h-5.2z"/>'
};

export function icon(name, size = 20, extraClass = '') {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.6');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  if (extraClass) svg.setAttribute('class', extraClass);
  svg.innerHTML = PATHS[name] || PATHS.info;
  return svg;
}

function svgWrap(inner, { size = 64, viewBox = '0 0 64 64', cls = '', title = null } = {}) {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', viewBox);
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('fill', 'none');
  if (cls) svg.setAttribute('class', cls);
  if (title) {
    svg.setAttribute('role', 'img');
    svg.innerHTML = `<title>${title}</title>${inner}`;
  } else {
    svg.setAttribute('aria-hidden', 'true');
    svg.innerHTML = inner;
  }
  return svg;
}

/* ---------------------------------------------------------- level emblems */
/* Five medallions that gain structure as the learner advances. */
const EMBLEMS = {
  1: `<circle cx="32" cy="32" r="25" stroke="currentColor" stroke-width="2.4"/>
      <path d="M32 15v34M15 32h34" stroke="currentColor" stroke-width="1.6" opacity=".55"/>
      <circle cx="32" cy="32" r="5.5" fill="currentColor"/>`,
  2: `<circle cx="32" cy="32" r="25" stroke="currentColor" stroke-width="2.4"/>
      <path d="M32 11.5 37 27l15.5 5L37 37l-5 15.5L27 37l-15.5-5L27 27z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>`,
  3: `<circle cx="32" cy="32" r="25" stroke="currentColor" stroke-width="2.4"/>
      <path d="M32 11.5 37 27l15.5 5L37 37l-5 15.5L27 37l-15.5-5L27 27z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
      <circle cx="32" cy="32" r="8" stroke="currentColor" stroke-width="1.6"/>`,
  4: `<circle cx="32" cy="32" r="25" stroke="currentColor" stroke-width="2.4"/>
      <circle cx="32" cy="32" r="18" stroke="currentColor" stroke-width="1.4" opacity=".6"/>
      <path d="M32 11.5 37 27l15.5 5L37 37l-5 15.5L27 37l-15.5-5L27 27z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
      <path d="m45 19-26 26M19 19l26 26" stroke="currentColor" stroke-width="1.2" opacity=".45"/>`,
  5: `<circle cx="32" cy="32" r="25" stroke="currentColor" stroke-width="2.6"/>
      <circle cx="32" cy="32" r="19" stroke="currentColor" stroke-width="1.4" opacity=".6"/>
      <path d="M32 11.5 37 27l15.5 5L37 37l-5 15.5L27 37l-15.5-5L27 27z" fill="currentColor" opacity=".18"/>
      <path d="M32 11.5 37 27l15.5 5L37 37l-5 15.5L27 37l-15.5-5L27 27z" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/>
      <circle cx="32" cy="32" r="4.5" fill="currentColor"/>`
};

export function levelEmblem(level, size = 56, cls = 'level-emblem') {
  const svg = svgWrap(EMBLEMS[Math.min(5, Math.max(1, level))], { size, cls });
  svg.style.color = 'var(--gold)';
  return svg;
}

/* -------------------------------------------------------- gateway motifs */
const MOTIFS = {
  tn: `<path d="M10 86c14-10 22-28 22-46 0 18 8 36 22 46" stroke="currentColor" stroke-width="2"/>
       <path d="M32 18v22" stroke="currentColor" stroke-width="2"/>
       <path d="M22 40h20M18 52h28M14 64h36" stroke="currentColor" stroke-width="1.4" opacity=".7"/>
       <circle cx="32" cy="14" r="4" stroke="currentColor" stroke-width="2"/>`,
  cbse: `<rect x="12" y="18" width="40" height="52" rx="2" stroke="currentColor" stroke-width="2"/>
         <path d="M20 30h24M20 40h24M20 50h16" stroke="currentColor" stroke-width="1.6"/>
         <path d="M12 18 32 6l20 12" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>`,
  tnpsc: `<circle cx="32" cy="42" r="24" stroke="currentColor" stroke-width="2"/>
          <path d="M8 42h48" stroke="currentColor" stroke-width="1.5"/>
          <path d="M32 18a30 30 0 0 1 0 48 30 30 0 0 1 0-48z" stroke="currentColor" stroke-width="1.5"/>
          <path d="M32 6v10" stroke="currentColor" stroke-width="2"/>`
};

export function gatewayMotif(pathId, size = 132) {
  const svg = svgWrap(MOTIFS[pathId] || MOTIFS.cbse, { size, viewBox: '0 0 64 92', cls: 'g-motif' });
  return svg;
}

/* --------------------------------------------------------------- artefacts
   Original abstract line drawings. They are illustrative marks for the
   collection, not reproductions of any specific historical object.        */
const ARTEFACTS = {
  coin: `<circle cx="44" cy="44" r="31" stroke="currentColor" stroke-width="2.4"/>
         <circle cx="44" cy="44" r="24" stroke="currentColor" stroke-width="1.2" opacity=".6"/>
         <path d="M44 27v34M27 44h34" stroke="currentColor" stroke-width="1.6" opacity=".8"/>
         <path d="m34 34 20 20M54 34 34 54" stroke="currentColor" stroke-width="1.2" opacity=".5"/>
         <circle cx="44" cy="44" r="5" fill="currentColor" opacity=".7"/>`,
  inscription: `<path d="M18 14h52v60H18z" stroke="currentColor" stroke-width="2.4"/>
                <path d="M18 14 26 6h44l-8 8" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
                <path d="M26 28h36M26 38h36M26 48h28M26 58h20" stroke="currentColor" stroke-width="1.6" opacity=".8"/>`,
  manuscript: `<rect x="8" y="26" width="72" height="34" rx="3" stroke="currentColor" stroke-width="2.4"/>
               <path d="M8 34h72M8 52h72" stroke="currentColor" stroke-width="1.2" opacity=".55"/>
               <path d="M22 43h12M42 43h24" stroke="currentColor" stroke-width="1.6"/>
               <circle cx="38" cy="43" r="3" stroke="currentColor" stroke-width="1.6"/>
               <path d="M8 26 4 18M80 26l4-8M8 60l-4 8M80 60l4 8" stroke="currentColor" stroke-width="1.4"/>`,
  seal: `<path d="M44 8 66 20v24L44 76 22 44V20z" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/>
         <path d="M32 26h24v18H32z" stroke="currentColor" stroke-width="1.6"/>
         <path d="M38 34h12" stroke="currentColor" stroke-width="1.6"/>
         <path d="M44 44v14" stroke="currentColor" stroke-width="1.4" opacity=".7"/>`,
  monument: `<path d="M14 76h60" stroke="currentColor" stroke-width="2.4"/>
             <path d="M22 76V34h44v42" stroke="currentColor" stroke-width="2.2"/>
             <path d="M22 34 44 12l22 22" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/>
             <path d="M32 76V50h8v26M48 76V50h8v26" stroke="currentColor" stroke-width="1.6"/>
             <path d="M60 34l6 6" stroke="currentColor" stroke-width="1.2" opacity=".5"/>`,
  instrument: `<circle cx="44" cy="44" r="30" stroke="currentColor" stroke-width="2.4"/>
               <circle cx="44" cy="44" r="20" stroke="currentColor" stroke-width="1.2" opacity=".6"/>
               <path d="M44 14v8M44 66v8M14 44h8M66 44h8" stroke="currentColor" stroke-width="2"/>
               <path d="m56 32-8 20-20 8 8-20z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
               <circle cx="44" cy="44" r="2.6" fill="currentColor"/>`
};

export function artefactArt(id, size = 88) {
  const svg = svgWrap(ARTEFACTS[id] || ARTEFACTS.coin, { size, viewBox: '0 0 88 88', cls: 'artefact-art' });
  svg.setAttribute('stroke-linecap', 'round');
  svg.style.color = 'currentColor';
  return svg;
}

/* ------------------------------------------------------------------ badges
   Each badge is a medallion with a distinct interior mark.                */
const BADGES = {
  'first-step': `<circle cx="32" cy="32" r="26" stroke="currentColor" stroke-width="2.2"/>
                 <path d="m20 34 8 8 16-18" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`,
  timekeeper: `<circle cx="32" cy="32" r="26" stroke="currentColor" stroke-width="2.2"/>
               <circle cx="32" cy="32" r="16" stroke="currentColor" stroke-width="1.6"/>
               <path d="M32 21v11l8 5" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>`,
  'perfect-recall': `<circle cx="32" cy="32" r="26" stroke="currentColor" stroke-width="2.2"/>
                     <path d="m32 15 4.6 9.8 10.6 1.5-7.7 7.3 1.9 10.6L32 39.2l-9.4 5 1.9-10.6-7.7-7.3 10.6-1.5z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>`,
  'three-day-flame': `<circle cx="32" cy="32" r="26" stroke="currentColor" stroke-width="2.2"/>
                      <path d="M32 16c4 5 6 8.4 6 11.4a3 3 0 0 1-5.4 1.8c-.3 3.3 2.4 4.2 2.4 7a4.4 4.4 0 0 1-8.8.3c0-5.7 5.8-6.7 5.8-20.5z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>`,
  'ancient-explorer': `<circle cx="32" cy="32" r="26" stroke="currentColor" stroke-width="2.2"/>
                       <path d="M18 44h28" stroke="currentColor" stroke-width="2.2"/>
                       <path d="M22 44V28h20v16" stroke="currentColor" stroke-width="2"/>
                       <path d="M22 28l10-10 10 10" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>`,
  'story-keeper': `<circle cx="32" cy="32" r="26" stroke="currentColor" stroke-width="2.2"/>
                   <path d="M23 19h14a3 3 0 0 1 3 3v23l-10-5-10 5V22a3 3 0 0 1 3-3z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>`
};

export function badgeArt(id, size = 62) {
  const svg = svgWrap(BADGES[id] || BADGES['first-step'], { size, cls: 'badge-art' });
  svg.setAttribute('stroke-linecap', 'round');
  return svg;
}

/* --------------------------------------------------------------- era icons */
const ERA_ICONS = {
  origins: '<path d="M4.6 17.4 9 9l3.4 5.2L15 11l4.4 6.4z"/><circle cx="8" cy="6.4" r="2"/>',
  ancient: '<path d="M4 19h16"/><path d="M6.6 19V9h10.8v10"/><path d="m6.6 9 5.4-5 5.4 5"/>',
  medieval: '<path d="M5 19.4V8.2l2.6 2 2.4-3.4 2 3.4 2-3.4 2.4 3.4 2.6-2v11.2z"/><path d="M9.6 19.4v-4.2h4.8v4.2"/>',
  colonial: '<path d="M12 3.6v13.8"/><path d="M12 6.4 19 9l-7 2.6z"/><path d="M4.6 17.4h14.8l-2 3H6.6z"/>',
  independence: '<path d="M6.4 20.4V4.2"/><path d="M6.4 5.4h11.2l-2.4 3.6 2.4 3.6H6.4z"/>'
};

export function eraIcon(id, size = 20) {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.6');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = ERA_ICONS[id] || ERA_ICONS.origins;
  return svg;
}

/* -------------------------------------------- decorative journey threads */
/** Three low-contrast threads (saffron, ivory, green) behind the header. */
export function journeyThreads() {
  const wrap = document.createElement('div');
  wrap.className = 'journey-threads';
  wrap.setAttribute('aria-hidden', 'true');
  wrap.innerHTML = `
    <svg viewBox="0 0 1200 260" preserveAspectRatio="none" focusable="false">
      <path class="jt-s" d="M-20 70 C 220 20, 420 130, 660 90 S 1040 30, 1220 78" fill="none"/>
      <path class="jt-i" d="M-20 128 C 240 88, 440 188, 680 146 S 1050 92, 1220 134" fill="none"/>
      <path class="jt-g" d="M-20 186 C 260 150, 460 240, 700 200 S 1060 152, 1220 190" fill="none"/>
    </svg>`;
  return wrap;
}

/** Small expedition path illustration for the "current expedition" panel. */
export function expeditionPath(percent) {
  const p = Math.max(0, Math.min(100, percent));
  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <svg class="expedition-mini" viewBox="0 0 200 80" preserveAspectRatio="none" role="img"
         aria-label="Expedition progress: ${Math.round(p)} percent of this book's lessons complete">
      <path d="M8 62 C 48 62, 56 22, 96 22 S 152 58, 192 18" fill="none"
            stroke="var(--line)" stroke-width="3" stroke-linecap="round"/>
      <path d="M8 62 C 48 62, 56 22, 96 22 S 152 58, 192 18" fill="none"
            stroke="var(--india-saffron)" stroke-width="3" stroke-linecap="round"
            pathLength="100" stroke-dasharray="100" stroke-dashoffset="${100 - p}"/>
      <circle cx="8" cy="62" r="4" fill="var(--india-green)"/>
      <circle cx="192" cy="18" r="4" fill="none" stroke="var(--gold)" stroke-width="2"/>
    </svg>`;
  return wrap.firstElementChild;
}

/** Tricolour rule: three horizontal bands, never rotated or skewed. */
export function tricolourRule(className = 'tricolour-rule') {
  const wrap = document.createElement('div');
  wrap.className = className;
  wrap.setAttribute('aria-hidden', 'true');
  wrap.innerHTML = '<i></i><i></i><i></i>';
  return wrap;
}
