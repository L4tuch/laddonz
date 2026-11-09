/* ───────── Hey WakeUP! ─────────
 * Kolory i czcionki powiadomień tekstowych (powiadomienia panelu + wskazane elementy gry).
 */
(() => {
  let cfg;
  const FONTS = [['Arial,"Segoe UI",sans-serif', 'Jak w grze (Arial)'], ['"Segoe UI",system-ui,sans-serif', 'Systemowa'], ['Georgia,serif', 'Georgia (szeryfowa)'], ['"Trebuchet MS",sans-serif', 'Trebuchet'], ['Verdana,sans-serif', 'Verdana'], ['Consolas,monospace', 'Consolas (mono)'], ['"Comic Sans MS",cursive', 'Comic Sans'], ['Impact,sans-serif', 'Impact']];

  /** Gdy dodatek jest wyłączony — powiadomienia wyglądają jak komunikaty gry (żółty tekst na dole). */
  function apply() {
    const R = document.documentElement.style;
    const on = cfg && cfg.enabled;
    const set = (k, v) => (on ? R.setProperty(k, v) : R.removeProperty(k));
    set('--mp-toast-fg', cfg.fg);
    set('--mp-toast-warn', cfg.warn);
    set('--mp-toast-bad', cfg.bad);
    set('--mp-toast-bg', hexA(cfg.bg, cfg.bgAlpha));
    set('--mp-toast-pad', cfg.bgAlpha > 0 || cfg.frame ? '5px 12px' : '1px 8px');
    set('--mp-toast-border', cfg.frame ? `1px solid ${cfg.glow}` : '0 solid transparent');
    set('--mp-toast-font', cfg.font);
    set('--mp-toast-size', cfg.size + 'px');
    set('--mp-toast-weight', cfg.bold ? '700' : '400');
    set('--mp-toast-shadow', cfg.shadow ? `0 0 8px ${cfg.glow},0 0 3px #000,1px 1px 1px #000` : '0 0 3px #000,1px 1px 1px #000,-1px -1px 1px #000');
    set('--mp-toast-bottom', cfg.bottom + 'px');
    let st = document.getElementById('mp-wakeup-css');
    if (!st) { st = el('style', { id: 'mp-wakeup-css' }); document.head.appendChild(st); }
    const sel = (cfg.gameSelectors || '').split('\n').map((s) => s.trim()).filter(Boolean).join(',');
    const box = cfg.bgAlpha > 0 || cfg.frame;
    st.textContent = on && sel ? `${sel}{color:${cfg.fg}!important;font-family:${cfg.font}!important;font-size:${cfg.size}px!important;font-weight:${cfg.bold ? 700 : 400}!important;${cfg.shadow ? `text-shadow:0 0 8px ${cfg.glow},0 0 3px #000,1px 1px 1px #000!important;` : ''}${box ? `background:${hexA(cfg.bg, cfg.bgAlpha)}!important;padding:4px 12px!important;border-radius:8px!important;display:inline-block!important;${cfg.frame ? `border:1px solid ${cfg.glow}!important;` : ''}` : ''}}` : '';
  }
  function hexA(hex, a) {
    const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex || '');
    if (!m) return hex;
    return `rgba(${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)},${a})`;
  }

  defineAddon({
    id: 'wakeup', name: 'Hey WakeUP!', icon: 'wakeup', color: ['#ffb547', '#ff7a45'],
    desc: 'Powiadomienia panelu to zwykłe komunikaty gry (żółty tekst na dole). Po włączeniu tego dodatku zmieniasz wygląd WSZYSTKICH komunikatów — panelu i gry: kolor, czcionkę, rozmiar, tło i ramkę.',
    defaults: { enabled: false, fg: '#ffe066', warn: '#ffb547', bad: '#ff6b6b', bg: '#10111c', bgAlpha: 0, frame: false, glow: '#ffb547', font: 'Arial,"Segoe UI",sans-serif', size: 14, bold: true, shadow: false, bottom: 140, styleGame: false,
      gameSelectors: '.big-messages .message' },
    settings: [
      { group: 'Kolory', key: 'fg', type: 'color', label: 'Kolor tekstu', live: () => apply() },
      { group: 'Kolory', key: 'glow', type: 'color', label: 'Ramka / poświata', live: () => apply() },
      { group: 'Tekst', key: 'font', type: 'select', label: 'Czcionka', options: FONTS },
      { group: 'Tekst', key: 'size', type: 'range', label: 'Rozmiar (px)', min: 10, max: 32, live: () => apply() },
      { group: 'Tekst', key: 'bold', type: 'bool', label: 'Pogrubienie' },
      { group: 'Tekst', key: 'shadow', type: 'bool', label: 'Kolorowa poświata' },
      { group: 'Tło', key: 'bg', type: 'color', label: 'Kolor tła', live: () => apply() },
      { group: 'Tło', key: 'bgAlpha', type: 'range', label: 'Krycie tła (0 = bez tła)', min: 0, max: 1, step: 0.05, live: () => apply() },
      { group: 'Tło', key: 'frame', type: 'bool', label: 'Ramka' },
      { group: 'Zaawansowane', key: 'gameSelectors', type: 'textarea', label: 'Selektor komunikatów gry', hint: 'Zostaw domyślny (.big-messages .message). Zmień tylko, jeśli gra zmieni wygląd komunikatów.' },
    ],
    render(box) {
      box.appendChild(el('div', { class: 'mp-btns' },
        el('button', { class: 'mp-btn pri', onclick: () => toast('Tak wygląda powiadomienie', 'info') }, 'Podgląd'),
        el('button', { class: 'mp-btn', onclick: () => toast('Bratan: zablokowano atak', 'bad') }, 'Drugi przykład')));
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
 * Zmienia tylko wysokość okna czatu.
 */
(() => {
  let cfg, found = '';
  function detect() {
    $$('[data-mp-chat]').forEach((n) => n.removeAttribute('data-mp-chat'));
    const sel = (cfg.selector || '').split('\n').map((s) => s.trim()).filter(Boolean).join(',');
    let target = null;
    if (sel) { try { target = $$(sel).find(isVisible) || null; } catch {} }
    if (target) {
      target.setAttribute('data-mp-chat', '');
      found = (typeof target.className === 'string' ? '.' + target.className.trim().split(/\s+/).join('.') : target.tagName.toLowerCase());
    } else found = '';
    return target;
  }
  function apply() {
    let st = document.getElementById('mp-minichat-css');
    if (!st) { st = el('style', { id: 'mp-minichat-css' }); document.head.appendChild(st); }
    if (!cfg.enabled || !detect()) { st.textContent = ''; return; }
    st.textContent = `[data-mp-chat]{height:${cfg.height}px!important;max-height:${cfg.height}px!important;min-height:0!important}`;
  }
  defineAddon({
    id: 'minichat', name: 'MiniChat', icon: 'minichat', color: ['#5b8cff', '#3a5bd9'],
    desc: 'Ustawia wysokość okna czatu.',
    defaults: { height: 160, selector: '.new-chat-window' },
    settings: [
      { key: 'height', type: 'range', label: 'Wysokość czatu (px)', min: 60, max: 700, step: 10, live: () => apply() },
      { key: 'selector', type: 'text', label: 'Selektor okna czatu', hint: 'Domyślnie .new-chat-window — zmień tylko, jeśli gra zmieni wygląd czatu.' },
    ],
    render(box) {
      box.appendChild(el('div', { class: 'mp-card' }, el('h3', null, 'Okno czatu'),
        el('div', { class: found ? 'mp-mono mp-okc' : 'mp-warnc' }, found || 'Nie znaleziono — otwórz czat w grze i kliknij „Wykryj ponownie".'),
        el('div', { class: 'mp-btns' }, el('button', { class: 'mp-btn', onclick: () => { apply(); ui.renderMain(); } }, 'Wykryj ponownie'))));
    },
    init(c) {
      cfg = c;
      if (cfg.selector === '.chat-tpl\n.chat-window\n#chat' || cfg.selector === '') cfg.selector = '.new-chat-window';
      apply();
      setInterval(() => { if (cfg.enabled && !document.querySelector('[data-mp-chat]')) apply(); }, 2000);
    },
    onToggle() { apply(); },
    onChange() { apply(); },
  });
})();
