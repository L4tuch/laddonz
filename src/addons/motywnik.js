/* ───────── Motywnik ─────────
 * Zmienia wygląd interfejsu gry: okna, dymki, czat, przyciski widżetów, komunikaty, paski przewijania.
 * Gotowe motywy + suwaki (przezroczystość okien, zaokrąglenie, jasność, nasycenie) + własne style CSS
 * (wklejone albo wczytane z pliku .css). Mapa i postacie nie są zmieniane — tylko interfejs.
 * Wszystko to czysty CSS dokładany do strony: wyłączenie dodatku od razu przywraca wygląd gry.
 */
(() => {
  let cfg, styleEl = null;

  // elementy interfejsu gry (nowy interfejs), które zmieniamy
  const WIN = '.c-window, .border-window';
  const TIP = '.tip-wrapper';
  const CHAT = '.new-chat-window';
  const WIDGET = '[class*="widget-button"]';

  /** Motywy: kolory tła okien (r,g,b), obramowania, tekstu, akcentu i opcjonalny „klimat" (filtr ramek). */
  const THEMES = {
    gra:      { name: 'Domyślny (gra)', none: true },
    nocny:    { name: 'Nocny',        bg: '18,20,26',  border: '#3a3f4b', text: '#e6e6e6', accent: '#8ea2ff', glow: 'rgba(120,140,255,.25)' },
    szklo:    { name: 'Szkło',        bg: '20,24,32',  border: 'rgba(255,255,255,.18)', text: '#f2f4f8', accent: '#7cc4ff', glass: true, glow: 'rgba(124,196,255,.25)' },
    mroz:     { name: 'Mroźny',       bg: '14,28,42',  border: '#4b7fa8', text: '#e3f3ff', accent: '#6fd3ff', glow: 'rgba(111,211,255,.35)', filter: 'hue-rotate(170deg) saturate(.8)' },
    krew:     { name: 'Krwawy',       bg: '30,10,12',  border: '#7a1f27', text: '#ffe9e9', accent: '#ff4b55', glow: 'rgba(255,75,85,.35)', filter: 'hue-rotate(-30deg) saturate(1.3)' },
    szmaragd: { name: 'Szmaragd',     bg: '10,28,20',  border: '#2f7a55', text: '#e7fff2', accent: '#3ddc97', glow: 'rgba(61,220,151,.3)', filter: 'hue-rotate(80deg) saturate(.9)' },
    zloto:    { name: 'Królewski',    bg: '28,22,10',  border: '#a8842f', text: '#fff6dd', accent: '#ffd76a', glow: 'rgba(255,215,106,.35)', filter: 'sepia(.35) saturate(1.2)' },
    fiolet:   { name: 'Mistyczny',    bg: '22,14,34',  border: '#6a4aa8', text: '#f3ecff', accent: '#b48cff', glow: 'rgba(180,140,255,.35)', filter: 'hue-rotate(230deg) saturate(.9)' },
    plaski:   { name: 'Płaski',       bg: '32,32,34',  border: '#505055', text: '#eeeeee', accent: '#cfcfcf', flat: true },
    kontrast: { name: 'Czytelny',     bg: '0,0,0',     border: '#ffffff', text: '#ffffff', accent: '#ffe500', big: true },
  };

  function themeCss(t) {
    if (!t || t.none) return '';
    const a = Math.max(0.2, Math.min(1, Number(cfg.alpha) || 0.92));
    const r = Number(cfg.radius) || 0;
    const blur = t.glass ? 'backdrop-filter:blur(10px) saturate(140%);-webkit-backdrop-filter:blur(10px) saturate(140%);' : '';
    return `
/* Motywnik — ${t.name} */
:root{--mt-bg:${t.bg};--mt-border:${t.border};--mt-text:${t.text};--mt-accent:${t.accent}}
${WIN}{border-radius:${r}px!important;${t.glow ? `box-shadow:0 0 0 1px var(--mt-border),0 8px 28px rgba(0,0,0,.55),0 0 18px ${t.glow}!important;` : ''}}
${WIN}{background-color:rgba(var(--mt-bg),${a})!important;${blur}}
${t.flat || t.glass ? `${WIN}{border-image:none!important;border:1px solid var(--mt-border)!important}` : ''}
${WIN}, ${WIN} [class*="content"]{color:var(--mt-text)}
${WIN} [class*="header"], ${WIN} [class*="title"]{color:var(--mt-accent)!important;text-shadow:0 1px 2px #000}
${TIP}{background-color:rgba(var(--mt-bg),${Math.min(1, a + 0.04)})!important;border:1px solid var(--mt-border)!important;border-radius:${Math.min(r, 10)}px!important;color:var(--mt-text);${blur}${t.glow ? `box-shadow:0 0 12px ${t.glow}!important;` : ''}}
${CHAT}{background-color:rgba(var(--mt-bg),${Math.max(0.35, a - 0.2)})!important;border-radius:${Math.min(r, 10)}px;color:var(--mt-text)}
${WIDGET}{border-radius:${Math.min(r, 8)}px!important;${t.glow ? `box-shadow:0 0 8px ${t.glow}!important;` : ''}}
.big-messages .message{color:var(--mt-accent)!important}
${t.big ? `${CHAT}{font-size:14px!important}${TIP}{font-size:13px!important}${WIN}{font-size:13px}` : ''}
${WIN} ::-webkit-scrollbar, ${CHAT} ::-webkit-scrollbar{width:8px;height:8px}
${WIN} ::-webkit-scrollbar-thumb, ${CHAT} ::-webkit-scrollbar-thumb{background:var(--mt-border);border-radius:8px}
${WIN} ::-webkit-scrollbar-track, ${CHAT} ::-webkit-scrollbar-track{background:transparent}
`;
  }

  function apply() {
    if (!styleEl) { styleEl = el('style', { id: 'mp-motywnik' }); document.head.appendChild(styleEl); }
    if (!cfg || !cfg.enabled) { styleEl.textContent = ''; return; }
    let css = themeCss(THEMES[cfg.theme]);
    // jasność / nasycenie interfejsu (bez mapy; przedmioty w oknach też się zmieniają — to cały interfejs)
    const b = Number(cfg.bright) || 100, s = Number(cfg.sat) || 100;
    if (b !== 100 || s !== 100) css += `\n${WIN}, ${TIP}, ${CHAT}, ${WIDGET}{filter:brightness(${b / 100}) saturate(${s / 100})}`;
    const own = (cfg.custom || []).find((x) => x.id === cfg.customOn);
    if (own) css += `\n/* Własny styl: ${own.name} */\n${own.css}`;
    styleEl.textContent = css;
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
      const f = inp.files && inp.files[0];
      if (!f) return;
      const rd = new FileReader();
      rd.onload = () => { saveCustom(String(rd.result || ''), f.name.replace(/\.(css|txt)$/i, ''), rerender); inp.remove(); };
      rd.readAsText(f);
    });
    document.body.appendChild(inp);
    inp.click();
  }
  function download(name, css) {
    const a = el('a', { href: URL.createObjectURL(new Blob([css], { type: 'text/css' })), download: (name || 'styl') + '.css' });
    document.body.appendChild(a); a.click(); a.remove();
  }

  function preview(t) {
    if (t.none) return el('div', { class: 'mp-mt-stage gra' }, el('div', { class: 'mp-mt-win' }, el('i', null, 'Okno'), el('b')));
    const st = el('div', { class: 'mp-mt-stage' });
    const w = el('div', { class: 'mp-mt-win' }, el('i', null, 'Okno'), el('b'));
    w.style.setProperty('background', `rgba(${t.bg},.92)`);
    w.style.setProperty('border', `1px solid ${t.border}`);
    w.style.setProperty('color', t.text);
    if (t.glow) w.style.setProperty('box-shadow', `0 0 10px ${t.glow}`);
    w.querySelector('i').style.color = t.accent;
    w.querySelector('b').style.background = t.accent;
    st.appendChild(w);
    return st;
  }

  defineAddon({
    id: 'motywnik', name: 'Motywnik', icon: 'motywnik', color: ['#ff7ad9', '#7c5cff'], renderFirst: true,
    desc: 'Zmienia wygląd interfejsu gry: okna, dymki, czat, przyciski i komunikaty. Gotowe motywy, suwaki oraz własne style CSS (wklejone albo wczytane z pliku). Mapa i postacie zostają bez zmian. Wyłączenie dodatku od razu przywraca wygląd gry.',
    defaults: { theme: 'nocny', alpha: 0.92, radius: 6, bright: 100, sat: 100, custom: [], customOn: null },
    settings: [
      { group: 'Dopasowanie', key: 'alpha', type: 'range', label: 'Krycie okien', min: 0.3, max: 1, step: 0.02, live: () => apply() },
      { group: 'Dopasowanie', key: 'radius', type: 'range', label: 'Zaokrąglenie rogów (px)', min: 0, max: 18, step: 1, live: () => apply() },
      { group: 'Dopasowanie', key: 'bright', type: 'range', label: 'Jasność interfejsu (%)', min: 60, max: 130, step: 2, live: () => apply() },
      { group: 'Dopasowanie', key: 'sat', type: 'range', label: 'Nasycenie kolorów (%)', min: 0, max: 160, step: 5, live: () => apply() },
    ],
    render(box, c, rerender) {
      // motywy
      const grid = el('div', { class: 'mp-mt-grid' });
      for (const [k, t] of Object.entries(THEMES)) {
        grid.appendChild(el('div', { class: 'mp-mt-card' + (c.theme === k ? ' on' : ''), onclick: () => { c.theme = k; config.save(); apply(); rerender(); } },
          preview(t), el('div', { class: 'mp-mt-name' }, t.name)));
      }
      const themesCard = el('div', { class: 'mp-card' }, el('h3', null, 'Motyw'), grid);
      if (!c.enabled) themesCard.prepend(MP.note('info', 'Dodatek jest wyłączony — gra ma swój wygląd. Włącz go, żeby zobaczyć motyw.'));

      // własne style
      const list = el('div', { class: 'mp-mt-own' });
      (c.custom || []).forEach((s) => {
        list.appendChild(el('div', { class: 'mp-mt-row' + (c.customOn === s.id ? ' on' : '') },
          el('button', { class: 'mp-upchip' + (c.customOn === s.id ? ' on' : ''), onclick: () => { c.customOn = c.customOn === s.id ? null : s.id; config.save(); apply(); rerender(); } }, c.customOn === s.id ? 'Włączony' : 'Włącz'),
          el('b', { style: { flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, s.name),
          el('button', { class: 'mp-btn', onclick: () => { ta.value = s.css; ta.focus(); editing = s.id; } }, 'Edytuj'),
          el('button', { class: 'mp-btn', onclick: () => download(s.name, s.css) }, 'Pobierz'),
          el('button', { class: 'mp-btn bad', onclick: async () => { if (await MP.confirmBox({ title: `Usunąć „${s.name}"?`, okText: 'Usuń', danger: true })) { c.custom = c.custom.filter((x) => x.id !== s.id); if (c.customOn === s.id) c.customOn = null; config.save(); apply(); rerender(); } } }, 'Usuń')));
      });
      let editing = null;
      const ta = el('textarea', { class: 'mp-in', placeholder: '/* Wklej tu swój CSS, np.:\n.c-window { border-radius: 12px !important; }\n.new-chat-window { font-size: 14px !important; } */' });
      ta.addEventListener('keydown', (e) => e.stopPropagation());
      const ownCard = el('div', { class: 'mp-card' }, el('h3', null, 'Własne style'),
        (c.custom || []).length ? list : el('div', { class: 'mp-dim', style: { marginBottom: '8px' } }, 'Nie masz jeszcze własnych stylów. Wklej CSS poniżej albo wczytaj plik .css.'),
        ta,
        el('div', { class: 'mp-btns' },
          el('button', { class: 'mp-btn', title: 'Pokaż na chwilę bez zapisywania', onclick: () => { if (!styleEl) apply(); const prev = styleEl.textContent; styleEl.textContent = prev + '\n' + ta.value; toast('Motywnik: podgląd przez 8 sekund'); setTimeout(() => apply(), 8000); } }, 'Podgląd'),
          el('button', { class: 'mp-btn pri', onclick: () => {
            if (!ta.value.trim()) { toast('Motywnik: wpisz najpierw CSS', 'warn'); return; }
            if (editing) { const s = c.custom.find((x) => x.id === editing); if (s) { s.css = ta.value; config.save(); apply(); toast(`Motywnik: zapisano „${s.name}"`); rerender(); return; } }
            saveCustom(ta.value, null, rerender);
          } }, 'Zapisz styl'),
          el('button', { class: 'mp-btn', onclick: () => loadFile(rerender) }, 'Wczytaj plik .css')),
        el('div', { class: 'mp-dim', style: { marginTop: '6px', fontSize: '11.5px' } }, 'Własny styl działa razem z wybranym motywem (wybierz „Domyślny (gra)", żeby był jedyny). Przydatne elementy gry: .c-window (okna), .tip-wrapper (dymki), .new-chat-window (czat), .big-messages .message (komunikaty), [class*="widget-button"] (przyciski).'));
      box.append(themesCard, ownCard);
    },
    init(c) { cfg = c; apply(); MP.motywnik = { apply, THEMES }; },
    onToggle() { apply(); },
  });
})();
