/* ───────── Motywnik ─────────
 * Style całego interfejsu gry dopasowane do jego budowy (klasy NI: c-window/border-window, interface-element-*,
 * widget-button, button.small.*, card/tabs-nav, main-column, top/bottom positioner…).
 *
 * Zasady „jak grafik":
 *   • nic nie zmienia rozmiarów — tylko kolory, tła, obrazki ramek (ta sama geometria cięcia) i krój pisma
 *     o węższych/zbliżonych proporcjach (Roboto zamiast Arimo), bez zmiany wielkości liter;
 *   • grafiki gry (ornamenty pasków, kafelki slotów, tekstury) są PRZEBARWIANE, a nie wyrzucane — zostaje ich
 *     rysunek, zmienia się kolorystyka;
 *   • ramki okien i panele (border-image) są rysowane od nowa w SVG o identycznych wymiarach cięcia;
 *   • ikony, przedmioty, postacie i mapa — bez zmian.
 */
(() => {
  let cfg, styleEl = null, fontEl = null, mo = null;
  const svg = (s) => `url("data:image/svg+xml,${encodeURIComponent(s)}")`;
  const grain = svg(`<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='3' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 .04 0'/></filter><rect width='100%' height='100%' filter='url(#n)'/></svg>`);

  /* ── palety ── */
  const THEMES = {
    domyslny: { name: 'Domyślny', desc: 'Klasyczny interfejs gry, bez zmian.', none: true },
    dark: {
      m: ['#eef1f5', '#9aa3b0', '#3b414b'], orn: 'rivet', name: 'Dark Theme', desc: 'Grafit i czerń, chłodna stal, spokojne światło.',
      bg0: '#0a0b0d', bg1: '#121317', bg2: '#1a1c21', line: '#30343c', line2: '#21242a', a1: '#cfd5df', a2: '#7f8897', text: '#e6e8ec', text2: '#9ba1ab',
      glow: 'rgba(200,212,232,.10)', edge: 'rgba(160,175,200,.10)', tint: 'grayscale(1) brightness(.55) contrast(1.1)', blend: '#1b1c1f',
      btn: ['#2b2e35', '#1b1d22'], btnLine: '#3d424c', btnText: '#f1f3f6', head: '"Roboto", Arial, sans-serif', fonts: ['Roboto:wght@400;500;700'],
    },
    zorza: {
      m: ['#e3f8ff', '#86bfe6', '#27466e'], orn: 'star', star: '#f2fdff', name: 'Zorza', desc: 'Nocny granat i świecące pasma zorzy: turkus, błękit, fiolet.',
      bg0: '#050b16', bg1: '#0a1426', bg2: '#10203a', line: '#22426a', line2: '#152c4a', a1: '#2ef2c4', a2: '#8a5cff', a3: '#3fa9ff', text: '#e6f3ff', text2: '#8fb0cc',
      glow: 'rgba(46,242,196,.30)', edge: 'rgba(63,169,255,.22)', tint: 'grayscale(1) brightness(.5) sepia(1) hue-rotate(170deg) saturate(2.4)', blend: '#0e2340',
      btn: ['#13405a', '#0b2539'], btnLine: 'rgba(46,242,196,.55)', btnText: '#e2fff8', head: '"Exo 2", "Roboto", Arial, sans-serif', fonts: ['Roboto:wght@400;500;700', 'Exo+2:wght@600;700'],
    },
    neon: {
      m: ['#ffe0f8', '#d65bdc', '#4a1660'], orn: 'diamond', name: 'Neon', desc: 'Ciemny fiolet, różowy i turkusowy neon z poświatą.',
      bg0: '#07040f', bg1: '#0e0819', bg2: '#170d29', line: '#4a2470', line2: '#25133e', a1: '#ff2bd6', a2: '#00e5ff', text: '#f5ecff', text2: '#ab9cc9',
      glow: 'rgba(255,43,214,.38)', edge: 'rgba(0,229,255,.28)', tint: 'grayscale(1) brightness(.45) sepia(1) hue-rotate(245deg) saturate(3)', blend: '#1d0f33',
      btn: ['#251238', '#140a22'], btnLine: '#ff2bd6', btnText: '#ffe8fb', head: '"Rajdhani", "Roboto", Arial, sans-serif', fonts: ['Roboto:wght@400;500;700', 'Rajdhani:wght@600;700'],
    },
    obsydian: {
      m: ['#ffd2a6', '#b06a3c', '#3e2617'], orn: 'ember', name: 'Obsydian', desc: 'Czerń i ciemny metal, bardzo subtelny żar.',
      bg0: '#0a0908', bg1: '#131110', bg2: '#1b1816', line: '#3c3530', line2: '#26211e', a1: '#ff8a3d', a2: '#b9471a', text: '#eee6dc', text2: '#a69c91',
      glow: 'rgba(255,120,50,.18)', edge: 'rgba(255,110,40,.10)', tint: 'grayscale(1) brightness(.5) sepia(.55) hue-rotate(-12deg) saturate(1.3)', blend: '#1e1713',
      btn: ['#2b2623', '#1a1715'], btnLine: 'rgba(205,100,45,.6)', btnText: '#f6ece1', head: '"Marcellus SC", "Roboto", Georgia, serif', fonts: ['Roboto:wght@400;500;700', 'Marcellus+SC'],
    },
    glebia: {
      m: ['#dafcff', '#5bb9cf', '#143f50'], orn: 'drop', name: 'Głębia', desc: 'Ciemny ocean i chłodne, błękitne światło.',
      bg0: '#04101a', bg1: '#081b2a', bg2: '#0c273b', line: '#185070', line2: '#0f364c', a1: '#38bdf8', a2: '#22d3ee', text: '#e3f6ff', text2: '#8db7cc',
      glow: 'rgba(56,189,248,.28)', edge: 'rgba(34,211,238,.18)', tint: 'grayscale(1) brightness(.5) sepia(1) hue-rotate(160deg) saturate(2.2)', blend: '#0b2438',
      btn: ['#10405d', '#0a283c'], btnLine: 'rgba(56,189,248,.6)', btnText: '#e6f8ff', head: '"Exo 2", "Roboto", Arial, sans-serif', fonts: ['Roboto:wght@400;500;700', 'Exo+2:wght@600;700'],
    },
  };

  /* ── grafiki ramek (SVG) — wymiary cięcia jak w grze ── */
  const strip = (t) => `<linearGradient id='a' x1='0' x2='1'><stop offset='0' stop-color='${t.a1}' stop-opacity='0'/><stop offset='.2' stop-color='${t.a1}'/><stop offset='.55' stop-color='${t.a3 || t.a2}'/><stop offset='.85' stop-color='${t.a2}'/><stop offset='1' stop-color='${t.a2}' stop-opacity='0'/></linearGradient><filter id='g' x='-10%' y='-200%' width='120%' height='500%'><feGaussianBlur stdDeviation='2.2'/></filter>`;
  /* ── grafika metalu ──
   * Emblemat w narożnikach i na plakietkach: gwiazda (Zorza), nit (Dark), romb (Neon), żar (Obsydian), kropla (Głębia). */
  function emblem(t, cx, cy, r) {
    const [m1, m2, m3] = t.m;
    if (t.orn === 'star') {
      const k = r * 0.3;
      return `<path d='M${cx},${cy - r} L${cx + k},${cy - k} L${cx + r},${cy} L${cx + k},${cy + k} L${cx},${cy + r} L${cx - k},${cy + k} L${cx - r},${cy} L${cx - k},${cy - k}Z' fill='${t.star}' stroke='${m2}' stroke-width='.4'/><circle cx='${cx}' cy='${cy}' r='${r * 0.9}' fill='${t.a1}' opacity='.18'/>`;
    }
    if (t.orn === 'diamond') return `<path d='M${cx},${cy - r} L${cx + r},${cy} L${cx},${cy + r} L${cx - r},${cy}Z' fill='${t.a1}' stroke='${m1}' stroke-width='.6'/><path d='M${cx},${cy - r * 0.5} L${cx + r * 0.5},${cy} L${cx},${cy + r * 0.5} L${cx - r * 0.5},${cy}Z' fill='${m1}' opacity='.55'/>`;
    if (t.orn === 'ember') return `<path d='M${cx},${cy - r} L${cx + r * 0.75},${cy} L${cx},${cy + r} L${cx - r * 0.75},${cy}Z' fill='#ff7a2a' stroke='${m3}' stroke-width='.6'/><circle cx='${cx}' cy='${cy}' r='${r * 0.35}' fill='#ffd08a'/>`;
    if (t.orn === 'drop') return `<circle cx='${cx}' cy='${cy}' r='${r * 0.8}' fill='${t.a1}' stroke='${m1}' stroke-width='.6'/><circle cx='${cx - r * 0.25}' cy='${cy - r * 0.3}' r='${r * 0.25}' fill='#fff' opacity='.7'/>`;
    return `<circle cx='${cx}' cy='${cy}' r='${r * 0.75}' fill='url(#mr)' stroke='${m3}' stroke-width='.6'/><circle cx='${cx - r * 0.2}' cy='${cy - r * 0.25}' r='${r * 0.22}' fill='${m1}' opacity='.8'/>`;
  }
  const metalDefs = (t) => `<linearGradient id='mp' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='${t.m[0]}'/><stop offset='.45' stop-color='${t.m[1]}'/><stop offset='1' stop-color='${t.m[2]}'/></linearGradient><radialGradient id='mr' cx='.35' cy='.3' r='.8'><stop offset='0' stop-color='${t.m[0]}'/><stop offset='.6' stop-color='${t.m[1]}'/><stop offset='1' stop-color='${t.m[2]}'/></radialGradient>`;
  /*
   * Ramka okna: 80×104, cięcie 32 (góra/dół) i 20 (boki), krawędzie powtarzane (round) — dzięki temu ozdoby na
   * krawędziach (gwiazdki Zorzy) nie rozciągają się. Metalowa obwódka z cieniowaniem w poprzek (bez pasów wzdłuż),
   * narożniki to metalowe okucia z emblematem stylu.
   */
  const winFrame = (t) => {
    const [m1, m2, m3] = t.m;
    const corner = `<path d='M1.5 21 L1.5 7.5 Q1.5 1.5 7.5 1.5 L21 1.5 L21 5.5 Q12 5.5 9.5 8.5 Q5.5 11 5.5 21 Z' fill='url(#mp)' stroke='${m3}' stroke-width='.7'/><path d='M3 19 L3 8 Q3 3 8 3 L19 3' fill='none' stroke='${m1}' stroke-width='.6' opacity='.7'/>${emblem(t, 8.2, 8.2, 4.2)}`;
    const stars = t.orn === 'star' ? `<g fill='${t.star}'>${[[40, 3.2, 2.1], [3.2, 52, 1.7], [76.8, 52, 1.7], [40, 100.8, 2.1]].map(([x, y, r]) => { const k = r * 0.3; return `<path d='M${x},${y - r} L${x + k},${y - k} L${x + r},${y} L${x + k},${y + k} L${x},${y + r} L${x - k},${y + k} L${x - r},${y} L${x - k},${y - k}Z'/>`; }).join('')}</g>` : '';
    return svg(`<svg xmlns='http://www.w3.org/2000/svg' width='80' height='104'><defs>${metalDefs(t)}<linearGradient id='w' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='${t.a1}' stop-opacity='.13'/><stop offset='1' stop-color='${t.a1}' stop-opacity='0'/></linearGradient></defs>
<rect width='80' height='104' rx='7' fill='${t.bg1}'/>
<rect x='4' y='4' width='72' height='26' fill='url(#w)'/>
<rect x='1' y='1' width='78' height='102' rx='6.5' fill='none' stroke='${m3}' stroke-width='2'/>
<rect x='2.3' y='2.3' width='75.4' height='99.4' rx='5.5' fill='none' stroke='${m2}' stroke-width='1.2'/>
<rect x='3.4' y='3.4' width='73.2' height='97.2' rx='4.6' fill='none' stroke='${m1}' stroke-width='.5' opacity='.55'/>
<rect x='5' y='5' width='70' height='94' rx='3.5' fill='none' stroke='${t.a1}' stroke-width='.6' opacity='.28'/>
${stars}
<g>${corner}</g><g transform='translate(80 0) scale(-1 1)'>${corner}</g><g transform='translate(0 104) scale(1 -1)'>${corner}</g><g transform='translate(80 104) scale(-1 -1)'>${corner}</g>
</svg>`);
  };
  /** Plakietka z nazwą okna: metalowa kapsuła ze szpicami i emblematem (120×28, cięcie 14/22). */
  const plaque = (t) => {
    const [m1, m2, m3] = t.m;
    return svg(`<svg xmlns='http://www.w3.org/2000/svg' width='120' height='28'><defs>${metalDefs(t)}<linearGradient id='pf' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='${t.bg2}'/><stop offset='1' stop-color='${t.bg0}'/></linearGradient></defs>
<path d='M22 1.5 L9 1.5 L1 14 L9 26.5 L22 26.5 L98 26.5 L111 26.5 L119 14 L111 1.5 L98 1.5 Z' fill='url(#pf)' stroke='${m3}' stroke-width='1.6'/>
<path d='M22 3 L10 3 L3 14 L10 25 L22 25 M98 3 L110 3 L117 14 L110 25 L98 25' fill='none' stroke='${m2}' stroke-width='1.1'/>
<line x1='10' y1='3' x2='110' y2='3' stroke='${m1}' stroke-width='.6' opacity='.6'/>
<line x1='10' y1='25' x2='110' y2='25' stroke='${m2}' stroke-width='.9'/>
${emblem(t, 11, 14, 4)}${emblem(t, 109, 14, 4)}
</svg>`);
  };
  /** Pionowa metalowa listwa (kolumna czatu / ekwipunku): kafelek 10×96 powtarzany w pionie, emblemat co 96 px. */
  const railV = (t) => {
    const [m1, m2, m3] = t.m;
    return svg(`<svg xmlns='http://www.w3.org/2000/svg' width='10' height='96'><defs>${metalDefs(t)}<linearGradient id='rv' x1='0' y1='0' x2='1' y2='0'><stop offset='0' stop-color='${m3}'/><stop offset='.3' stop-color='${m2}'/><stop offset='.5' stop-color='${m1}'/><stop offset='.7' stop-color='${m2}'/><stop offset='1' stop-color='${m3}'/></linearGradient></defs>
<rect width='10' height='96' fill='${t.bg0}'/><rect x='2' width='6' height='96' fill='url(#rv)'/><rect x='2' width='.6' height='96' fill='#000' opacity='.45'/><rect x='7.4' width='.6' height='96' fill='#000' opacity='.45'/>
<rect x='1' y='40' width='8' height='16' rx='2' fill='url(#mp)' stroke='${m3}' stroke-width='.6'/>${emblem(t, 5, 48, 3)}</svg>`);
  };
  /** Pozioma metalowa listwa (krawędź górnego i dolnego paska): kafelek 96×5. */
  const railH = (t, flip) => {
    const [m1, m2, m3] = t.m;
    const g = flip ? [m3, m2, m1, m2, m3].reverse() : [m3, m2, m1, m2, m3];
    return svg(`<svg xmlns='http://www.w3.org/2000/svg' width='96' height='5'><defs>${metalDefs(t)}<linearGradient id='rh' x1='0' y1='0' x2='0' y2='1'>${g.map((c, i) => `<stop offset='${i / 4}' stop-color='${c}'/>`).join('')}</linearGradient></defs>
<rect width='96' height='5' fill='url(#rh)'/><rect y='${flip ? 0 : 4.4}' width='96' height='.6' fill='#000' opacity='.6'/>${t.orn === 'star' ? `<circle cx='48' cy='2.5' r='1.1' fill='${t.star}'/>` : `<circle cx='48' cy='2.5' r='1.2' fill='url(#mr)' stroke='${m3}' stroke-width='.4'/>`}</svg>`);
  };
  /** Własne tło HUD-a na górze (342×65): metalowa tarcza w kolorach stylu z polami na nick, mapę, złoto i smocze łuski. */
  const hudSvg = (t) => {
    const [m1, m2, m3] = t.m;
    const box = (x, y, w, h) => `<rect x='${x}' y='${y}' width='${w}' height='${h}' rx='3' fill='${t.bg0}' stroke='${t.line}' stroke-width='.8'/><rect x='${x + 1}' y='${y + 1}' width='${w - 2}' height='1' fill='${m1}' opacity='.08'/>`;
    return svg(`<svg xmlns='http://www.w3.org/2000/svg' width='342' height='65'><defs>${metalDefs(t)}<linearGradient id='hf' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='${t.bg2}'/><stop offset='1' stop-color='${t.bg1}'/></linearGradient></defs>
<path d='M1 0 L341 0 L333 52 Q331 62 320 63 L22 63 Q11 62 9 52 Z' fill='url(#hf)' stroke='${m3}' stroke-width='2'/>
<path d='M3 0 L339 0 L331.5 51.5 Q329.5 60.5 320 61.3 L22 61.3 Q12.5 60.5 10.5 51.5 Z' fill='none' stroke='${m2}' stroke-width='1.1'/>
<path d='M5 1 L337 1' stroke='${m1}' stroke-width='.6' opacity='.5'/>
${box(30, 1, 282, 19)}${box(16, 22, 222, 16)}${box(242, 22, 84, 16)}${box(90, 41, 80, 17)}${box(211, 41, 80, 17)}
${emblem(t, 20, 49, 3.2)}${emblem(t, 322, 49, 3.2)}
</svg>`);
  };
  /** Filtr przebarwiający szare, metalowe grafiki gry (kula HP, obramowania pasków doświadczenia) na metal stylu. */
  const metalFilter = (t, hud) => {
    const h = t.m[1].replace('#', ''); const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.substr(i, 2), 16) / 255);
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
    const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
    let hue = 0;
    if (d) hue = mx === r ? 60 * (((g - b) / d) % 6) : mx === g ? 60 * ((b - r) / d + 2) : 60 * ((r - g) / d + 4);
    if (hue < 0) hue += 360;
    if (s < 0.12) return hud ? 'grayscale(1) brightness(.68) contrast(1.12)' : 'grayscale(1) brightness(.85) contrast(1.08)';
    return `grayscale(1) sepia(1) hue-rotate(${Math.round(hue - 38)}deg) saturate(${(1 + s * 1.6).toFixed(2)}) brightness(${((hud ? 0.68 : 0.85) + l * (hud ? 0.3 : 0.45)).toFixed(2)})`;
  };
  // powierzchnia panelu: boczne pasy 11 px (gui/middle_graphics.png 0 11 fill)
  const surface = (t, raised) => svg(`<svg xmlns='http://www.w3.org/2000/svg' width='60' height='60' preserveAspectRatio='none'><defs><linearGradient id='s' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='${raised ? t.bg1 : t.bg2}'/><stop offset='.35' stop-color='${raised ? t.bg0 : t.bg1}'/><stop offset='1' stop-color='${t.bg0}'/></linearGradient></defs><rect width='60' height='60' fill='url(#s)'/></svg>`);
  // pasek / nagłówek tabeli: boczne pasy 20 px (quest_bar.png, table_header.png 0 20 fill)
  // metalowa płyta (nagłówki tabel, paski na dole okien — zamiast drewna): jednolita w poziomie, więc pasuje do każdego cięcia
  const plate = (t) => svg(`<svg xmlns='http://www.w3.org/2000/svg' width='80' height='40' preserveAspectRatio='none'><defs><linearGradient id='p' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='${t.bg2}'/><stop offset='.5' stop-color='${t.bg1}'/><stop offset='1' stop-color='${t.bg0}'/></linearGradient><linearGradient id='h' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='${t.m[0]}' stop-opacity='.26'/><stop offset='.5' stop-color='${t.m[1]}' stop-opacity='.1'/><stop offset='1' stop-color='${t.m[2]}' stop-opacity='.2'/></linearGradient></defs><rect width='80' height='40' fill='url(#p)'/><rect width='80' height='40' fill='url(#h)'/><rect width='80' height='1' fill='${t.m[1]}' opacity='.55'/><rect y='39' width='80' height='1' fill='${t.m[2]}'/></svg>`);
  const bar = (t) => plate(t);
  // karta/etykieta: pas 5 px (width-card-button.png 5 fill)
  const card = (t, active) => svg(`<svg xmlns='http://www.w3.org/2000/svg' width='40' height='40'><defs><linearGradient id='c' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='${t.bg2}'/><stop offset='1' stop-color='${t.bg1}'/></linearGradient></defs><rect x='.5' y='.5' width='39' height='39' rx='3' fill='url(#c)' stroke='${t.line}'/>${active ? `<rect x='4' y='37' width='32' height='1.5' rx='.75' fill='${t.a1}' opacity='.8'/>` : ''}</svg>`);

  function loadFonts(t) {
    if (!t || !t.fonts) { if (fontEl) fontEl.remove(); fontEl = null; return; }
    const href = 'https://fonts.googleapis.com/css2?' + t.fonts.map((f) => 'family=' + f).join('&') + '&display=swap';
    if (fontEl && fontEl.href === href) return;
    if (fontEl) fontEl.remove();
    fontEl = el('link', { rel: 'stylesheet', href });
    document.head.appendChild(fontEl);
  }

  function css(t) {
    const IL = '.interface-layer';
    const body = '"Roboto", Arimo, Arial, sans-serif';
    const btn = (from, to, line, txt) => `background:linear-gradient(${from},${to})!important;color:${txt}!important;border-radius:3px!important;box-shadow:inset 0 0 0 1px ${line},inset 0 1px 0 ${t.m[0]}2e,0 1px 2px rgba(0,0,0,.55)!important;text-shadow:0 1px 1px rgba(0,0,0,.8)!important`;
    const btnMain = btn(t.btn[0], t.btn[1], t.btnLine, t.btnText);
    const hover = `filter:brightness(1.18);box-shadow:inset 0 0 0 1px ${t.a1},0 0 10px ${t.glow}!important`;
    return `
/* ═══ Motywnik — ${t.name} ═══ */
:root{--mt-bg0:${t.bg0};--mt-bg1:${t.bg1};--mt-bg2:${t.bg2};--mt-line:${t.line};--mt-a1:${t.a1};--mt-a2:${t.a2};--mt-text:${t.text};--mt-text2:${t.text2}}

/* — krój pisma (te same wielkości co w grze) — */
/* tylko okna, dymki, menu, czat i prawa kolumna — pasek dolny (HP, doświadczenie, czas) zostaje z czcionką gry */
.c-window:not(.transparent), .tip-wrapper, .popup-menu-layer, .new-chat-window, ${IL} .right-column.main-column,
.c-window:not(.transparent) :not(.item):not(.item *):not(.button):not(.button *):not(.widget-button):not(.widget-button *):not(.card):not(.card *), .tip-wrapper *, .new-chat-window *:not(.button):not(.button *):not(.widget-button):not(.widget-button *):not(.card):not(.card *), ${IL} .right-column.main-column :not(.item):not(.item *):not(.button):not(.button *):not(.widget-button):not(.widget-button *):not(.card):not(.card *){font-family:${body}!important}
.c-window .header-label .text, .c-window .header-label, .c-window .header-label *{font-family:${t.head}!important}
/* przyciski zostają z krojem gry — inne metryki czcionki przesuwały napis w pionie */
.button, .button *, .widget-button, .widget-button *, .tabs-nav .card, .tabs-nav .card *, .mt-mi, .mt-mi *{font-family:Arimo, Arial, sans-serif!important}

/* — ramy ekranu: kolumny, górny i dolny pasek — */
${IL} .left-column.main-column, ${IL} .left-column.main-column .new-chat-window, ${IL} .left-column.main-column .chat-input-wrapper{background-color:${t.bg1}!important}
${IL} .right-column.main-column{background:${grain}, radial-gradient(ellipse at 50% 0%, ${t.edge}, transparent 45%), linear-gradient(${t.bg1},${t.bg0})!important}
/* metalowe listwy przy kolumnie czatu i ekwipunku (w miejscu krawędzi gry, ta sama szerokość) */
${IL} .left-column.main-column > .border, ${IL} .right-column.main-column > .border{background:${railV(t)} 0 0 / 10px 96px repeat-y!important;opacity:1!important}
/* górny i dolny pasek: tło stylu + metalowa krawędź od strony mapy (rysowana wewnątrz paska — nic nie wystaje) */
${IL} .top.positioner > .bg{background:${railH(t, true)} 0 100% / 96px 5px repeat-x, linear-gradient(${t.bg1},${t.bg0})!important}
${IL} .bottom.positioner > .bg{background:${railH(t, false)} 0 0 / 96px 5px repeat-x, linear-gradient(${t.bg0},${t.bg1})!important}
/* metal wokół kuli HP, ramki pasków doświadczenia i wskaźników — ten sam rysunek, barwa metalu stylu */
.bottom-panel .bottom-panel-graphic, .bottom-panel .hp-indicator-wrapper > .glass, .bottom-panel .exp-progress > .overlay, .bottom-panel .pointer-exp-graphic, .bottom-panel .pointer-ttl-graphic{filter:${metalFilter(t)}!important}
.mt-hud-bg{filter:${metalFilter(t, true)}!important}
.bottom-panel .exp-progress .progress > .inner{background:linear-gradient(#0b0b0d 0%, ${t.a2} 22%, ${t.a1} 50%, ${t.a2} 70%, #0b0b0d 100%)!important}
.skill-usable-slot[class*="interface-element-one-item-slot"]{background-color:${t.bg0}!important;box-shadow:inset 0 0 0 1px ${t.m[2]},inset 0 0 6px rgba(0,0,0,.6)!important}
/* ozdoby wokół HP, panel szybkich umiejętności i HUD na górze — grafiki gry bez zmian (żadnych prostokątów wokół) */
body::after{content:'';position:fixed;inset:0;pointer-events:none;z-index:2147480000;box-shadow:inset 0 0 38px ${t.edge}}

/* — sloty przedmiotów i siatka torby: ten sam rysunek, nowa barwa — */
.interface-element-item-slot-grid-stretch, .interface-element-one-item-slot-background-to-repeat{background-color:${t.blend}!important;background-blend-mode:luminosity!important}
.interface-element-one-black-tile{background:linear-gradient(${t.bg2},${t.bg0})!important;box-shadow:inset 0 0 0 1px ${t.line2}!important}
.interface-element-grid-border, .interface-element-background-color-3{background-color:${t.bg1}!important}

/* — okna — */
.c-window:not(.transparent).border-window{border-image-source:${winFrame(t)}!important;border-image-slice:32 20 fill!important;border-image-repeat:round!important}
.c-window .inner-content{background-color:transparent!important}
.c-window:not(.transparent) > .content{color:${t.text}}
.c-window:not(.transparent){box-shadow:0 12px 30px rgba(0,0,0,.6),0 0 22px ${t.glow}!important}
/* okna przezroczyste (mapa podręczna, przelogowanie, liczniki…) zostają przezroczyste — gra sama ustawia ich krycie */
.c-window:not(.transparent) .header-label{background:none!important;box-shadow:none!important;border-image:${plaque(t)} 14 22 fill / 14px 22px / 3px 16px stretch!important;filter:drop-shadow(0 0 6px ${t.glow})}
.c-window .header-label .text{color:${t.text}!important;text-shadow:0 0 8px ${t.glow},0 1px 1px #000!important}
/* ozdoby plakietki z nazwą okna — ten sam kształt, przebarwione */
/* metalowe ozdoby klasycznego interfejsu — w nowoczesnych stylach ich nie ma */
.c-window .header-label .left-decor, .c-window .header-label .right-decor{opacity:0!important}
.c-window .close-button-corner-decor{background-image:none!important}
.c-window .close-button{filter:grayscale(1) brightness(1.35);background-color:${t.bg2}!important;border-radius:4px!important;box-shadow:0 0 0 1px ${t.m[2]},inset 0 0 0 1px ${t.m[1]}66!important}
.c-window .close-button:hover{filter:grayscale(.2) brightness(1.6);box-shadow:0 0 0 1px ${t.a1},0 0 8px ${t.glow}!important}
/* panel szybkich umiejętności nad HP — ta sama ramka co okna */
.additional-skill-panel-border{border-image-source:${winFrame(t)}!important;border-image-slice:32 20 fill!important;border-image-repeat:round!important}
/* okna łupów i ważne okna — mocniejsze światło */
.c-window[class*="loot"], .c-window.window-on-peak{box-shadow:0 12px 30px rgba(0,0,0,.6),0 0 0 1px ${t.a1}55,0 0 34px ${t.glow}!important}

/* — powierzchnie interfejsu (border-image) — */
[class*="interface-element-middle-"]{border-image-source:${surface(t, false)}!important;background-color:${t.bg1}!important}
[class*="interface-element-middle-2"], [class*="interface-element-middle-3"]{border-image-source:${surface(t, true)}!important;background-color:${t.bg0}!important;box-shadow:inset 0 0 0 1px ${t.line2}!important}
.interface-element-bottom-bar-background-stretch, [class*="interface-element-header-1"]{border-image-source:${bar(t)}!important}
[class*="interface-element-header-3"], .opt-header{background:linear-gradient(${t.bg2},${t.bg1})!important;color:${t.text}!important;box-shadow:inset 0 -1px 0 ${t.line}!important}
.interface-element-active-card-background-stretch, .interface-element-active-card-border-image{border-image-source:${card(t, true)}!important}
.interface-element-green-box-background{background:radial-gradient(ellipse 80% 70% at 50% 0, ${t.glow}, transparent 75%), linear-gradient(${t.bg2},${t.bg0})!important;box-shadow:inset 0 0 0 1px ${t.m[2]},inset 0 1px 0 ${t.m[0]}26!important}
.c-window:not(.transparent) > .content{background:radial-gradient(ellipse 70% 140px at 50% 0, ${t.glow}, transparent 70%), linear-gradient(${t.bg2}, ${t.bg1} 140px)!important;background-color:${t.bg1}!important}

/* — drewniane nagłówki tabel i belki gry → metalowa płyta w kolorach stylu — */
.mt-plate{background-image:${plate(t)}!important;background-size:100% 100%!important;background-position:0 0!important;background-repeat:no-repeat!important;background-color:${t.bg1}!important;color:${t.text}!important;text-shadow:0 1px 1px #000!important}
.mt-plate-bi{border-image-source:${plate(t)}!important}
.mt-plate *, .mt-plate-bi ~ *{color:${t.text}}

/* nagłówki tabel (klany, członkowie, historia…) — klasy gry z drewnem */
.c-window [class*="table-header-1"], .c-window .table-header, .c-window .table-header-wrapper, .c-window .header-sort, .c-window .hover-header, .c-window [class*="interface-element-table-header"]{background-image:${plate(t)}!important;background-size:100% 100%!important;background-position:0 0!important;background-repeat:no-repeat!important;background-color:${t.bg1}!important;border-image-source:${plate(t)}!important;color:${t.text}!important;text-shadow:0 1px 1px #000!important}
.c-window [class*="table-header-1"]::before, .c-window [class*="table-header-1"]::after, .c-window .table-header::before, .c-window .table-header::after{background-image:none!important}
.c-window .table-header *, .c-window [class*="table-header-1"] *{color:${t.text}!important}
.c-window .table-header-wrapper{box-shadow:inset 0 -1px 0 ${t.m[2]}!important}

/* — zakładki — */
.tabs-nav .card{background:linear-gradient(${t.bg2},${t.bg0})!important;color:${t.text2}!important;box-shadow:inset 0 0 0 1px ${t.m[2]},inset 0 1px 0 ${t.m[0]}1f!important;text-shadow:0 1px 1px #000!important}
.tabs-nav .card:hover{color:${t.text}!important;box-shadow:inset 0 0 0 1px ${t.line},inset 0 1px 0 ${t.m[0]}2e!important}
.tabs-nav .card.active{background:linear-gradient(${t.bg2},${t.bg1})!important;color:${t.text}!important;box-shadow:inset 0 0 0 1px ${t.a1}99,inset 0 1px 0 ${t.m[0]}33,inset 0 0 12px ${t.glow}!important}
/* środek kart i przycisków list: bez dodatkowych teł (żadnych jaśniejszych prostokątów w środku) */
.tabs-nav .card :is(.mt-b0,.mt-b1,.mt-b2,.mt-bov), .tabs-nav .card .bck, .tabs-nav .card .bck-wrapper{background-color:transparent!important;background-image:none!important;box-shadow:none!important}
/* drewniana przegroda między kolumnami → metalowa listwa */
.c-window .interface-element-vertical-wood, .c-window .divide-wood{background:${railV(t)} center top / 10px 96px repeat-y!important;border-image:none!important}

/* — przyciski gry (zielone / fioletowe / czerwone / niebieskie) — */
.button.green, .button.small.green{${btnMain}}
.button.purple, .button.violet{${btn(t.btn[0], t.btn[1], t.btnLine, t.btnText)}}
.button.red{${btn('#4a1717', '#200909', '#a33a3a', '#ffe9e9')}}
.button:hover{${hover}}
.button.disabled, .button.inactive, .button[disabled], .widget-button.disabled{filter:grayscale(1);opacity:.55}
.widget-button.green{${btnMain}}
.widget-button.violet, .widget-button.blink-violet{${btn(t.btn[0], t.btn[1], t.btnLine, t.btnText)}}
.widget-button.blue{${btn(t.bg2, t.bg0, t.line, t.btnText)}}
.widget-button.red{${btn('#3a1414', '#1a0808', '#8a3030', '#fff')}}
.widget-button:hover{${hover}}

/* — menu prawego przycisku — */
.mt-menu{background:${t.bg1}!important;box-shadow:0 0 0 1px ${t.line},0 10px 26px rgba(0,0,0,.65),0 0 16px ${t.glow}!important;border-image:none!important}
.mt-mi{${btnMain}}
.mt-mi:hover{${hover}}
#mp-ctx{background:${t.bg1}!important;border-color:${t.line}!important}
#mp-ctx .mp-ctx-item{${btnMain};border-color:transparent!important}
#mp-ctx .mp-ctx-item:hover{${hover}}
#mp-ctx .mp-ctx-title{background:transparent!important;color:${t.text}!important;border-bottom-color:${t.line}!important}

/* — dymki, pola, czat — */
.tip-wrapper{background:${t.bg1}f2!important;box-shadow:0 0 0 1px ${t.line},0 8px 22px rgba(0,0,0,.6),0 0 14px ${t.glow}!important;border-image:none!important;color:${t.text}}
.ni-input input, .c-window input, .c-window textarea, .new-chat-window input, .new-chat-window textarea{background-color:${t.bg0}!important;color:${t.text}!important}
.ni-input.search-wrapper{filter:${t.tint} brightness(1.5)}
.new-chat-window .chat-channel-card{background:linear-gradient(${t.bg1},${t.bg0})!important;box-shadow:inset 0 0 0 1px ${t.line2}!important}
.new-chat-window .chat-channel-card.active{background:linear-gradient(${t.bg2},${t.bg1})!important;box-shadow:inset 0 0 0 1px ${t.line},inset 0 -2px 0 ${t.a1}!important}

/* — ciemny tekst na nowym, ciemnym tle — */
.mt-lt, .mt-lw{color:${t.text}!important}
.mt-lt2{color:${t.text2}!important}
.mt-bd{border-color:${t.line}!important}
.mt-b0{background-color:${t.bg0}!important}
.mt-b1{background-color:${t.bg1}!important}
.mt-b2{background-color:${t.bg2}!important}
.mt-bov{background-color:rgba(255,255,255,.035)!important}

/* — przewijanie — */
.game-window-positioner ::-webkit-scrollbar-thumb{background:${t.line}!important}
`;
  }

  /* ── menu prawego przycisku i ciemny tekst ── */
  const skip = (n) => n.closest('.mp-glass, #mp-qbar, #mp-qpop, .mp-modal-bg, #mp-ctx, #mp-eqtip, #mp-launcher');
  const lum = (c) => { const m = String(c).match(/(\d+)\D+(\d+)\D+(\d+)/); return m ? (0.299 * m[1] + 0.587 * m[2] + 0.114 * m[3]) / 255 : 1; };
  /** Barwa: jasność i nasycenie (0–1) z rgb(a). */
  function tone(c) {
    const m = String(c).match(/([\d.]+)\D+([\d.]+)\D+([\d.]+)(?:\D+([\d.]+))?/);
    if (!m) return null;
    const r = m[1] / 255, g = m[2] / 255, b = m[3] / 255, a = m[4] == null ? 1 : Number(m[4]);
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    return { l: 0.299 * r + 0.587 * g + 0.114 * b, s: mx ? (mx - mn) / mx : 0, a };
  }
  const SCOPE = '.c-window:not(.transparent), .tip-wrapper, .new-chat-window, .right-column.main-column, .mt-menu';
  const OWN = '.button, .card, .widget-button, .header-label, .mt-mi, input, textarea, select, [class*="interface-element-"]';
  /**
   * Ujednolicenie jak w projekcie graficznym: szare tła, szare ramki i szare/białe napisy gry dostają kolory stylu
   * (te same odcienie wszędzie). Kolorowe napisy (rzadkość, wartości, ostrzeżenia) zostają bez zmian.
   */
  const WOOD = /wood|drewn|header|deska|belka|plank/i;
  function fixText(root) {
    if (!active()) return;
    const list = root === document.body ? $$(SCOPE).flatMap((w) => [w, ...$$('*', w)]) : (root.closest && root.closest(SCOPE) ? [root, ...$$('*', root)] : $$(SCOPE, root).flatMap((w) => [w, ...$$('*', w)]));
    for (const n of list) {
      if (n.nodeType !== 1 || skip(n) || n.closest('.item, .big-messages, canvas') || /^(IMG|CANVAS|svg|path)$/i.test(n.tagName)) continue;
      const cs = getComputedStyle(n);
      // napis
      if ([...n.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim())) {
        const t = tone(cs.color);
        if (t && t.s < 0.22) {
          if (t.l < 0.33) n.classList.add('mt-lt');
          else if (t.l < 0.66) n.classList.add('mt-lt2');
          else n.classList.add('mt-lw');
        }
      }
      if (n.matches(OWN) || n.matches(SCOPE)) continue;
      // drewno (nagłówki tabel, belki) → metalowa płyta
      if (WOOD.test(cs.backgroundImage)) n.classList.add('mt-plate');
      if (WOOD.test(cs.borderImageSource)) n.classList.add('mt-plate-bi');
      // ramka
      if (parseFloat(cs.borderTopWidth) + parseFloat(cs.borderLeftWidth) + parseFloat(cs.borderBottomWidth) + parseFloat(cs.borderRightWidth) > 0 && cs.borderImageSource === 'none') {
        const t = tone(cs.borderTopColor) || tone(cs.borderLeftColor);
        if (t && t.a > 0.05 && t.s < 0.2) n.classList.add('mt-bd');
      }
      // tło (tylko jednolite, bez obrazka)
      if (cs.backgroundImage === 'none') {
        const t = tone(cs.backgroundColor);
        if (t && t.a > 0.02 && t.s < 0.2) {
          if (t.a < 0.5) n.classList.add('mt-bov');
          else if (t.l < 0.09) n.classList.add('mt-b0');
          else n.classList.add('mt-b1');
        }
      }
    }
  }
  function tagMenu(labels) {
    if (!active() || !labels || !labels.length) return;
    setTimeout(() => {
      const leaves = labels.map((l) => $$('body *').find((n) => !n.children.length && (n.textContent || '').trim() === String(l).trim() && isVisible(n) && !skip(n))).filter(Boolean);
      if (!leaves.length) return;
      const rows = leaves.map((lf) => { let r = lf; while (r.parentElement && r.parentElement !== document.body && (r.parentElement.textContent || '').trim() === (lf.textContent || '').trim()) r = r.parentElement; return r; });
      let box = rows[0].parentElement;
      while (box && box !== document.body && !rows.every((r) => box.contains(r))) box = box.parentElement;
      if (box && box !== document.body) { box.classList.add('mt-menu'); rows.forEach((r) => r.classList.add('mt-mi')); }
    }, 0);
  }
  let queue = new Set(), qT = null;
  function start() {
    if (mo) return;
    fixText(document.body);
    mo = new MutationObserver((muts) => {
      for (const m of muts) for (const n of m.addedNodes) if (n.nodeType === 1 && !skip(n)) queue.add(n);
      if (queue.size && !qT) qT = setTimeout(() => { qT = null; const q = [...queue]; queue.clear(); q.forEach((n) => n.isConnected && fixText(n)); hudLayer(active()); }, 150);
    });
    mo.observe(document.body, { childList: true, subtree: true });
    [1200, 4000].forEach((ms) => setTimeout(() => { fixText(document.body); hudLayer(active()); }, ms));
  }
  function stop() {
    if (mo) { mo.disconnect(); mo = null; }
    ['mt-menu', 'mt-mi', 'mt-lt', 'mt-lt2', 'mt-lw', 'mt-bd', 'mt-b0', 'mt-b1', 'mt-b2', 'mt-bov', 'mt-btn', 'mt-skin', 'mt-frame', 'mt-plate', 'mt-plate-bi'].forEach((c) => $$('.' + c).forEach((n) => n.classList.remove(c)));
  }
  const active = () => !!(cfg && cfg.enabled && THEMES[cfg.theme] && !THEMES[cfg.theme].none);

  function apply() {
    if (!styleEl) { styleEl = el('style', { id: 'mp-motywnik' }); document.head.appendChild(styleEl); }
    stop();
    if (!cfg || !cfg.enabled) { styleEl.textContent = ''; loadFonts(null); return; }
    const t = THEMES[cfg.theme] || THEMES.domyslny;
    loadFonts(active() ? t : null);
    let out = active() ? css(t) : '';
    const own = (cfg.custom || []).find((x) => x.id === cfg.customOn);
    if (own) out += `\n/* Własny styl: ${own.name} */\n${own.css}`;
    styleEl.textContent = out;
    hudLayer(active());
    if (active()) start();
  }

  /* HUD na górze (złoto, mapa) ma metalową grafikę z dziećmi w środku — filtra nie da się dać na cały element,
     więc kopia tej samej grafiki trafia na warstwę pod treścią i tylko ona jest przebarwiana. */
  function hudLayer(on) {
    for (const hud of $$('.hud-container')) {
      let lay = hud.querySelector(':scope > .mt-hud-bg');
      if (!on) { if (lay) lay.remove(); const ic = hud.querySelector(':scope > .mt-hud-ico'); if (ic) ic.remove(); if (hud.classList.contains('mt-hud')) { hud.classList.remove('mt-hud'); hud.style.removeProperty('background-image'); } continue; }
      if (!lay) {
        const cs = getComputedStyle(hud);
        if (cs.backgroundImage === 'none') continue;
        lay = el('div', { class: 'mt-hud-bg' });
        Object.assign(lay.style, { position: 'absolute', inset: '0', zIndex: '-1', pointerEvents: 'none', backgroundImage: cs.backgroundImage, backgroundPosition: cs.backgroundPosition, backgroundRepeat: cs.backgroundRepeat, backgroundSize: cs.backgroundSize });
        if (cs.position === 'static') hud.style.position = 'relative';
        hud.style.isolation = 'isolate';
        hud.prepend(lay);
        // ikony złota i smoczych łusek zostają w oryginalnych kolorach: niezabarwiona kopia grafiki tylko w ich miejscu
        const ico = el('div', { class: 'mt-hud-ico' });
        Object.assign(ico.style, { position: 'absolute', inset: '0', zIndex: '-1', pointerEvents: 'none', backgroundImage: cs.backgroundImage, backgroundPosition: cs.backgroundPosition, backgroundRepeat: cs.backgroundRepeat, backgroundSize: cs.backgroundSize });
        const circ = (x, y, r) => `M${x - r},${y}a${r},${r} 0 1,0 ${2 * r},0a${r},${r} 0 1,0 ${-2 * r},0`;
        const g = hud.querySelector('.gold-btn'), c = hud.querySelector('.credits-btn');
        const parts = [];
        if (g) parts.push(circ(g.offsetLeft - 15, g.offsetTop + 10.5, 11));
        if (c) parts.push(circ(c.offsetLeft - 11, c.offsetTop + 10.5, 11));
        if (parts.length) { ico.style.clipPath = `path('${parts.join(' ')}')`; lay.after(ico); }
      }
      hud.classList.add('mt-hud');
      hud.style.setProperty('background-image', 'none', 'important');
    }
  }

  /* ── dane wyglądu dla twórcy ── */
  function collectLook() {
    const short = (v) => String(v || '').replace(/url\("?([^")]*)"?\)/g, (m, u) => 'url(' + u.split('/').slice(-2).join('/').slice(0, 60) + ')').slice(0, 140);
    const chain = (n) => { const p = []; for (let x = n, i = 0; x && x !== document.body && i < 3; x = x.parentElement, i++) p.unshift((x.tagName || '').toLowerCase() + (typeof x.className === 'string' && x.className.trim() ? '.' + x.className.trim().split(/\s+/).slice(0, 4).join('.') : '')); return p.join(' > '); };
    const ownText = (n) => [...n.childNodes].filter((c) => c.nodeType === 3).map((c) => c.textContent.trim()).join(' ').slice(0, 24);
    const els = [], seen = new Set();
    for (const n of $$('body *')) {
      if (n.closest('.mp-glass, #mp-qbar, #mp-qpop, .mp-modal-bg, #mp-ctx, #mp-eqtip, #mp-launcher') || /^(SCRIPT|STYLE|LINK|svg|path)$/i.test(n.tagName)) continue;
      const r = n.getBoundingClientRect();
      if (r.width < 6 || r.height < 6 || !isVisible(n)) continue;
      const cs = getComputedStyle(n);
      const hasBg = cs.backgroundImage !== 'none', hasBi = cs.borderImageSource !== 'none', hasCol = cs.backgroundColor !== 'rgba(0, 0, 0, 0)';
      const txt = ownText(n);
      if (!hasBg && !hasBi && !hasCol && !txt) continue;
      const k = chain(n) + '|' + (hasBg ? short(cs.backgroundImage) : '') + '|' + (txt ? 't' : '');
      if (seen.has(k)) continue;
      seen.add(k);
      els.push({ el: chain(n), wh: Math.round(r.width) + 'x' + Math.round(r.height), bg: hasBg ? short(cs.backgroundImage) : undefined, bi: hasBi ? short(cs.borderImageSource) + ' ' + cs.borderImageSlice + ' / ' + cs.borderWidth : undefined, bgc: hasCol ? cs.backgroundColor : undefined, col: txt ? cs.color : undefined, font: txt ? cs.fontFamily.split(',')[0] + ' ' + cs.fontSize : undefined, txt: txt || undefined });
      if (els.length > 900) break;
    }
    const tree = (n, d) => ({ c: (n.tagName || '').toLowerCase() + (typeof n.className === 'string' && n.className.trim() ? '.' + n.className.trim().split(/\s+/).join('.') : ''), k: d < 5 ? [...n.children].slice(0, 10).map((x) => tree(x, d + 1)) : undefined });
    const wins = $$('.c-window, .border-window, [class*="-window"]').filter((w) => isVisible(w) && !w.closest('.mp-glass') && !w.parentElement.closest('.c-window, .border-window')).slice(0, 8).map((w) => tree(w, 0));
    const txt = JSON.stringify({ wersja: MP.version, styl: cfg && cfg.theme, ekran: innerWidth + 'x' + innerHeight, okna: wins, elementy: els });
    const fallback = () => { const t = el('textarea', { style: { position: 'fixed', left: '-9999px' } }); t.value = txt; document.body.appendChild(t); t.select(); try { document.execCommand('copy'); } catch {} t.remove(); };
    try { navigator.clipboard.writeText(txt).catch(fallback); } catch { fallback(); }
    toast(`Motywnik: skopiowano dane wyglądu (${els.length} elementów) — wklej je w rozmowie`, 'ok', 5000);
  }

  /* ── własne style ── */
  const uid = () => Math.random().toString(36).slice(2, 9);
  async function saveCustom(text, name, rerender) {
    const nm = name || await MP.promptBox({ title: 'Nazwa stylu', label: 'Pod tą nazwą styl pojawi się na liście', value: 'Mój styl', okText: 'Zapisz' });
    if (!nm) return;
    const item = { id: uid(), name: nm, css: text };
    cfg.custom = (cfg.custom || []).concat(item); cfg.customOn = item.id;
    config.save(); apply(); rerender();
    toast(`Motywnik: zapisano i włączono styl „${nm}"`);
  }
  function loadFile(rerender) {
    const inp = el('input', { type: 'file', accept: '.css,text/css,.txt', style: { display: 'none' } });
    inp.addEventListener('change', () => {
      const f = inp.files && inp.files[0]; if (!f) return;
      const rd = new FileReader();
      rd.onload = () => { saveCustom(String(rd.result || ''), f.name.replace(/\.(css|txt)$/i, ''), rerender); inp.remove(); };
      rd.readAsText(f);
    });
    document.body.appendChild(inp); inp.click();
  }
  function download(name, text) {
    const a = el('a', { href: URL.createObjectURL(new Blob([text], { type: 'text/css' })), download: (name || 'styl') + '.css' });
    document.body.appendChild(a); a.click(); a.remove();
  }

  /** Podgląd: kawałek ramy, okno z nagłówkiem i przycisk — w kolorach stylu. */
  function preview(k) {
    const t = THEMES[k];
    if (t.none) return el('div', { class: 'mp-mt-stage domyslny' }, el('div', { class: 'mp-mt-win domyslny' }, el('i', null, 'Grupa'), el('span', null, 'Habiachi (41p)'), el('em', null, 'Rozwiąż grupę')));
    const st = el('div', { class: 'mp-mt-stage' });
    st.style.background = `radial-gradient(ellipse at 50% 0%, ${t.glow}, transparent 65%), ${t.bg0}`;
    st.style.boxShadow = `inset 0 0 0 1px ${t.line}, inset 0 0 18px ${t.edge}`;
    const w = el('div', { class: 'mp-mt-win' }, el('i', null, 'Grupa'), el('span', null, 'Habiachi (41p)'), el('em', null, 'Rozwiąż grupę'));
    Object.assign(w.style, { background: `linear-gradient(${t.bg2}, ${t.bg1} 26%)`, boxShadow: `0 0 0 1px ${t.line}, 0 0 12px ${t.glow}`, color: t.text, borderTop: `2px solid ${t.a1}` });
    Object.assign(w.querySelector('i').style, { color: t.text, textShadow: `0 0 8px ${t.glow}`, fontFamily: t.head });
    Object.assign(w.querySelector('em').style, { background: `linear-gradient(${t.btn[0]}, ${t.btn[1]})`, boxShadow: `inset 0 0 0 1px ${t.btnLine}`, color: t.btnText });
    st.appendChild(w);
    return st;
  }

  defineAddon({
    id: 'motywnik', name: 'Motywnik', icon: 'motywnik', color: ['#2ef2c4', '#8a5cff'], renderFirst: true,
    desc: 'Style całego interfejsu: ramy ekranu, paski, okna, nagłówki, zakładki, przyciski, menu, sloty, dymki i czat. Domyślny = klasyczny wygląd gry. Rozmiary zostają jak w grze. Możesz też wgrać własne style CSS.',
    defaults: { theme: 'domyslny', custom: [], customOn: null },
    settings: [],
    render(box, c, rerender) {
      const grid = el('div', { class: 'mp-mt-grid' });
      for (const [k, t] of Object.entries(THEMES)) grid.appendChild(el('div', { class: 'mp-mt-card' + (c.theme === k ? ' on' : ''), onclick: () => { c.theme = k; config.save(); apply(); rerender(); } }, preview(k), el('div', { class: 'mp-mt-name' }, t.name), el('div', { class: 'mp-mt-desc' }, t.desc)));
      const tc = el('div', { class: 'mp-card' }, el('h3', null, 'Styl interfejsu'), grid);
      if (!c.enabled) tc.prepend(MP.note('info', 'Dodatek jest wyłączony — gra ma swój wygląd.'));
      let editing = null;
      const ta = el('textarea', { class: 'mp-in', placeholder: '/* Własny CSS, np.:\n.button.green { color: #ffd27a !important; } */' });
      ta.addEventListener('keydown', (e) => e.stopPropagation());
      const list = el('div', { class: 'mp-mt-own' });
      (c.custom || []).forEach((s) => list.appendChild(el('div', { class: 'mp-mt-row' },
        el('button', { class: 'mp-upchip' + (c.customOn === s.id ? ' on' : ''), onclick: () => { c.customOn = c.customOn === s.id ? null : s.id; config.save(); apply(); rerender(); } }, c.customOn === s.id ? 'Włączony' : 'Włącz'),
        el('b', { style: { flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, s.name),
        el('button', { class: 'mp-btn', onclick: () => { ta.value = s.css; ta.focus(); editing = s.id; } }, 'Edytuj'),
        el('button', { class: 'mp-btn', onclick: () => download(s.name, s.css) }, 'Pobierz'),
        el('button', { class: 'mp-btn bad', onclick: async () => { if (await MP.confirmBox({ title: `Usunąć „${s.name}"?`, okText: 'Usuń', danger: true })) { c.custom = c.custom.filter((x) => x.id !== s.id); if (c.customOn === s.id) c.customOn = null; config.save(); apply(); rerender(); } } }, 'Usuń'))));
      const oc = el('div', { class: 'mp-card' }, el('h3', null, 'Własne style'),
        (c.custom || []).length ? list : el('div', { class: 'mp-dim', style: { marginBottom: '8px' } }, 'Wklej CSS albo wczytaj plik .css. Działa razem z wybranym stylem (z „Domyślnym" jest jedyny).'),
        ta,
        el('div', { class: 'mp-btns' },
          el('button', { class: 'mp-btn', onclick: () => { if (!styleEl) apply(); styleEl.textContent += '\n' + ta.value; toast('Motywnik: podgląd przez 8 sekund'); setTimeout(() => apply(), 8000); } }, 'Podgląd'),
          el('button', { class: 'mp-btn pri', onclick: () => {
            if (!ta.value.trim()) { toast('Motywnik: wpisz najpierw CSS', 'warn'); return; }
            if (editing) { const s = c.custom.find((x) => x.id === editing); if (s) { s.css = ta.value; config.save(); apply(); toast(`Motywnik: zapisano „${s.name}"`); rerender(); return; } }
            saveCustom(ta.value, null, rerender);
          } }, 'Zapisz styl'),
          el('button', { class: 'mp-btn', onclick: () => loadFile(rerender) }, 'Wczytaj plik .css'),
          THEMES[c.theme] && !THEMES[c.theme].none ? el('button', { class: 'mp-btn', onclick: () => download(THEMES[c.theme].name, css(THEMES[c.theme])) }, 'Pobierz CSS stylu') : null));
      const dc = el('div', { class: 'mp-card' }, el('h3', null, 'Coś wygląda nie tak?'),
        el('div', { class: 'mp-dim', style: { marginBottom: '8px' } }, 'Otwórz okno, które źle wygląda, kliknij przycisk i wklej wynik w rozmowie (razem ze zrzutem ekranu).'),
        el('div', { class: 'mp-btns' }, el('button', { class: 'mp-btn', onclick: collectLook }, 'Zbierz dane wyglądu')));
      box.append(tc, oc, dc);
    },
    init(c) {
      cfg = c;
      if (!THEMES[c.theme]) c.theme = { mroczny: 'obsydian' }[c.theme] || 'domyslny';
      if ('ember' in c) { delete c.ember; config.save(); }
      bus.on('popup:shown', (labels) => tagMenu(labels));
      apply();
      MP.motywnik = { apply, collectLook, THEMES };
    },
    onToggle() { apply(); },
  });
})();
