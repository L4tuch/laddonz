/* ───────── Hey WakeUP! ─────────
 * Kolory i czcionki powiadomień tekstowych (powiadomienia panelu + wskazane elementy gry).
 */
(() => {
  let cfg;
  const FONTS = [['"Segoe UI",system-ui,sans-serif', 'Systemowa'], ['Georgia,serif', 'Georgia (szeryfowa)'], ['"Trebuchet MS",sans-serif', 'Trebuchet'], ['Verdana,sans-serif', 'Verdana'], ['Consolas,monospace', 'Consolas (mono)'], ['"Comic Sans MS",cursive', 'Comic Sans'], ['Impact,sans-serif', 'Impact']];

  function apply() {
    const R = document.documentElement.style;
    const on = cfg && cfg.enabled;
    const set = (k, v) => (on ? R.setProperty(k, v) : R.removeProperty(k));
    set('--mp-toast-fg', cfg.fg);
    set('--mp-toast-bg', hexA(cfg.bg, cfg.bgAlpha));
    set('--mp-toast-border', cfg.border);
    set('--mp-toast-font', cfg.font);
    set('--mp-toast-size', cfg.size + 'px');
    set('--mp-toast-weight', cfg.bold ? '700' : '400');
    set('--mp-toast-shadow', cfg.shadow ? '0 0 6px ' + cfg.border + ', 0 1px 2px #000' : 'none');
    let st = document.getElementById('mp-wakeup-css');
    if (!st) { st = el('style', { id: 'mp-wakeup-css' }); document.head.appendChild(st); }
    const sel = (cfg.gameSelectors || '').split('\n').map((s) => s.trim()).filter(Boolean).join(',');
    st.textContent = on && cfg.styleGame && sel ? `${sel}{color:${cfg.fg}!important;font-family:${cfg.font}!important;font-size:${cfg.size}px!important;font-weight:${cfg.bold ? 700 : 400}!important;${cfg.shadow ? `text-shadow:0 0 6px ${cfg.border},0 1px 2px #000!important;` : ''}}` : '';
  }
  function hexA(hex, a) {
    const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex || '');
    if (!m) return hex;
    return `rgba(${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)},${a})`;
  }

  defineAddon({
    id: 'wakeup', name: 'Hey WakeUP!', icon: 'wakeup', color: ['#ffb547', '#ff7a45'],
    desc: 'Własne kolory i czcionki powiadomień tekstowych — żeby ważny komunikat od razu rzucał się w oczy.',
    defaults: { enabled: true, fg: '#ffffff', bg: '#10111c', bgAlpha: 0.8, border: '#7c5cff', font: '"Segoe UI",system-ui,sans-serif', size: 14, bold: true, shadow: false, styleGame: false,
      gameSelectors: '.big-messages .message\n.ingame-alert\n.small-info' },
    settings: [
      { group: 'Wygląd', key: 'fg', type: 'color', label: 'Kolor tekstu', live: () => apply() },
      { group: 'Wygląd', key: 'bg', type: 'color', label: 'Kolor tła', live: () => apply() },
      { group: 'Wygląd', key: 'bgAlpha', type: 'range', label: 'Krycie tła', min: 0, max: 1, step: 0.05, live: () => apply() },
      { group: 'Wygląd', key: 'border', type: 'color', label: 'Kolor obramowania / poświaty', live: () => apply() },
      { group: 'Wygląd', key: 'font', type: 'select', label: 'Czcionka', options: FONTS },
      { group: 'Wygląd', key: 'size', type: 'number', label: 'Rozmiar (px)', min: 9, max: 32 },
      { group: 'Wygląd', key: 'bold', type: 'bool', label: 'Pogrubienie' },
      { group: 'Wygląd', key: 'shadow', type: 'bool', label: 'Poświata' },
      { group: 'Komunikaty gry', key: 'styleGame', type: 'bool', label: 'Stosuj też do komunikatów gry' },
      { group: 'Komunikaty gry', key: 'gameSelectors', type: 'textarea', label: 'Selektory CSS komunikatów gry (po jednym w linii)', hint: 'Jeśli gra zmieni wygląd, sprawdź klasę komunikatu (F12 → wskaż element) i wpisz ją tutaj.' },
    ],
    render(box) {
      box.appendChild(el('div', { class: 'mp-btns' },
        el('button', { class: 'mp-btn pri', onclick: () => toast('Tak wygląda powiadomienie — Hey WakeUP!', 'info') }, 'Podgląd'),
        el('button', { class: 'mp-btn', onclick: () => toast('Przykładowe ostrzeżenie', 'warn') }, 'Podgląd ostrzeżenia')));
    },
    init(c) { cfg = c; apply(); },
    onToggle() { apply(); },
    onChange() { apply(); },
  });
})();

/* ───────── Bratan ─────────
 * Blokuje KAŻDY atak (także ręczny i z innych dodatków) na klanowiczów, znajomych, sojuszników i osoby z listy.
 */
(() => {
  let cfg;
  defineAddon({
    id: 'bratan', name: 'Bratan', icon: 'bratan', color: ['#3ddc97', '#1c9b6c'],
    desc: 'Blokuje atak na klanowiczów, znajomych i sojuszników. Działa na wszystkie ataki — także kliknięte ręcznie w grze.',
    defaults: { enabled: true, clan: true, friends: true, allies: true, nicks: [] },
    settings: [
      { key: 'clan', type: 'bool', label: 'Chroń klanowiczów' },
      { key: 'friends', type: 'bool', label: 'Chroń znajomych' },
      { key: 'allies', type: 'bool', label: 'Chroń sojuszników klanu' },
      { key: 'nicks', type: 'list', label: 'Dodatkowo chroń (nicki)', placeholder: 'nick + Enter' },
    ],
    init(c) {
      cfg = c;
      net.addGuard((task) => {
        if (!cfg.enabled) return null;
        if (!/^fight(&|$)/.test(task) || !/(^|&)a=attack(&|$)/.test(task)) return null;
        const m = /(?:^|&)id=(-?\d+)/.exec(task);
        if (!m) return null;
        const id = Number(m[1]);
        if (!id || id < 0) return null; // ujemne id = NPC
        const p = game.otherById(id);
        if (!p) return null;
        const why = (cfg.clan && p.isClan && 'klanowicz') || (cfg.friends && p.isFriend && 'znajomy') || (cfg.allies && p.isAlly && 'sojusznik') || (nickIn(cfg.nicks, p.nick) && 'na liście Bratana');
        return why ? { block: true, reason: `Bratan: zablokowano atak na ${p.nick} (${why})`, src: 'Bratan' } : null;
      });
    },
  });
})();

/* ───────── MiniChat ─────────
 * Zmniejsza okno czatu: szerokość, wysokość, czcionka, przezroczystość, zwijanie pod klawisz.
 */
(() => {
  let cfg, collapsed = false;
  function apply() {
    let st = document.getElementById('mp-minichat-css');
    if (!st) { st = el('style', { id: 'mp-minichat-css' }); document.head.appendChild(st); }
    if (!cfg.enabled) { st.textContent = ''; return; }
    const sel = (cfg.selector || '').split('\n').map((s) => s.trim()).filter(Boolean).join(',');
    if (!sel) { st.textContent = ''; return; }
    st.textContent = `
      ${sel}{width:${cfg.width}px!important;max-width:${cfg.width}px!important;${collapsed ? 'height:28px!important;overflow:hidden!important;' : `height:${cfg.height}px!important;max-height:${cfg.height}px!important;`}opacity:${cfg.opacity}!important;font-size:${cfg.font}px!important;transition:opacity .2s}
      ${sel}:hover{opacity:1!important}
      ${sel} *{font-size:${cfg.font}px!important}`;
  }
  defineAddon({
    id: 'minichat', name: 'MiniChat', icon: 'minichat', color: ['#5b8cff', '#3a5bd9'],
    desc: 'Zmniejsza okno czatu według Twoich preferencji. Po najechaniu myszką czat wraca do pełnej widoczności.',
    defaults: { width: 320, height: 160, opacity: 0.75, font: 11, key: '', selector: '.chat-tpl\n.chat-window\n#chat' },
    keys: [{ key: 'key', label: 'zwiń/rozwiń czat', fn: () => { collapsed = !collapsed; apply(); } }],
    settings: [
      { key: 'width', type: 'range', label: 'Szerokość (px)', min: 180, max: 700, step: 10, live: () => apply() },
      { key: 'height', type: 'range', label: 'Wysokość (px)', min: 60, max: 600, step: 10, live: () => apply() },
      { key: 'opacity', type: 'range', label: 'Przezroczystość', min: 0.2, max: 1, step: 0.05, live: () => apply() },
      { key: 'font', type: 'range', label: 'Czcionka (px)', min: 8, max: 16, step: 1, live: () => apply() },
      { key: 'key', type: 'key', label: 'Klawisz: zwiń/rozwiń' },
      { key: 'selector', type: 'textarea', label: 'Selektor okna czatu', hint: 'Jeśli czat się nie zmienia: F12 → wskaż okno czatu → wpisz jego klasę (np. .chat-tpl).' },
    ],
    init(c) { cfg = c; apply(); },
    onToggle() { apply(); },
    onChange() { apply(); },
  });
})();
