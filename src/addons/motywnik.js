/* ───────── Motywnik ─────────
 * Ciemny wygląd całego interfejsu z delikatnym akcentem żaru/lawy. Zmienia WYŁĄCZNIE kolory, tła i obrazki ramek —
 * nigdy rozmiarów: nie rusza szerokości ramek, odstępów, marginesów ani czcionek, więc nic się nie rozjeżdża.
 *   • panele i paski gry (duże tła-obrazki)         → ciemna tekstura (.mt-skin)
 *   • ozdobne ramki okien (border-image)             → ta sama geometria, ciemna ramka z żarzącą krawędzią
 *   • okna, dymki, czat                              → ciemne tło
 *   • przyciski z napisem i menu prawego przycisku   → ciemne przyciski z cienką obwódką (bez zmiany rozmiaru)
 * Mapa, postacie i ikonki przedmiotów zostają bez zmian. Wyłączenie / „Domyślny" = wygląd gry.
 */
(() => {
  let cfg, styleEl = null, mo = null;

  const WIN = '.c-window, .border-window';
  const HEAD = '.c-window [class*="header"], .c-window [class*="title"], .border-window [class*="header-label"]';
  const TIP = '.tip-wrapper';
  const CHAT = '.new-chat-window';
  const inW = (sel) => WIN.split(',').flatMap((w) => sel.split(',').map((x) => w.trim() + ' ' + x.trim())).join(', ');
  const svg = (s) => `url("data:image/svg+xml,${encodeURIComponent(s)}")`;

  /* ── grafika (SVG, bez zewnętrznych plików) ── */
  // drobne ziarno kamienia
  const grain = svg(`<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1  0 0 0 0 .92  0 0 0 0 .85  0 0 0 .055 0'/></filter><rect width='100%' height='100%' filter='url(#n)'/></svg>`);
  // rzadkie, cienkie pęknięcia z żarem — tylko akcent, niska intensywność
  const embers = svg(`<svg xmlns='http://www.w3.org/2000/svg' width='520' height='520'><defs><filter id='b' x='-20%' y='-20%' width='140%' height='140%'><feGaussianBlur stdDeviation='2.4'/></filter><linearGradient id='f' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#ff6a1a' stop-opacity='0'/><stop offset='.5' stop-color='#ff7b22'/><stop offset='1' stop-color='#ff6a1a' stop-opacity='0'/></linearGradient></defs><g fill='none' stroke-linecap='round' stroke-linejoin='round'><g stroke='#ff4a0a' stroke-width='3.2' opacity='.18' filter='url(#b)'><path d='M40 470 L78 438 L92 446 L131 402 L150 410 L176 381'/><path d='M360 60 L392 92 L388 108 L421 139'/></g><g stroke='url(#f)' stroke-width='.9' opacity='.55'><path d='M40 470 L78 438 L92 446 L131 402 L150 410 L176 381'/><path d='M360 60 L392 92 L388 108 L421 139'/><path d='M92 446 L101 470' opacity='.6'/></g></g></svg>`);
  // ramka okna (9-slice, pas 12 px): ciemny metal, wewnętrzna krawędź z delikatnym żarem
  const frame = (glow) => svg(`<svg xmlns='http://www.w3.org/2000/svg' width='60' height='60'><defs><linearGradient id='m' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#3a3633'/><stop offset='.5' stop-color='#1d1b1a'/><stop offset='1' stop-color='#2b2826'/></linearGradient></defs><rect x='0.5' y='0.5' width='59' height='59' rx='3' fill='url(#m)' stroke='#0a0908'/><rect x='3.5' y='3.5' width='53' height='53' rx='2' fill='none' stroke='#4d4742' stroke-opacity='.8'/><rect x='11.5' y='11.5' width='37' height='37' fill='#121110' stroke='${glow ? '#a8461a' : '#3a3633'}' stroke-opacity='${glow ? '.85' : '1'}'/>${glow ? "<rect x='10.5' y='10.5' width='39' height='39' fill='none' stroke='#ff7a2a' stroke-opacity='.18'/>" : ''}</svg>`);

  const PANEL = (ember) => `${ember ? embers + ', ' : ''}${grain}, radial-gradient(ellipse at 50% 115%, rgba(255,95,25,${ember ? '.10' : '0'}), transparent 55%), linear-gradient(170deg,#1b1918,#0f0e0d)`;

  const THEMES = {
    domyslny: { name: 'Domyślny', desc: 'Wygląd gry bez zmian.', none: true },
    mroczny: { name: 'Mroczny', desc: 'Ciemny kamień i metal, delikatny żar w pęknięciach.' },
  };

  function css() {
    const ember = cfg.ember !== false;
    const btnBg = 'linear-gradient(#2c2927,#1a1817)';
    const btnBgH = ember ? 'linear-gradient(#3a2a22,#211915)' : 'linear-gradient(#383432,#211f1d)';
    const edge = ember ? 'rgba(200,90,40,.55)' : '#4d4742';
    // UWAGA: żadnych zmian border-width / padding / margin / font — tylko kolory, tła i obrazki
    const btn = `background:${btnBg}!important;color:#e9e2d8!important;text-shadow:0 1px 1px #000!important;box-shadow:inset 0 0 0 1px ${edge},inset 0 1px 0 rgba(255,255,255,.06)!important;border-color:#0c0b0a!important`;
    const btnH = `background:${btnBgH}!important;box-shadow:inset 0 0 0 1px ${ember ? 'rgba(255,120,50,.85)' : '#6a625b'},0 0 8px ${ember ? 'rgba(255,100,30,.25)' : 'rgba(0,0,0,.4)'}!important`;
    return `
/* Motywnik — Mroczny */
.mt-skin{background-image:${PANEL(ember)}!important;background-color:#141312!important;background-repeat:repeat!important;background-size:auto!important;background-position:0 0!important}
.mt-frame, .border-window{border-image-source:${frame(ember)}!important;border-image-slice:12 fill!important;border-image-repeat:stretch!important}
${WIN}{background-color:#141312!important;color:#ddd5ca!important}
${inW('[class*="content"]')}{color:#ddd5ca}
${HEAD}{color:#efe6da!important;text-shadow:0 1px 2px #000${ember ? ',0 0 6px rgba(255,110,40,.35)' : ''}!important}
.mt-btn{${btn}}
.mt-btn:hover{${btnH}}
.mt-menu{background-color:#141312!important;background-image:none!important;box-shadow:0 0 0 1px #3a3633,0 8px 22px rgba(0,0,0,.7)!important}
.mt-mi{${btn}}
.mt-mi:hover{${btnH}}
#mp-ctx{background:#141312!important;border-color:#3a3633!important}
#mp-ctx .mp-ctx-item{${btn};border-color:transparent!important}
#mp-ctx .mp-ctx-item:hover{${btnH}}
#mp-ctx .mp-ctx-title{background:transparent!important;color:#efe6da!important;border-bottom-color:#3a3633!important}
${TIP}{background-color:#121110!important;background-image:${grain}!important;color:#e6ddd1!important;box-shadow:0 0 0 1px #3a3633,0 6px 18px rgba(0,0,0,.7)${ember ? ',inset 0 -1px 0 rgba(255,110,40,.35)' : ''}!important}
${CHAT}{background-color:rgba(16,15,14,.9)!important}
${inW('input, textarea, select')}, ${CHAT} input, ${CHAT} textarea{background-color:#0d0c0b!important;color:#e6ddd1!important;border-color:#3a3633!important}
${inW('[class*="tab"][class*="active"], [class*="card"][class*="active"]')}{color:#fff!important;box-shadow:inset 0 -2px 0 ${ember ? '#c8571f' : '#8a817a'}!important}
${inW('::-webkit-scrollbar-thumb')}, ${CHAT} ::-webkit-scrollbar-thumb{background:#3a3633!important}
`;
  }

  /* ── oznaczanie przycisków z napisem, menu i paneli gry ── */
  const BTN_SEL = 'button, .button, [class*="button"], [class*="btn"]';
  const skip = (n) => n.closest('.mp-glass, #mp-qbar, #mp-qpop, .mp-modal-bg, #mp-ctx, #mp-eqtip, .mp-toast, #mp-launcher');
  function isTextButton(n) {
    if (!n || n.nodeType !== 1 || skip(n)) return false;
    if (/widget|close|mp-|scroll|resize|arrow|icon/i.test(String(n.className || ''))) return false;
    const txt = (n.textContent || '').trim();
    if (!txt || txt.length > 40 || n.querySelector('canvas, img, .item')) return false;
    if ($$(BTN_SEL, n).some((c) => c !== n && (c.textContent || '').trim() === txt)) return false;
    return true;
  }
  const NO_SKIN = /itemy|items?\/|outfit|postac|npc|mob|pet|chowan|portret|avatar|face|emotk|emoji|smile|icons?\/|ikon|maps?\/|mapy|ad[sv]?\//i;
  const lum = (c) => { const m = String(c).match(/(\d+)\D+(\d+)\D+(\d+)/); return m ? (0.299 * m[1] + 0.587 * m[2] + 0.114 * m[3]) / 255 : 1; };
  function scan(root) {
    if (!active()) return;
    const all = root === document.body ? $$('body *') : [root, ...$$('*', root)];
    for (const n of all) {
      if (skip(n) || n.closest('.item, canvas')) continue;
      if (n.matches(BTN_SEL) && !n.classList.contains('mt-btn') && isTextButton(n)) n.classList.add('mt-btn');
      if (/^(CANVAS|IMG|svg|VIDEO|INPUT|TEXTAREA)$/i.test(n.tagName) || n.classList.contains('mt-skin') || n.matches(WIN + ', ' + TIP + ', ' + CHAT + ', .mt-btn, .mt-menu, .mt-mi')) continue;
      if (/item|widget-button|skill|icon/i.test(String(n.className || ''))) continue;
      const cs = getComputedStyle(n);
      const r = n.getBoundingClientRect();
      if (r.width < 14 || r.height < 14) continue;
      if (cs.borderImageSource && cs.borderImageSource !== 'none' && !/svg\+xml/.test(cs.borderImageSource) && r.width > 50 && r.height > 30) n.classList.add('mt-frame');
      const bg = cs.backgroundImage;
      if (!bg || bg === 'none' || !/url\(/.test(bg) || NO_SKIN.test(bg) || /svg\+xml/.test(bg)) continue;
      const big = r.width * r.height > 9000 || (r.width > 220 && r.height >= 14) || (r.height > 220 && r.width >= 14);
      if (!big) continue;
      if (n.querySelector('canvas') && r.width > 400 && r.height > 300) continue;   // kontener mapy
      if (lum(cs.color) < 0.35) continue;                                            // jasne tło z ciemnym tekstem (pergamin) zostaje
      n.classList.add('mt-skin');
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
    scan(document.body);
    mo = new MutationObserver((muts) => {
      for (const m of muts) for (const n of m.addedNodes) if (n.nodeType === 1 && !skip(n)) queue.add(n);
      if (queue.size && !qT) qT = setTimeout(() => { qT = null; const q = [...queue]; queue.clear(); q.forEach((n) => n.isConnected && scan(n)); }, 200);
    });
    mo.observe(document.body, { childList: true, subtree: true });
    [1500, 4000, 9000].forEach((ms) => setTimeout(() => scan(document.body), ms));
  }
  function stop() {
    if (mo) { mo.disconnect(); mo = null; }
    ['mt-btn', 'mt-menu', 'mt-mi', 'mt-skin', 'mt-frame'].forEach((c) => $$('.' + c).forEach((n) => n.classList.remove(c)));
  }
  const active = () => !!(cfg && cfg.enabled && THEMES[cfg.theme] && !THEMES[cfg.theme].none);

  function apply() {
    if (!styleEl) { styleEl = el('style', { id: 'mp-motywnik' }); document.head.appendChild(styleEl); }
    stop();
    if (!cfg || !cfg.enabled) { styleEl.textContent = ''; return; }
    let out = active() ? css() : '';
    const own = (cfg.custom || []).find((x) => x.id === cfg.customOn);
    if (own) out += `\n/* Własny styl: ${own.name} */\n${own.css}`;
    styleEl.textContent = out;
    if (active()) start();
  }

  /*
   * Zbieranie danych wyglądu (dla twórcy): jakie elementy interfejsu gry mają tła, ramki, kolory i czcionki,
   * oraz budowa otwartych okien. Na tej podstawie style są dopasowane dokładnie do gry.
   */
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
      els.push({ el: chain(n), wh: Math.round(r.width) + 'x' + Math.round(r.height), xy: Math.round(r.left) + ',' + Math.round(r.top),
        bg: hasBg ? short(cs.backgroundImage) : undefined, bgPos: hasBg ? cs.backgroundPosition : undefined, bi: hasBi ? short(cs.borderImageSource) + ' ' + cs.borderImageSlice + ' / ' + cs.borderWidth : undefined,
        bgc: hasCol ? cs.backgroundColor : undefined, col: txt ? cs.color : undefined, font: txt ? cs.fontFamily.split(',')[0] + ' ' + cs.fontSize + ' ' + cs.fontWeight : undefined, txt: txt || undefined });
      if (els.length > 900) break;
    }
    // budowa otwartych okien (bez treści)
    const tree = (n, d) => ({ c: (n.tagName || '').toLowerCase() + (typeof n.className === 'string' && n.className.trim() ? '.' + n.className.trim().split(/\s+/).join('.') : ''), k: d < 5 ? [...n.children].slice(0, 10).map((x) => tree(x, d + 1)) : undefined });
    const wins = $$('.c-window, .border-window, [class*="-window"]').filter((w) => isVisible(w) && !w.closest('.mp-glass') && !w.parentElement.closest('.c-window, .border-window')).slice(0, 8).map((w) => tree(w, 0));
    const data = { wersja: MP.version, ekran: innerWidth + 'x' + innerHeight, root: (document.querySelector('[class*="game-window"]') || {}).className, okna: wins, elementy: els };
    const txt = JSON.stringify(data);
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

  function preview(k) {
    const t = THEMES[k];
    const w = el('div', { class: 'mp-mt-win ' + k }, el('i', null, 'Grupa'), el('span', null, 'Habiachi (41p)'), el('em', null, 'Rozwiąż grupę'));
    const st = el('div', { class: 'mp-mt-stage ' + k }, w);
    if (!t.none) st.style.backgroundImage = PANEL(true);
    return st;
  }

  defineAddon({
    id: 'motywnik', name: 'Motywnik', icon: 'motywnik', color: ['#ff8a3d', '#5a2a14'], renderFirst: true,
    desc: 'Ciemny wygląd całego interfejsu gry z delikatnym żarem w pęknięciach. Zmienia tylko kolory i tła — rozmiary okien, przycisków i czcionki zostają jak w grze. Możesz też wgrać własne style CSS.',
    defaults: { theme: 'mroczny', ember: true, custom: [], customOn: null },
    settings: [
      { key: 'ember', type: 'bool', label: 'Akcent żaru (lawy)', hint: 'Cienkie żarzące pęknięcia i ciepła krawędź ramek. Wyłączone = czysta czerń i metal.', live: () => apply() },
    ],
    render(box, c, rerender) {
      const grid = el('div', { class: 'mp-mt-grid' });
      for (const [k, t] of Object.entries(THEMES)) grid.appendChild(el('div', { class: 'mp-mt-card' + (c.theme === k ? ' on' : ''), onclick: () => { c.theme = k; config.save(); apply(); rerender(); } }, preview(k), el('div', { class: 'mp-mt-name' }, t.name), el('div', { class: 'mp-mt-desc' }, t.desc)));
      const tc = el('div', { class: 'mp-card' }, el('h3', null, 'Styl interfejsu'), grid);
      if (!c.enabled) tc.prepend(MP.note('info', 'Dodatek jest wyłączony — gra ma swój wygląd.'));
      let editing = null;
      const ta = el('textarea', { class: 'mp-in', placeholder: '/* Własny CSS, np.:\n.mt-btn { color: #ffd27a !important; } */' });
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
          el('button', { class: 'mp-btn', onclick: () => download('mroczny', css()) }, 'Pobierz CSS stylu')));
      const dc = el('div', { class: 'mp-card' }, el('h3', null, 'Dane wyglądu dla twórcy'),
        el('div', { class: 'mp-dim', style: { marginBottom: '8px' } }, 'Ustaw styl „Domyślny", otwórz kilka okien gry (np. ekwipunek, umiejętności, grupa, łupy, sklep), a potem kliknij przycisk i wklej wynik w rozmowie. Bez haseł i danych konta — tylko nazwy elementów, kolory, czcionki i rozmiary.'),
        el('div', { class: 'mp-btns' }, el('button', { class: 'mp-btn pri', onclick: collectLook }, 'Zbierz dane wyglądu')));
      box.append(tc, oc, dc);
    },
    init(c) {
      cfg = c;
      if (!THEMES[c.theme]) c.theme = 'mroczny';
      bus.on('popup:shown', (labels) => tagMenu(labels));
      apply();
      MP.motywnik = { apply, scan: () => scan(document.body), collectLook };
    },
    onToggle() { apply(); },
  });
})();
