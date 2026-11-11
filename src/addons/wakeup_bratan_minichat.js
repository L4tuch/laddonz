/* ───────── Hey WakeUP! ─────────
 * Style komunikatów gry (duży żółty napis na środku ekranu — .big-messages .message).
 * Panel też pokazuje swoje powiadomienia jako komunikaty gry, więc styl działa na wszystko.
 * Do wyboru gotowe style z podglądem albo „Własny" (kolory, czcionka, rozmiar, tło, ramka).
 */
(() => {
  let cfg;
  const FONTS = [['Arial,"Segoe UI",sans-serif', 'Arial (jak w grze)'], ['"Segoe UI",system-ui,sans-serif', 'Systemowa'], ['Georgia,serif', 'Georgia (szeryfowa)'], ['"Trebuchet MS",sans-serif', 'Trebuchet'], ['Verdana,sans-serif', 'Verdana'], ['Consolas,monospace', 'Consolas (mono)'], ['Impact,sans-serif', 'Impact']];
  const OUTLINE = '2px 0 0 #000,-2px 0 0 #000,0 2px 0 #000,0 -2px 0 #000,1px 1px 0 #000,-1px -1px 0 #000,1px -1px 0 #000,-1px 1px 0 #000';

  // Gotowe style. „gra" = brak zmian (oryginalny wygląd).
  const PRESETS = {
    gra:      { name: 'Domyślny (gra)', css: null },
    mini:     { name: 'Minimalny', css: 'color:#fff!important;font:600 16px/1.3 "Segoe UI",system-ui,sans-serif!important;text-shadow:0 1px 3px rgba(0,0,0,.9)!important;letter-spacing:.2px!important' },
    szklo:    { name: 'Szkło', css: 'color:#fff!important;font:600 16px/1.3 "Segoe UI",system-ui,sans-serif!important;text-shadow:none!important;background:rgba(16,17,28,.6)!important;-webkit-backdrop-filter:blur(10px)!important;backdrop-filter:blur(10px)!important;border:1px solid rgba(255,255,255,.18)!important;border-radius:14px!important;padding:8px 18px!important;display:table!important;margin:4px auto!important;box-shadow:0 8px 24px rgba(0,0,0,.35)!important' },
    neon:     { name: 'Neon', css: 'color:#e9fbff!important;font:700 20px/1.3 "Segoe UI",system-ui,sans-serif!important;text-shadow:0 0 6px #22d3ee,0 0 14px #22d3ee,0 0 28px #0891b2!important;letter-spacing:.5px!important' },
    alarm:    { name: 'Alarm', css: 'color:#fff!important;font:800 22px/1.3 Arial,sans-serif!important;text-shadow:0 1px 2px #000!important;background:linear-gradient(90deg,rgba(185,28,28,.0),rgba(185,28,28,.85) 15%,rgba(185,28,28,.85) 85%,rgba(185,28,28,0))!important;padding:6px 60px!important;display:table!important;margin:4px auto!important;text-transform:uppercase!important;letter-spacing:1px!important' },
    pasek:    { name: 'Ciemny pasek', css: 'color:#ffd84a!important;font:700 17px/1.3 Arial,sans-serif!important;text-shadow:none!important;background:rgba(0,0,0,.72)!important;padding:6px 40px!important;display:table!important;margin:4px auto!important;border-top:1px solid rgba(255,216,74,.5)!important;border-bottom:1px solid rgba(255,216,74,.5)!important' },
    pergamin: { name: 'Pergamin', css: 'color:#3b2410!important;font:700 18px/1.3 Georgia,serif!important;text-shadow:none!important;background:linear-gradient(#f3e3b8,#e2c88c)!important;border:2px solid #8a6230!important;border-radius:6px!important;padding:6px 18px!important;display:table!important;margin:4px auto!important;box-shadow:0 4px 14px rgba(0,0,0,.45)!important' },
    duzy:     { name: 'Bardzo duży', css: `color:#ffe500!important;font:900 34px/1.25 Arial,sans-serif!important;text-shadow:${OUTLINE},0 0 12px rgba(0,0,0,.6)!important` },
    zloto:    { name: 'Złoty', css: 'font:900 24px/1.3 Georgia,serif!important;background:linear-gradient(#fff7cf,#f2c14e 50%,#a86b12)!important;-webkit-background-clip:text!important;background-clip:text!important;color:transparent!important;text-shadow:none!important;filter:drop-shadow(0 2px 0 #3a2200) drop-shadow(0 0 6px rgba(255,190,60,.55))!important;letter-spacing:.5px!important' },
    ogien:    { name: 'Ogień', css: 'font:900 23px/1.3 Arial,sans-serif!important;background:linear-gradient(#fff3a0,#ffb13b 45%,#e8331b)!important;-webkit-background-clip:text!important;background-clip:text!important;color:transparent!important;text-shadow:none!important;filter:drop-shadow(0 1px 0 #3a0800) drop-shadow(0 0 8px rgba(255,90,20,.75))!important' },
    krew:     { name: 'Krwawy', css: `color:#ff3b3b!important;font:900 22px/1.3 Georgia,serif!important;text-shadow:${OUTLINE},0 0 12px rgba(200,0,0,.8)!important;letter-spacing:.6px!important` },
    lod:      { name: 'Lodowy', css: 'color:#e9fbff!important;font:700 20px/1.3 Georgia,serif!important;text-shadow:0 0 4px #7fdcff,0 0 12px #2aa8e0,0 2px 1px #0a3550!important;letter-spacing:1px!important' },
    magia:    { name: 'Magiczny', css: 'color:#fff!important;font:700 17px/1.3 "Segoe UI",sans-serif!important;text-shadow:0 0 6px #d18bff!important;background:linear-gradient(90deg,rgba(90,30,150,0),rgba(90,30,150,.85) 18%,rgba(140,60,220,.85) 50%,rgba(90,30,150,.85) 82%,rgba(90,30,150,0))!important;padding:6px 50px!important;display:table!important;margin:4px auto!important' },
    okno:     { name: 'Okno gry', css: 'color:#f6e7b8!important;font:700 16px/1.3 Arial,sans-serif!important;text-shadow:0 1px 1px #000!important;background:linear-gradient(rgba(38,30,20,.94),rgba(20,15,10,.94))!important;border:1px solid #b08b4a!important;box-shadow:inset 0 0 0 1px #3d2c15,0 4px 12px rgba(0,0,0,.6)!important;border-radius:4px!important;padding:6px 20px!important;display:table!important;margin:4px auto!important;' },
    las:      { name: 'Leśny', css: 'color:#f1e8c6!important;font:700 17px/1.3 Georgia,serif!important;text-shadow:0 1px 1px #000!important;background:linear-gradient(#36572a,#1d3415)!important;border:2px solid #8a6a3a!important;border-radius:6px!important;box-shadow:inset 0 1px 0 rgba(255,255,255,.15),0 4px 10px rgba(0,0,0,.5)!important;padding:6px 20px!important;display:table!important;margin:4px auto!important;' },
    kamien:   { name: 'Kamienna tablica', css: 'color:#d9d9d9!important;font:700 17px/1.3 Georgia,serif!important;text-shadow:0 -1px 0 #000,0 1px 0 rgba(255,255,255,.25)!important;background:linear-gradient(#6b6b6b,#4a4a4a)!important;border:2px solid #2c2c2c!important;border-radius:3px!important;box-shadow:inset 0 0 8px rgba(0,0,0,.6),0 3px 8px rgba(0,0,0,.5)!important;letter-spacing:.5px!important;padding:6px 20px!important;display:table!important;margin:4px auto!important;' },
    komiks:   { name: 'Komiks', css: 'color:#111!important;font:900 18px/1.2 "Comic Sans MS","Trebuchet MS",sans-serif!important;text-shadow:none!important;background:#fff!important;border:3px solid #111!important;border-radius:18px!important;box-shadow:4px 4px 0 #111!important;padding:6px 20px!important;display:table!important;margin:4px auto!important;' },
    terminal: { name: 'Terminal', css: 'color:#5cff7a!important;font:700 16px/1.3 Consolas,monospace!important;text-shadow:0 0 6px rgba(92,255,122,.7)!important;background:rgba(0,10,0,.85)!important;border:1px solid #1f6b2c!important;border-radius:3px!important;padding:6px 20px!important;display:table!important;margin:4px auto!important;' },
    elegancki:{ name: 'Elegancki', css: 'color:#fff!important;font:400 20px/1.3 Georgia,serif!important;font-style:italic!important;text-shadow:0 1px 3px rgba(0,0,0,.9)!important;border-top:1px solid rgba(232,190,100,.8)!important;border-bottom:1px solid rgba(232,190,100,.8)!important;padding:4px 30px!important;display:table!important;margin:4px auto!important;letter-spacing:1px!important' },
    wlasny:   { name: 'Własny', css: null },
  };

  function customCss() {
    const box = cfg.bgAlpha > 0 || cfg.frame;
    return `color:${cfg.fg}!important;font-family:${cfg.font}!important;font-size:${cfg.size}px!important;font-weight:${cfg.bold ? 700 : 400}!important;` +
      `text-shadow:${cfg.outline ? OUTLINE : 'none'}${cfg.shadow ? `,0 0 10px ${cfg.glow},0 0 20px ${cfg.glow}` : ''}!important;` +
      (box ? `background:${hexA(cfg.bg, cfg.bgAlpha)}!important;padding:5px 16px!important;border-radius:${cfg.radius}px!important;display:table!important;margin:4px auto!important;${cfg.frame ? `border:1px solid ${cfg.glow}!important;` : ''}` : '');
  }
  function cssFor(id) { return id === 'wlasny' ? customCss() : (PRESETS[id] && PRESETS[id].css); }

  function apply() {
    let st = document.getElementById('mp-wakeup-css');
    if (!st) { st = el('style', { id: 'mp-wakeup-css' }); document.head.appendChild(st); }
    const sel = (cfg.gameSelectors || '').split('\n').map((s) => s.trim()).filter(Boolean).join(',');
    const css = cfg.enabled && cssFor(cfg.style);
    // podglądy w panelu zawsze aktualne
    const prev = Object.keys(PRESETS).map((k) => { const c = cssFor(k); return c ? `.mp-wk-prev.wk-${k} .mp-wk-msg{${c}}` : ''; }).join('\n');
    st.textContent = (css && sel ? `${sel}{${css}}\n` : '') + prev;
  }
  function hexA(hex, a) {
    const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex || '');
    if (!m) return hex;
    return `rgba(${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)},${a})`;
  }

  defineAddon({
    id: 'wakeup', name: 'Hey WakeUP!', icon: 'wakeup', color: ['#ffb547', '#ff7a45'], renderFirst: true,
    desc: 'Zmienia wygląd komunikatów gry (duży żółty napis na środku ekranu) — także tych wysyłanych przez panel. Wybierz gotowy styl albo ułóż własny.',
    defaults: { enabled: false, style: 'mini', fg: '#ffe500', glow: '#ffb547', bg: '#10111c', bgAlpha: 0, frame: false, radius: 10, font: 'Arial,"Segoe UI",sans-serif', size: 24, bold: true, outline: true, shadow: false, gameSelectors: '.big-messages .message' },
    settings: [
      { group: 'Własny styl', show: (c) => c.style === 'wlasny', key: 'fg', type: 'color', label: 'Kolor tekstu', live: () => apply() },
      { group: 'Własny styl', show: (c) => c.style === 'wlasny', key: 'font', type: 'select', label: 'Czcionka', options: FONTS },
      { group: 'Własny styl', show: (c) => c.style === 'wlasny', key: 'size', type: 'range', label: 'Rozmiar (px)', min: 10, max: 40, live: () => apply() },
      { group: 'Własny styl', show: (c) => c.style === 'wlasny', key: 'bold', type: 'bool', label: 'Pogrubienie' },
      { group: 'Własny styl', show: (c) => c.style === 'wlasny', key: 'outline', type: 'bool', label: 'Czarny obrys (jak w grze)' },
      { group: 'Własny styl', show: (c) => c.style === 'wlasny', key: 'shadow', type: 'bool', label: 'Kolorowa poświata' },
      { group: 'Własny styl', show: (c) => c.style === 'wlasny', key: 'glow', type: 'color', label: 'Kolor poświaty / ramki', live: () => apply() },
      { group: 'Własny styl', show: (c) => c.style === 'wlasny', key: 'bg', type: 'color', label: 'Kolor tła', live: () => apply() },
      { group: 'Własny styl', show: (c) => c.style === 'wlasny', key: 'bgAlpha', type: 'range', label: 'Krycie tła (0 = bez tła)', min: 0, max: 1, step: 0.05, live: () => apply() },
      { group: 'Własny styl', show: (c) => c.style === 'wlasny', key: 'frame', type: 'bool', label: 'Ramka' },
      { group: 'Własny styl', show: (c) => c.style === 'wlasny', key: 'radius', type: 'range', label: 'Zaokrąglenie (px)', min: 0, max: 24, live: () => apply() },
      { adv: true, group: 'Zaawansowane', key: 'gameSelectors', type: 'text', label: 'Selektor komunikatów gry', hint: 'Domyślnie .big-messages .message' },
    ],
    render(box, c, rerender) {
      const grid = el('div', { class: 'mp-wk-grid' });
      for (const [k, p] of Object.entries(PRESETS)) {
        const card = el('div', { class: 'mp-wk-prev wk-' + k + (c.style === k ? ' on' : ''), onclick: () => { c.style = k; config.save(); apply(); rerender(); } },
          el('div', { class: 'mp-wk-stage' }, el('span', { class: 'mp-wk-msg' + (k === 'gra' ? ' gra' : '') }, k === 'wlasny' ? 'Twój styl' : 'Komunikat')),
          el('div', { class: 'mp-wk-name' }, p.name));
        grid.appendChild(card);
      }
      box.prepend(el('div', { class: 'mp-card' }, el('h3', null, 'Styl komunikatów'), grid,
        el('div', { class: 'mp-btns' }, el('button', { class: 'mp-btn pri', onclick: () => toast('Tak wygląda komunikat — Hey WakeUP!') }, 'Pokaż w grze'))));
      if (!c.enabled) box.prepend(MP.note('info', 'Dodatek jest wyłączony — komunikaty mają wygląd z gry. Włącz go, żeby zastosować wybrany styl.'));
    },
    init(c) { cfg = c; if (!c._v13) { c._v13 = true; c.style = c.style || 'mini'; c.size = 24; c.fg = '#ffe500'; config.save(); } apply(); },
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
    defaults: { enabled: false, clan: true, friends: true, allies: true, nicks: [] },
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
      { adv: true, key: 'selector', type: 'text', label: 'Selektor okna czatu', hint: 'Domyślnie .new-chat-window — zmień tylko, jeśli gra zmieni wygląd czatu.' },
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
