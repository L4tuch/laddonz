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
   * Trzy proste, stonowane style:
   *   Klasyczny  — wygląd gry bez zmian,
   *   Ciemny     — czarno‑grafitowy interfejs, bez jaskrawych kolorów i poświat,
   *   Nowoczesny — klasyczny wygląd gry, ale z czytelniejszą czcionką i pogłębionymi kolorami.
   */
  const THEMES = {
    klasyczny: { name: 'Klasyczny', desc: 'Wygląd gry bez zmian.', none: true },
    ciemny: { name: 'Ciemny', desc: 'Czerń i grafit, spokojne szarości, bez poświat.', css: darkCss },
    nowoczesny: { name: 'Nowoczesny', desc: 'Klasyczny wygląd z czytelniejszą czcionką i głębszymi kolorami.', css: modernCss, fonts: ['Roboto:wght@400;500;700'] },
  };

  function loadFonts(t) {
    if (!t || !t.fonts) { if (fontEl) fontEl.remove(); fontEl = null; return; }
    const href = 'https://fonts.googleapis.com/css2?' + t.fonts.map((f) => 'family=' + f).join('&') + '&display=swap';
    if (fontEl && fontEl.href === href) return;
    if (fontEl) fontEl.remove();
    fontEl = el('link', { rel: 'stylesheet', href });
    document.head.appendChild(fontEl);
  }

  function darkCss() {
    const btn = 'background:linear-gradient(#2b2b2f,#1d1d20)!important;color:#ececec!important;border:1px solid #47474d!important;border-image:none!important;border-radius:3px!important;text-shadow:0 1px 1px #000!important;box-shadow:inset 0 1px 0 rgba(255,255,255,.05)!important';
    const btnHover = 'background:linear-gradient(#36363b,#26262a)!important;border-color:#5c5c63!important';
    return `
/* Motywnik — Ciemny */
${WIN}{background-color:rgba(14,14,16,.97)!important;color:#dcdcdc!important;border-radius:4px!important;box-shadow:0 0 0 1px #2e2e33,0 8px 24px rgba(0,0,0,.6)!important}
.border-window{border-image:none!important;border:1px solid #333338!important}
${inW('[class*="content"]')}{color:#dcdcdc!important}
${HEAD}{color:#f0f0f0!important;text-shadow:0 1px 1px #000!important}
${inW('[class*="header"]')}{background:linear-gradient(#1f1f23,#161618)!important;border-bottom:1px solid #2e2e33!important}
.mt-btn{${btn}}
.mt-btn:hover{${btnHover}}
.mt-menu{background:#141416!important;border:1px solid #38383e!important;border-image:none!important;border-radius:4px!important;box-shadow:0 8px 22px rgba(0,0,0,.65)!important;padding:3px!important}
.mt-mi{${btn};margin:2px 0!important}
.mt-mi:hover{${btnHover}}
#mp-ctx{background:#141416!important;border:1px solid #38383e!important}
#mp-ctx .mp-ctx-item{${btn}}
#mp-ctx .mp-ctx-item:hover{${btnHover}}
#mp-ctx .mp-ctx-title{background:transparent!important;color:#f0f0f0!important;border-bottom:1px solid #2e2e33!important}
${TIP}{background:rgba(12,12,14,.97)!important;border:1px solid #38383e!important;border-image:none!important;border-radius:4px!important;color:#e0e0e0!important;box-shadow:0 6px 18px rgba(0,0,0,.6)!important}
${CHAT}{background:rgba(10,10,12,.88)!important}
${inW('input, textarea, select')}, ${CHAT} input, ${CHAT} textarea{background:#0e0e10!important;color:#e6e6e6!important;border:1px solid #3a3a40!important;border-radius:3px!important}
${inW('[class*="tab"][class*="active"], [class*="card"][class*="active"]')}{color:#fff!important;box-shadow:inset 0 -2px 0 #8a8a92!important}
${inW('::-webkit-scrollbar')}, ${CHAT} ::-webkit-scrollbar{width:8px;height:8px}
${inW('::-webkit-scrollbar-thumb')}, ${CHAT} ::-webkit-scrollbar-thumb{background:#3a3a40;border-radius:8px}
${inW('::-webkit-scrollbar-track')}, ${CHAT} ::-webkit-scrollbar-track{background:transparent}
`;
  }

  function modernCss() {
    const font = '"Roboto", "Segoe UI", Arial, sans-serif';
    return `
/* Motywnik — Nowoczesny: klasyczny wygląd, lepsza czcionka i głębia kolorów */
${WIN}, ${TIP}, ${CHAT}, .mt-btn, .mt-menu, .mt-mi, .big-messages .message{font-family:${font}!important;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;text-rendering:optimizeLegibility}
${WIN}, ${TIP}, [class*="widget-button"]{filter:contrast(1.06) saturate(1.15)}
${HEAD}{font-weight:700!important;letter-spacing:.02em;text-shadow:0 1px 2px rgba(0,0,0,.85)!important}
.mt-btn, .mt-mi{font-weight:500!important;letter-spacing:.01em;text-shadow:0 1px 1px rgba(0,0,0,.7)!important}
${TIP}{box-shadow:0 6px 18px rgba(0,0,0,.5)!important}
${WIN}{box-shadow:0 10px 28px rgba(0,0,0,.45)!important}
${CHAT}{font-size:13px}
.big-messages .message{font-weight:700!important;text-shadow:0 1px 2px #000,0 0 6px rgba(0,0,0,.6)!important}
`;
  }

  function themeCss(t) { return !t || t.none || !t.css ? '' : t.css(); }

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
    if (!cfg || !cfg.enabled || !labels || !labels.length) return;
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
  function startTagging() {
    if (mo) return;
    tag(document.body);
    mo = new MutationObserver((muts) => { for (const m of muts) for (const n of m.addedNodes) if (n.nodeType === 1) tag(n); });
    mo.observe(document.body, { childList: true, subtree: true });
  }
  function stopTagging() {
    if (mo) { mo.disconnect(); mo = null; }
    $$('.mt-btn').forEach((n) => n.classList.remove('mt-btn'));
    $$('.mt-menu').forEach((n) => n.classList.remove('mt-menu'));
    $$('.mt-mi').forEach((n) => n.classList.remove('mt-mi'));
  }

  function apply() {
    if (!styleEl) { styleEl = el('style', { id: 'mp-motywnik' }); document.head.appendChild(styleEl); }
    const on = cfg && cfg.enabled;
    const t = on ? THEMES[cfg.theme] || THEMES.klasyczny : null;
    loadFonts(on ? t : null);
    if (!on) { styleEl.textContent = ''; stopTagging(); return; }
    let css = themeCss(t);
    const own = (cfg.custom || []).find((x) => x.id === cfg.customOn);
    if (own) css += `\n/* Własny styl: ${own.name} */\n${own.css}`;
    styleEl.textContent = css;
    if (t && !t.none) startTagging(); else stopTagging();
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

  /** Mini-podgląd stylu: okno z nagłówkiem, tekstem i przyciskiem. */
  function preview(k) {
    const w = el('div', { class: 'mp-mt-win ' + k }, el('i', null, 'Grupa'), el('span', null, 'Habiachi (41p)'), el('em', null, 'Rozwiąż grupę'));
    return el('div', { class: 'mp-mt-stage' }, w);
  }

  defineAddon({
    id: 'motywnik', name: 'Motywnik', icon: 'motywnik', color: ['#ff7ad9', '#7c5cff'], renderFirst: true,
    desc: 'Wygląd interfejsu gry: Klasyczny (bez zmian), Ciemny (czerń i grafit) albo Nowoczesny (klasyczny z lepszą czcionką i głębszymi kolorami). Możesz też wgrać własne style CSS. Mapa i postacie zostają bez zmian.',
    defaults: { theme: 'klasyczny', custom: [], customOn: null },
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
        (c.custom || []).length ? list : el('div', { class: 'mp-dim', style: { marginBottom: '8px' } }, 'Wklej CSS poniżej albo wczytaj plik .css. Własny styl działa razem z wybranym stylem (wybierz Klasyczny, żeby był jedyny).'),
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
      if (!c._v24) { c._v24 = true; if (!THEMES[c.theme]) c.theme = 'klasyczny'; ['bright', 'sat', 'alpha', 'radius', 'fonts'].forEach((k) => delete c[k]); config.save(); }
      bus.on('popup:shown', (labels) => tagMenu(labels));
      apply();
      MP.motywnik = { apply, THEMES };
    },
    onToggle() { apply(); },
  });
})();
