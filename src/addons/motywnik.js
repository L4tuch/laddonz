/* ───────── Motywnik ─────────
 * Rozbudowane style całego interfejsu gry: okna, nagłówki, przyciski akcji (np. „Rozwiąż grupę"),
 * menu prawego przycisku, dymki, czat, komunikaty, pola tekstowe, paski przewijania i czcionki.
 * Mapa, postacie i ikonki przedmiotów zostają bez zmian. Własne style CSS: wklejone albo z pliku .css.
 * Wyłączenie dodatku od razu przywraca wygląd gry.
 *
 * Przyciski i pozycje menu gry nie mają jednej wspólnej klasy, więc Motywnik sam je oznacza:
 *   .mt-btn  — przycisk z napisem (nie ikonka),  .mt-menu / .mt-mi — menu prawego przycisku i jego pozycje.
 */
(() => {
  let cfg, styleEl = null, fontEl = null, mo = null;

  const WIN = '.c-window, .border-window';
  const HEAD = '.c-window [class*="header"], .c-window [class*="title"], .border-window [class*="header-label"]';
  const TIP = '.tip-wrapper';
  const CHAT = '.new-chat-window';
  /** „wewnątrz okna": każdy selektor okna × każdy podany selektor (WIN ma kilka członów oddzielonych przecinkiem). */
  const inW = (sel) => WIN.split(',').flatMap((w) => sel.split(',').map((x) => w.trim() + ' ' + x.trim())).join(', ');

  /*
   * Pięć stylów całego interfejsu. Poza „Domyślnym" zmieniają WSZYSTKO: ramy i panele gry (lewa/prawa kolumna,
   * górny i dolny pasek, tła pod ekwipunkiem i torbami), okna, nagłówki, przyciski, menu prawego przycisku,
   * dymki, czat i pola tekstowe. Mapa, postacie i ikonki przedmiotów zostają bez zmian.
   *
   * Panele gry to obrazki-tekstury bez wspólnej klasy — Motywnik sam je znajduje (.mt-skin: duże tła-obrazki,
   * .mt-frame: ozdobne ramki) i podmienia na teksturę stylu. Jasne tła z ciemnym tekstem (pergamin) zostawia.
   */
  const svg = (s) => `url("data:image/svg+xml,${encodeURIComponent(s)}")`;
  const noise = (op) => svg(`<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='3' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 ${op} 0'/></filter><rect width='100%' height='100%' filter='url(#n)'/></svg>`);
  /** Ozdobny narożnik (filigran) w kolorze c — używany na 4 rogach okien. */
  const corner = (c, flip) => svg(`<svg xmlns='http://www.w3.org/2000/svg' width='34' height='34' viewBox='0 0 34 34'><g fill='none' stroke='${c}' stroke-width='1.6' transform='${flip}'><path d='M2 32V8q0-6 6-6h24'/><path d='M6 32V12q0-6 6-6h20' opacity='.55'/><path d='M2 14q8 0 10-6' /><circle cx='12' cy='12' r='2.2' fill='${c}'/></g></svg>`);
  const corners = (c) => [
    `${corner(c, '')} left top no-repeat`,
    `${corner(c, 'translate(34 0) scale(-1 1)')} right top no-repeat`,
    `${corner(c, 'translate(0 34) scale(1 -1)')} left bottom no-repeat`,
    `${corner(c, 'translate(34 34) scale(-1 -1)')} right bottom no-repeat`,
  ];
  /** Pęknięcia z prześwitującą lawą (powtarzalna tekstura). */
  const lava = svg(`<svg xmlns='http://www.w3.org/2000/svg' width='260' height='260'><defs><filter id='g'><feGaussianBlur stdDeviation='2.2'/></filter></defs><g fill='none' stroke-linecap='round'><g stroke='#ff4d00' stroke-width='4' opacity='.55' filter='url(#g)'><path d='M-5 40 L40 62 L70 50 L118 88 L160 80 L210 120 L265 110'/><path d='M30 260 L52 210 L90 196 L104 150 L140 132'/><path d='M180 -5 L170 40 L196 70 L188 110'/></g><g stroke='#ffb347' stroke-width='1.3' opacity='.85'><path d='M-5 40 L40 62 L70 50 L118 88 L160 80 L210 120 L265 110'/><path d='M30 260 L52 210 L90 196 L104 150 L140 132'/><path d='M180 -5 L170 40 L196 70 L188 110'/></g></g></svg>`);

  const THEMES = {
    domyslny: { name: 'Domyślny', desc: 'Wygląd gry bez żadnych zmian.', none: true },
    obsydian: {
      name: 'Obsydian', desc: 'Czerń i stal, srebrne ozdobne narożniki.',
      panel: `${noise(0.06)}, linear-gradient(160deg,#17181b,#0c0d0f)`, panelC: '#0f1012',
      win: '12,13,15', border: '#4a4d55', border2: '#2a2c31', orn: '#9aa0ab', text: '#dfe2e7', head: '#f2f4f7', accent: '#c9ced8',
      btn: 'linear-gradient(#2d3036,#1b1d21)', btnHover: 'linear-gradient(#3a3e46,#24272c)', btnText: '#eef0f3', btnBorder: '#5a5e68', glow: 'rgba(170,180,200,.18)',
    },
    wulkan: {
      name: 'Wulkan', desc: 'Bazalt z prześwitującą lawą, brązowe okucia.',
      panel: `${lava}, ${noise(0.07)}, radial-gradient(ellipse at 30% 120%,rgba(255,80,0,.18),transparent 60%), linear-gradient(160deg,#1a0f0b,#0b0605)`, panelC: '#120a08',
      win: '18,10,8', border: '#7a3417', border2: '#3a1a0e', orn: '#d0702a', text: '#f1dccb', head: '#ffb070', accent: '#ff8a3d',
      btn: 'linear-gradient(#3a1a10,#1f0d08)', btnHover: 'linear-gradient(#5a2412,#2c120a)', btnText: '#ffe2c8', btnBorder: '#a4471d', glow: 'rgba(255,100,20,.35)',
      lavaGlow: true,
    },
    krolewski: {
      name: 'Królewski', desc: 'Głęboka czerń z granatem i złotym filigranem.',
      panel: `${noise(0.05)}, radial-gradient(ellipse at 50% -20%,rgba(212,175,55,.08),transparent 60%), linear-gradient(160deg,#121522,#0a0b12)`, panelC: '#0d0f18',
      win: '12,13,22', border: '#8c7232', border2: '#2e2a1c', orn: '#d4af37', text: '#efe6cf', head: '#f5d77a', accent: '#e8c35a',
      btn: 'linear-gradient(#262038,#15121f)', btnHover: 'linear-gradient(#352c4d,#1d1829)', btnText: '#f8e7b5', btnBorder: '#9c7f36', glow: 'rgba(212,175,55,.25)',
    },
    nowoczesny: {
      name: 'Nowoczesny', desc: 'Żywe kolory, szkło i gradientowe przyciski.',
      panel: `${noise(0.04)}, radial-gradient(ellipse at 0% 0%,rgba(99,102,241,.22),transparent 55%), radial-gradient(ellipse at 100% 100%,rgba(6,182,212,.18),transparent 55%), linear-gradient(160deg,#141a2e,#0b0f1c)`, panelC: '#0f1424',
      win: '16,21,38', border: 'rgba(139,140,255,.45)', border2: 'rgba(255,255,255,.08)', orn: null, text: '#e8ebf5', head: '#ffffff', accent: '#8b8cff',
      btn: 'linear-gradient(135deg,#6366f1,#06b6d4)', btnHover: 'linear-gradient(135deg,#7c7ff7,#22d3ee)', btnText: '#ffffff', btnBorder: 'transparent', glow: 'rgba(99,102,241,.45)',
      radius: 10, glass: true, font: '"Inter", "Segoe UI", system-ui, sans-serif', fonts: ['Inter:wght@400;500;600;700'],
    },
  };
  // zgodność ze starszymi nazwami
  const ALIAS = { klasyczny: 'domyslny', gra: 'domyslny', ciemny: 'obsydian', mroczny: 'obsydian', fantasy: 'wulkan', lod: 'obsydian', neon: 'nowoczesny', pergamin: 'domyslny' };

  function loadFonts(t) {
    if (!t || !t.fonts) { if (fontEl) fontEl.remove(); fontEl = null; return; }
    const href = 'https://fonts.googleapis.com/css2?' + t.fonts.map((f) => 'family=' + f).join('&') + '&display=swap';
    if (fontEl && fontEl.href === href) return;
    if (fontEl) fontEl.remove();
    fontEl = el('link', { rel: 'stylesheet', href });
    document.head.appendChild(fontEl);
  }

  function themeCss(t) {
    if (!t || t.none) return '';
    const r = t.radius || 3, rs = Math.min(r, 8);
    const f = t.font ? `font-family:${t.font}!important;` : '';
    const blur = t.glass ? 'backdrop-filter:blur(12px) saturate(150%);-webkit-backdrop-filter:blur(12px) saturate(150%);' : '';
    const winBg = [...(t.orn ? corners(t.orn) : []), `${noise(0.05)}`, `linear-gradient(rgba(${t.win},.97),rgba(${t.win},.97))`].join(', ');
    const btn = `background:${t.btn}!important;color:${t.btnText}!important;border:1px solid ${t.btnBorder}!important;border-image:none!important;border-radius:${rs}px!important;text-shadow:0 1px 1px rgba(0,0,0,.85)!important;box-shadow:inset 0 1px 0 rgba(255,255,255,.08),0 1px 3px rgba(0,0,0,.5)!important;${f}transition:background .12s,box-shadow .12s`;
    const btnH = `background:${t.btnHover}!important;box-shadow:0 0 10px ${t.glow},inset 0 1px 0 rgba(255,255,255,.12)!important`;
    return `
/* Motywnik — ${t.name} */
@keyframes mtLava{0%,100%{box-shadow:0 0 0 1px ${t.border},0 10px 28px rgba(0,0,0,.6),0 0 14px rgba(255,90,10,.18)}50%{box-shadow:0 0 0 1px ${t.border},0 10px 28px rgba(0,0,0,.6),0 0 26px rgba(255,110,20,.38)}}
/* panele i ramy gry */
.mt-skin{background:${t.panel}!important;background-color:${t.panelC}!important;background-size:auto!important;background-repeat:repeat!important}
.mt-frame{border-image:none!important;border-color:${t.border}!important;border-style:solid!important;box-shadow:inset 0 0 0 1px ${t.border2},0 0 10px rgba(0,0,0,.5)!important}
/* okna */
${WIN}{background:${winBg}!important;color:${t.text}!important;border-radius:${r}px!important;box-shadow:0 0 0 1px ${t.border},0 10px 28px rgba(0,0,0,.6),0 0 14px ${t.glow}!important;${blur}${f}}
.border-window{border-image:none!important;border:1px solid ${t.border}!important}
${t.lavaGlow ? `${WIN}{animation:mtLava 4s ease-in-out infinite}` : ''}
${inW('[class*="content"]')}{color:${t.text}}
${HEAD}{color:${t.head}!important;text-shadow:0 1px 2px #000${t.lavaGlow ? ',0 0 8px rgba(255,120,30,.6)' : ''}!important;letter-spacing:.03em;${f}}
${inW('[class*="header"]')}{background:linear-gradient(rgba(255,255,255,.05),rgba(0,0,0,.15))!important;border-bottom:1px solid ${t.border}!important}
/* przyciski z napisem i menu prawego przycisku */
.mt-btn{${btn}}
.mt-btn:hover{${btnH}}
.mt-menu{background:rgba(${t.win},.98)!important;border:1px solid ${t.border}!important;border-image:none!important;border-radius:${rs + 2}px!important;box-shadow:0 8px 24px rgba(0,0,0,.65),0 0 12px ${t.glow}!important;padding:4px!important;${blur}}
.mt-mi{${btn};margin:2px 0!important}
.mt-mi:hover{${btnH}}
#mp-ctx{background:rgba(${t.win},.98)!important;border:1px solid ${t.border}!important}
#mp-ctx .mp-ctx-item{${btn}}
#mp-ctx .mp-ctx-item:hover{${btnH}}
#mp-ctx .mp-ctx-title{background:transparent!important;color:${t.head}!important;border-bottom:1px solid ${t.border}!important}
/* dymki, czat, pola, zakładki, przewijanie */
${TIP}{background:${[...(t.orn ? [] : []), `linear-gradient(rgba(${t.win},.97),rgba(${t.win},.97))`].join(',')}!important;border:1px solid ${t.border}!important;border-image:none!important;border-radius:${rs}px!important;color:${t.text}!important;box-shadow:0 6px 18px rgba(0,0,0,.6),0 0 10px ${t.glow}!important;${blur}${f}}
${CHAT}{background:rgba(${t.win},.85)!important;${f}}
${inW('input, textarea, select')}, ${CHAT} input, ${CHAT} textarea{background:rgba(0,0,0,.45)!important;color:${t.text}!important;border:1px solid ${t.border}!important;border-radius:${rs}px!important}
${inW('[class*="tab"][class*="active"], [class*="card"][class*="active"]')}{color:${t.accent}!important;box-shadow:inset 0 -2px 0 ${t.accent}!important}
::-webkit-scrollbar-thumb{background:${t.border}!important;border-radius:8px}
${t.font ? `${WIN}, ${TIP}, ${CHAT}{-webkit-font-smoothing:antialiased}` : ''}
`;
  }

  /* ── szukanie paneli i ram gry (tła-obrazki) ── */
  const NO_SKIN = /itemy|items?\/|outfit|postac|npc|mob|pet|chowan|portret|avatar|face|emotk|emoji|smile|icons?\/|ikon|maps?\/|obrazki\/mapy|ad[sv]?\//i;
  function lum(rgb) { const m = String(rgb).match(/(\d+)\D+(\d+)\D+(\d+)/); if (!m) return 1; return (0.299 * m[1] + 0.587 * m[2] + 0.114 * m[3]) / 255; }
  function skinScan(root) {
    if (!cfg || !cfg.enabled || !THEMES[cfg.theme] || THEMES[cfg.theme].none) return;
    const all = root === document.body ? $$('body *') : [root, ...$$('*', root)];
    for (const n of all) {
      if (n.classList.contains('mt-skin') || n.closest('.mp-glass, #mp-qbar, #mp-qpop, .mp-modal-bg, #mp-ctx, #mp-eqtip, .mp-toast, .item, canvas')) continue;
      if (/^(CANVAS|IMG|svg|VIDEO|INPUT|TEXTAREA)$/i.test(n.tagName)) continue;
      if (n.matches(WIN + ', ' + TIP + ', ' + CHAT + ', .mt-btn, .mt-menu, .mt-mi')) continue;   // te stylujemy osobno
      const cls = String(n.className || '');
      if (/item|widget-button|skill-icon|icon/i.test(cls)) continue;
      const cs = getComputedStyle(n);
      const r = n.getBoundingClientRect();
      if (r.width < 14 || r.height < 14) continue;
      if (cs.borderImageSource && cs.borderImageSource !== 'none' && r.width > 50 && r.height > 30) n.classList.add('mt-frame');
      const bg = cs.backgroundImage;
      if (!bg || bg === 'none' || /gradient/.test(bg) && !/url\(/.test(bg)) continue;
      if (NO_SKIN.test(bg) || /data:image\/svg\+xml/.test(bg)) continue;   // obrazki postaci/przedmiotów i nasze własne tła
      const big = r.width * r.height > 9000 || (r.width > 220 && r.height >= 14) || (r.height > 220 && r.width >= 14);
      if (!big) continue;
      if (n.querySelector('canvas') && r.width > 400 && r.height > 300) continue;        // kontener mapy
      if (lum(cs.color) < 0.35) continue;                                                 // jasne tło z ciemnym tekstem (pergamin)
      n.classList.add('mt-skin');
    }
  }

  /* ── oznaczanie przycisków z napisem i menu gry ── */
  const BTN_SEL = 'button, .button, [class*="button"], [class*="btn"]';
  function isTextButton(n) {
    if (!n || n.nodeType !== 1 || n.closest('.mp-glass, #mp-qbar, #mp-qpop, .mp-modal-bg')) return false;
    const cls = String(n.className || '');
    if (/widget|close|mp-|scroll|resize|arrow|icon/i.test(cls)) return false;
    const txt = (n.textContent || '').trim();
    if (!txt || txt.length > 40) return false;
    if (n.querySelector('canvas, img, .item')) return false;
    if ($$(BTN_SEL, n).some((c) => c !== n && (c.textContent || '').trim() === txt)) return false;   // tylko najgłębszy
    return true;
  }
  function tag(root) {
    if (!cfg || !cfg.enabled || !THEMES[cfg.theme] || THEMES[cfg.theme].none) return;
    const list = root.matches && root.matches(BTN_SEL) ? [root, ...$$(BTN_SEL, root)] : $$(BTN_SEL, root);
    for (const n of list) if (!n.classList.contains('mt-btn') && isTextButton(n)) n.classList.add('mt-btn');
  }
  function tagMenu(labels) {
    if (!cfg || !cfg.enabled || !labels || !labels.length || !THEMES[cfg.theme] || THEMES[cfg.theme].none) return;
    setTimeout(() => {
      const leaves = labels.map((l) => $$('body *').find((n) => !n.children.length && (n.textContent || '').trim() === String(l).trim() && isVisible(n) && !n.closest('.mp-glass, #mp-ctx'))).filter(Boolean);
      if (!leaves.length) return;
      // pozycja = najwyższy przodek z jednym napisem; menu = ich wspólny rodzic
      const rows = leaves.map((lf) => { let r = lf; while (r.parentElement && r.parentElement !== document.body && (r.parentElement.textContent || '').trim() === (lf.textContent || '').trim()) r = r.parentElement; return r; });
      let box = rows[0].parentElement;
      while (box && box !== document.body && !rows.every((r) => box.contains(r))) box = box.parentElement;
      if (box && box !== document.body) { box.classList.add('mt-menu'); rows.forEach((r) => r.classList.add('mt-mi')); }
    }, 0);
  }
  let skinQueue = new Set(), skinT = null;
  function startTagging() {
    if (mo) return;
    tag(document.body);
    skinScan(document.body);
    mo = new MutationObserver((muts) => {
      for (const m of muts) for (const n of m.addedNodes) if (n.nodeType === 1 && !n.closest('.mp-glass')) { tag(n); skinQueue.add(n); }
      if (skinQueue.size && !skinT) skinT = setTimeout(() => { skinT = null; const q = [...skinQueue]; skinQueue.clear(); q.forEach((n) => n.isConnected && skinScan(n)); }, 250);
    });
    mo.observe(document.body, { childList: true, subtree: true });
    // gra ładuje część grafik później — pełne przejście jeszcze kilka razy
    [1500, 4000, 9000].forEach((ms) => setTimeout(() => skinScan(document.body), ms));
  }
  function stopTagging() {
    if (mo) { mo.disconnect(); mo = null; }
    $$('.mt-btn').forEach((n) => n.classList.remove('mt-btn'));
    $$('.mt-menu').forEach((n) => n.classList.remove('mt-menu'));
    $$('.mt-mi').forEach((n) => n.classList.remove('mt-mi'));
    $$('.mt-skin').forEach((n) => n.classList.remove('mt-skin'));
    $$('.mt-frame').forEach((n) => n.classList.remove('mt-frame'));
  }

  function apply() {
    if (!styleEl) { styleEl = el('style', { id: 'mp-motywnik' }); document.head.appendChild(styleEl); }
    const on = cfg && cfg.enabled;
    if (cfg && ALIAS[cfg.theme]) { cfg.theme = ALIAS[cfg.theme]; config.save(); }
    const t = on ? THEMES[cfg.theme] || THEMES.domyslny : null;
    loadFonts(on ? t : null);
    if (!on) { styleEl.textContent = ''; stopTagging(); return; }
    let css = themeCss(t);
    const own = (cfg.custom || []).find((x) => x.id === cfg.customOn);
    if (own) css += `\n/* Własny styl: ${own.name} */\n${own.css}`;
    styleEl.textContent = css;
    stopTagging();
    if (t && !t.none) startTagging();
  }

  /* ── własne style ── */
  const uid = () => Math.random().toString(36).slice(2, 9);
  async function saveCustom(css, name, rerender) {
    const nm = name || await MP.promptBox({ title: 'Nazwa stylu', label: 'Pod tą nazwą styl pojawi się na liście', value: 'Mój styl', okText: 'Zapisz' });
    if (!nm) return;
    const item = { id: uid(), name: nm, css };
    cfg.custom = (cfg.custom || []).concat(item);
    cfg.customOn = item.id;
    config.save(); apply(); rerender();
    toast(`Motywnik: zapisano i włączono styl „${nm}"`);
  }
  function loadFile(rerender) {
    const inp = el('input', { type: 'file', accept: '.css,text/css,.txt', style: { display: 'none' } });
    inp.addEventListener('change', () => {
      const fl = inp.files && inp.files[0];
      if (!fl) return;
      const rd = new FileReader();
      rd.onload = () => { saveCustom(String(rd.result || ''), fl.name.replace(/\.(css|txt)$/i, ''), rerender); inp.remove(); };
      rd.readAsText(fl);
    });
    document.body.appendChild(inp);
    inp.click();
  }
  function download(name, css) {
    const a = el('a', { href: URL.createObjectURL(new Blob([css], { type: 'text/css' })), download: (name || 'styl') + '.css' });
    document.body.appendChild(a); a.click(); a.remove();
  }

  /** Mini-podgląd stylu: kawałek panelu gry z oknem, nagłówkiem i przyciskiem. */
  function preview(k) {
    const t = THEMES[k];
    if (t.none) return el('div', { class: 'mp-mt-stage dom' }, el('div', { class: 'mp-mt-win domyslny' }, el('i', null, 'Grupa'), el('span', null, 'Habiachi (41p)'), el('em', null, 'Rozwiąż grupę')));
    const st = el('div', { class: 'mp-mt-stage' });
    st.style.background = t.panel; st.style.backgroundColor = t.panelC;
    const w = el('div', { class: 'mp-mt-win' }, el('i', null, 'Grupa'), el('span', null, 'Habiachi (41p)'), el('em', null, 'Rozwiąż grupę'));
    w.style.background = [...(t.orn ? corners(t.orn).map((x) => x.replace(/ no-repeat$/, ' / 16px 16px no-repeat')) : []), `linear-gradient(rgba(${t.win},.97),rgba(${t.win},.97))`].join(', ');
    Object.assign(w.style, { border: `1px solid ${t.border}`, color: t.text, boxShadow: `0 0 10px ${t.glow}`, borderRadius: Math.min(t.radius || 3, 8) + 'px', fontFamily: t.font || 'Arial,sans-serif' });
    Object.assign(w.querySelector('i').style, { color: t.head });
    Object.assign(w.querySelector('em').style, { background: t.btn, color: t.btnText, border: `1px solid ${t.btnBorder}`, borderRadius: Math.min(t.radius || 3, 6) + 'px' });
    st.appendChild(w);
    return st;
  }

  defineAddon({
    id: 'motywnik', name: 'Motywnik', icon: 'motywnik', color: ['#ff7ad9', '#7c5cff'], renderFirst: true,
    desc: 'Wygląd całego interfejsu gry: ramy i panele, paski, okna, przyciski, menu, dymki i czat. Style: Domyślny (bez zmian), Obsydian, Wulkan, Królewski, Nowoczesny + własne style CSS. Mapa, postacie i ikonki przedmiotów zostają bez zmian.',
    defaults: { theme: 'domyslny', custom: [], customOn: null },
    settings: [],
    render(box, c, rerender) {
      const grid = el('div', { class: 'mp-mt-grid' });
      for (const [k, t] of Object.entries(THEMES)) {
        grid.appendChild(el('div', { class: 'mp-mt-card' + (c.theme === k ? ' on' : ''), title: t.desc || '', onclick: () => { c.theme = k; config.save(); apply(); rerender(); } },
          preview(k), el('div', { class: 'mp-mt-name' }, t.name), t.desc ? el('div', { class: 'mp-mt-desc' }, t.desc) : null));
      }
      const themesCard = el('div', { class: 'mp-card' }, el('h3', null, 'Styl interfejsu'), grid);
      if (!c.enabled) themesCard.prepend(MP.note('info', 'Dodatek jest wyłączony — gra ma swój wygląd. Włącz go, żeby zastosować styl.'));

      let editing = null;
      const ta = el('textarea', { class: 'mp-in', placeholder: '/* Wklej tu swój CSS, np.:\n.mt-btn { background: #224 !important; }\n.c-window { border-radius: 12px !important; } */' });
      ta.addEventListener('keydown', (e) => e.stopPropagation());
      const list = el('div', { class: 'mp-mt-own' });
      (c.custom || []).forEach((s) => {
        list.appendChild(el('div', { class: 'mp-mt-row' },
          el('button', { class: 'mp-upchip' + (c.customOn === s.id ? ' on' : ''), onclick: () => { c.customOn = c.customOn === s.id ? null : s.id; config.save(); apply(); rerender(); } }, c.customOn === s.id ? 'Włączony' : 'Włącz'),
          el('b', { style: { flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, s.name),
          el('button', { class: 'mp-btn', onclick: () => { ta.value = s.css; ta.focus(); editing = s.id; } }, 'Edytuj'),
          el('button', { class: 'mp-btn', onclick: () => download(s.name, s.css) }, 'Pobierz'),
          el('button', { class: 'mp-btn bad', onclick: async () => { if (await MP.confirmBox({ title: `Usunąć „${s.name}"?`, okText: 'Usuń', danger: true })) { c.custom = c.custom.filter((x) => x.id !== s.id); if (c.customOn === s.id) c.customOn = null; config.save(); apply(); rerender(); } } }, 'Usuń')));
      });
      const ownCard = el('div', { class: 'mp-card' }, el('h3', null, 'Własne style'),
        (c.custom || []).length ? list : el('div', { class: 'mp-dim', style: { marginBottom: '8px' } }, 'Wklej CSS poniżej albo wczytaj plik .css. Własny styl działa razem z wybranym stylem (wybierz Domyślny, żeby był jedyny).'),
        ta,
        el('div', { class: 'mp-btns' },
          el('button', { class: 'mp-btn', title: 'Pokaż na 8 sekund bez zapisywania', onclick: () => { if (!styleEl) apply(); styleEl.textContent += '\n' + ta.value; toast('Motywnik: podgląd przez 8 sekund'); setTimeout(() => apply(), 8000); } }, 'Podgląd'),
          el('button', { class: 'mp-btn pri', onclick: () => {
            if (!ta.value.trim()) { toast('Motywnik: wpisz najpierw CSS', 'warn'); return; }
            if (editing) { const s = c.custom.find((x) => x.id === editing); if (s) { s.css = ta.value; config.save(); apply(); toast(`Motywnik: zapisano „${s.name}"`); rerender(); return; } }
            saveCustom(ta.value, null, rerender);
          } }, 'Zapisz styl'),
          el('button', { class: 'mp-btn', onclick: () => loadFile(rerender) }, 'Wczytaj plik .css'),
          el('button', { class: 'mp-btn', title: 'Pobierz CSS wybranego motywu jako punkt wyjścia', onclick: () => download(THEMES[c.theme]?.name || 'motyw', themeCss(THEMES[c.theme])) }, 'Pobierz CSS motywu')),
        el('div', { class: 'mp-dim', style: { marginTop: '6px', fontSize: '11.5px' } }, 'Elementy do stylowania: .c-window (okna), .mt-btn (przyciski z napisem), .mt-menu i .mt-mi (menu prawego przycisku), .tip-wrapper (dymki), .new-chat-window (czat), .big-messages .message (komunikaty).'));
      box.append(themesCard, ownCard);
    },
    init(c) {
      cfg = c;
      if (!c._v25) { c._v25 = true; c.theme = ALIAS[c.theme] || (THEMES[c.theme] ? c.theme : 'domyslny'); ['bright', 'sat', 'alpha', 'radius', 'fonts'].forEach((k) => delete c[k]); config.save(); }
      bus.on('popup:shown', (labels) => tagMenu(labels));
      apply();
      MP.motywnik = { apply, THEMES };
    },
    onToggle() { apply(); },
  });
})();
