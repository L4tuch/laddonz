/* ───────── Slayer (id: napad — zostawione dla zgodności ustawień) ─────────
 * Wszystko działa tylko przy WŁĄCZONYM dodatku.
 * Klawisz   → namierza najbliższego gracza i atakuje go w chwili, gdy będzie w zasięgu. Ponowne
 *             naciśnięcie przy namierzonym celu = anulowanie (bez zmiany celu). Postać nie podchodzi sama.
 * „Atakuj każdego w pobliżu" → osobny przełącznik (też pod klawisz); gdy włączony, na ekranie jest małe
 *             okienko z zakresem poziomów „od – do" i atakowany jest każdy w zasięgu z tego zakresu.
 * Menu gracza (prawy klik) → „Dobij": namierza tego gracza, atak gdy będzie w zasięgu.
 * Kogo NIE atakować (klan, znajomi…) — decyduje Bratan; Slayer takich graczy po prostu pomija.
 */
(() => {
  const RANGE = 2;            // zasięg ataku w kratkach (liczy się większa z odległości w poziomie/pionie)
  const RETRY_MS = 600;       // jak często ponawiać atak na namierzony cel w zasięgu
  const REFUSE_MS = 2500;     // po odmowie („nie zgadza się na walkę") — krótka przerwa i próbujemy znowu
  const S = { last: 0, protectedUntil: {}, tried: {}, refused: {}, lock: null, timer: null, said: {} };
  /** Komunikat o danym graczu najwyżej raz na `ms` (żeby nie zasypać ekranu przy ponawianiu). */
  const say = (key, msg, ms = 15000, type = 'warn') => { const t = now(); if (S.said[key] > t) return; S.said[key] = t + ms; toast(msg, type); };
  /** Tekst odpowiedzi serwera (ostrzeżenie/komunikat), jeśli jest. */
  function respText(d) {
    if (!d) return '';
    const out = [];
    const walk = (v, depth) => {
      if (depth > 3 || v == null) return;
      if (typeof v === 'string') { if (/[a-ząćęłńóśźż]{3}/i.test(v) && v.length < 200 && v !== 'ok') out.push(v); return; }
      if (Array.isArray(v)) v.forEach((x) => walk(x, depth + 1));
      else if (typeof v === 'object') for (const k of ['w', 'alert', 'msg', 'm', 'e', 'message', 'text', 'info']) if (k in v) walk(v[k], depth + 1);
    };
    walk(d, 0);
    return out.join(' ').replace(/<[^>]+>/g, '').trim();
  }
  let cfg;
  /** Odświeżenie widoku dodatku w panelu (gdy jest otwarty). */
  let rr = () => {};

  const dist = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
  const task = (id) => net.build('attackPlayer', { id }).task;
  /** Czy atak na tego gracza przeszedłby przez bezpieczniki (Bratan) — sprawdzamy po cichu. */
  const allowed = (p) => { const t = task(p.id); return !!t && !net.checkGuards(t); };
  const inLvl = (p) => { const l = Number(p.lvl); if (!Number.isFinite(l) || l <= 0) return true; const lo = Number(cfg.lvlMin) || 0, hi = Number(cfg.lvlMax) || 999; return l >= Math.min(lo, hi) && l <= Math.max(lo, hi); };

  async function attack(p) {
    const t = now();
    if (!p || game.inBattle()) return false;
    if (t - S.last < RETRY_MS) return false;
    if (S.protectedUntil[p.id] > t) return false;           // nie marnujemy ataku na ochronę
    S.last = t;
    S.tried[p.id] = t;
    const r = await net.send('attackPlayer', { id: p.id }, {
      src: 'Slayer',
      onResponse: (data) => {
        // odmowa serwera (np. żółta mapa: „Przeciwnik nie zgadza się na walkę") — nie ponawiamy w kółko i MÓWIMY o tym
        // komunikat pokazuje już sama gra — Slayer nie dubluje go własnym, tylko zapamiętuje, żeby nie ponawiać w kółko
        let txt = ''; try { txt = JSON.stringify(data || {}); } catch {}
        if (/nie zgadza|nie mo[żz]esz|nie mo[żz]na|odmówi|odmowa/i.test(txt)) { S.refused[p.id] = now() + REFUSE_MS; return; }
        const sec = parseProtection(data);
        if (sec) { S.protectedUntil[p.id] = now() + sec * 1000; return; }
      },
    });
    return r.ok;
  }

  /* ── namierzanie (klawisz / menu / lista) ── */
  function lockOn(p) {
    if (!p) return;
    if (!allowed(p)) { toast(`Slayer: ${p.nick} jest chroniony przez Bratana`); return; }
    S.lock = { id: p.id, nick: p.nick, t: now() };
    cfg.target = { id: p.id, nick: p.nick };          // zapamiętany na stałe (także po odświeżeniu gry)
    config.save();
    mark.set(p.id);
    toast(`Slayer: dobijam ${p.nick}`);
    rr();
    ensureLoop();
    tick();
  }
  function unlock(msg) {
    if (!S.lock) return;
    if (msg) toast(msg);
    S.lock = null;
    cfg.target = null;
    config.save();
    mark.clear();
    ensureLoop();
    rr();
  }
  function keyNearest() {
    if (!cfg.enabled) return;
    // ponowne naciśnięcie przy namierzonym celu = anulowanie (żeby zmienić cel: anuluj i naciśnij jeszcze raz)
    if (S.lock) { unlock(`Slayer: przerwano dobijanie ${S.lock.nick}`); return; }
    const h = game.hero(); if (!h) return;
    const list = game.others().filter(allowed).sort((a, b) => dist(h, a) - dist(h, b));
    if (!list.length) { toast('Slayer: brak graczy na mapie'); return; }
    lockOn(list[0]);
  }

  /* ── „Atakuj każdego w pobliżu" — osobny przełącznik z małym okienkiem zakresu poziomów ── */
  function setAll(on, quiet) {
    cfg.allMode = !!on; config.save();
    allWin();
    ensureLoop();
    if (!quiet) toast(on ? `Slayer: atak na każdego w pobliżu (poz. ${Number(cfg.lvlMin) || 0}–${Number(cfg.lvlMax) || 500})` : 'Slayer: atak na każdego w pobliżu wyłączony', on ? 'ok' : 'info');
    rr();
  }
  function allWin() {
    let w = document.getElementById('mp-dbw');
    const show = cfg && cfg.enabled && cfg.allMode;
    if (!show) { if (w) w.remove(); return; }
    if (w) return;
    const num = (key, def) => el('input', { type: 'number', min: 0, max: 500, value: cfg[key] ?? def,
      onkeydown: (e) => e.stopPropagation(), onkeyup: (e) => e.stopPropagation(),
      oninput: (e) => { const v = Math.max(0, Math.min(500, parseInt(e.target.value, 10) || 0)); cfg[key] = v; config.save(); } });
    const head = el('div', { class: 'mp-dbw-h' }, el('span', null, 'Slayer - Zakres poziomów'),
      el('button', { title: 'Wyłącz', onclick: () => setAll(false) }, '×'));
    w = el('div', { id: 'mp-dbw', class: 'mp-dbw' }, head,
      el('div', { class: 'mp-dbw-b' }, el('span', null, 'Poziom od'), num('lvlMin', 0), el('span', null, 'do'), num('lvlMax', 500)));
    const pos = cfg.allPos;
    if (pos) { w.style.left = pos.x + 'px'; w.style.top = pos.y + 'px'; }
    document.body.appendChild(w);
    // przesuwanie za nagłówek
    head.addEventListener('pointerdown', (e) => {
      if (e.target.tagName === 'BUTTON') return;
      e.preventDefault();
      const r = w.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top;
      const mv = (ev) => { w.style.left = clamp(ev.clientX - dx, 0, innerWidth - r.width) + 'px'; w.style.top = clamp(ev.clientY - dy, 0, innerHeight - r.height) + 'px'; };
      const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); cfg.allPos = { x: parseInt(w.style.left, 10) || 0, y: parseInt(w.style.top, 10) || 0 }; config.save(); };
      addEventListener('pointermove', mv); addEventListener('pointerup', up);
    });
  }

  /*
   * Czerwona strzałka przy postaci, wskazująca kierunek do namierzonego celu (jak strzałki przejść w grze).
   * Pozycja postaci na ekranie: kamera gry trzyma postać na środku planszy, a przy brzegach mapy się zatrzymuje.
   */
  // strzałka jak strzałki przejść z gry: rysowana „na skos" (w prawo-w dół), jasna kremowa obwódka, wnętrze z połyskiem — tylko czerwone
  const ARROW = '<svg viewBox="0 0 20 20" width="26" height="26"><defs><linearGradient id="mpDbA" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff8a7c"/><stop offset=".45" stop-color="#d9261e"/><stop offset="1" stop-color="#7a0b0b"/></linearGradient><linearGradient id="mpDbB" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fffaf0"/><stop offset=".6" stop-color="#f1e4c6"/><stop offset="1" stop-color="#f0b98f"/></linearGradient></defs>'
    + '<path d="M17 4.5V17H4.5l4.2-4.2L2.8 6.9l4.1-4.1 5.9 5.9z" fill="url(#mpDbA)" stroke="url(#mpDbB)" stroke-width="1.5" stroke-linejoin="round"/></svg>';
  function gameCanvas() {
    const c = document.getElementById('GAME_CANVAS');
    if (c && c.getBoundingClientRect().width) return c;
    let best = null, area = 0;
    for (const x of document.querySelectorAll('canvas')) { if (x.closest('.mp-glass')) continue; const r = x.getBoundingClientRect(); if (r.width * r.height > area) { area = r.width * r.height; best = x; } }
    return area > 200 * 200 ? best : null;
  }
  function heroScreen() {
    const cv = gameCanvas();
    const r = cv ? cv.getBoundingClientRect() : { left: 0, top: 0, width: innerWidth, height: innerHeight };
    const E = W.Engine; const hd = E && E.hero;
    const hx = Number(hd && hd.rx != null ? hd.rx : hd && hd.d && hd.d.x), hy = Number(hd && hd.ry != null ? hd.ry : hd && hd.d && hd.d.y);
    if (!Number.isFinite(hx) || !Number.isFinite(hy)) return null;
    const md = (E.map && E.map.d) || {};
    const T = 32 * (cv && cv.width ? r.width / cv.width : 1);
    const ax = (mw, vw, p) => { if (!(mw > 0)) return vw / 2; const full = mw * T; if (full <= vw) return (vw - full) / 2 + p; return p - Math.max(0, Math.min(full - vw, p - vw / 2)); };
    return { x: r.left + ax(Number(md.x), r.width, (hx + 0.5) * T), y: r.top + ax(Number(md.y), r.height, (hy + 0.5) * T) - T * 0.4, r };
  }
  let arrowTimer = null;
  function arrowTick() {
    let a = document.getElementById('mp-dbarrow');
    const p = cfg && cfg.enabled && S.lock && lockedPlayer();
    const h = p && game.hero();
    const pos = h && heroScreen();
    if (!p || !h || !pos || game.inBattle() || dist(h, p) <= RANGE) { if (a) a.style.display = 'none'; return; }
    if (!a) { a = el('div', { id: 'mp-dbarrow', class: 'mp-dbarrow' }); a.innerHTML = ARROW; document.body.appendChild(a); }
    // 8 kierunków, jak strzałki w grze
    const ang = Math.round(Math.atan2(p.y - h.y, p.x - h.x) / (Math.PI / 4)) * (Math.PI / 4);
    const R0 = 40;
    a.style.display = '';
    a.style.left = Math.round(pos.x + Math.cos(ang) * R0 - 13) + 'px';
    a.style.top = Math.round(pos.y + Math.sin(ang) * R0 - 13) + 'px';
    a.style.transform = `rotate(${ang - Math.PI / 4}rad)`;   // grafika wskazuje w prawo-w dół (45°)
    a.title = `Cel: ${p.nick} (${dist(h, p)} kratek)`;
  }
  function ensureArrow() {
    const need = !!(cfg && cfg.enabled && S.lock);
    if (need && !arrowTimer) arrowTimer = setInterval(arrowTick, 120);
    if (!need && arrowTimer) { clearInterval(arrowTimer); arrowTimer = null; }
    arrowTick();
  }

  /* ── pętla: namierzony cel + tryb włączony ── */
  function ensureLoop() {
    const need = !!(cfg && cfg.enabled) && (!!S.lock || !!cfg.allMode);
    ensureArrow();
    if (need && !S.timer) S.timer = setInterval(tick, 150);
    if (!need && S.timer) { clearInterval(S.timer); S.timer = null; }
  }
  /** Namierzony gracz na mapie: po id, a gdy wrócił z nowym id — po nicku. */
  function lockedPlayer() {
    if (!S.lock) return null;
    let p = game.otherById(S.lock.id);
    if (!p) { p = game.otherByNick(S.lock.nick); if (p) { S.lock.id = p.id; cfg.target = { id: p.id, nick: p.nick }; config.save(); } }
    return p;
  }
  /** Gracz, który dopiero pojawił się na mapie (np. po teleporcie) — od razu bez przerw po wcześniejszej odmowie. */
  let seen = new Set();
  function freshArrivals() {
    const cur = new Set(game.others().map((p) => p.id));
    for (const id of cur) if (!seen.has(id)) { delete S.refused[id]; delete S.tried[id]; }
    seen = cur;
  }
  function tick() {
    if (!cfg || !cfg.enabled) return;
    if (!game.ready()) return;
    freshArrivals();
    const h = game.hero(); if (!h) return;
    if (game.inBattle()) return;
    // 1) namierzony cel — pamiętany, dopóki sam go nie zmienisz/przerwiesz; atak, gdy będzie w zasięgu
    if (S.lock) {
      const p = lockedPlayer();
      if (!p && !cfg.remember) { unlock(`Slayer: ${S.lock.nick} zniknął z mapy`); return; }
      if (!!p !== S.wasOn) { S.wasOn = !!p; rr(); }   // „na mapie" / „poza mapą" w panelu
      if (p) mark.ensure(p.id);   // gracz wrócił (nowy obiekt w grze) — przywróć podświetlenie
      if (p && dist(h, p) <= RANGE && !allowed(p)) { say('br' + p.id, `Slayer: ${p.nick} jest chroniony przez Bratana — nie zaatakuję`, 60000); return; }
      if (p && dist(h, p) <= RANGE && !(S.refused[p.id] > now()) && !(S.protectedUntil[p.id] > now())) { attack(p); return; }
      // cel daleko albo poza mapą — w międzyczasie (gdy włączone „każdy w pobliżu") atakuje innych w zasięgu
    }
    // 2) „Atakuj każdego w pobliżu" włączone → każdy w zasięgu z zakresu poziomów
    if (!cfg.allMode) return;
    const t = now();
    for (const p of game.others()) if (dist(h, p) <= RANGE && inLvl(p) && !allowed(p)) say('br' + p.id, `Slayer: pomijam ${p.nick} — chroniony przez Bratana`, 120000, 'info');
    const c = game.others()
      .filter((p) => dist(h, p) <= RANGE && inLvl(p) && allowed(p) && !(S.tried[p.id] > t - 1500) && !(S.refused[p.id] > t) && !(S.protectedUntil[p.id] > t))
      .sort((a, b) => dist(h, a) - dist(h, b));
    if (c.length) attack(c[0]);
  }

  /*
   * Zaznaczenie celu. Gra ma przy graczu metody znacznika (addColorMark/removeColorMark) —
   * próbujemy ich; niezależnie od tego na ekranie jest mały wskaźnik „Cel: nick".
   */
  const mark = {
    id: null,
    raw: null,
    set(id) {
      this.clear(true);
      this.id = id;
      const raw = game.otherRaw(id);
      this.raw = raw;
      try { if (raw && typeof raw.addColorMark === 'function') raw.addColorMark('#ff0000', 'laddonz'); } catch {}
      this.ind();
    },
    /** Podświetlenie pilnowane cały czas — gra tworzy nowy obiekt gracza po jego powrocie na mapę. */
    ensure(id) {
      const raw = game.otherRaw(id);
      if (!raw) return;
      if (raw !== this.raw || this.id !== id) this.set(id);
    },
    clear(silent) {
      const raw = this.raw || (this.id && game.otherRaw(this.id));
      this.raw = null;
      try { if (raw && typeof raw.removeColorMark === 'function') raw.removeColorMark('laddonz'); } catch {}
      this.id = null;
      if (!silent) this.ind();
    },
    ind() {
      // bez komunikatu na ekranie — cel widać w menu gracza („Przerwij dobijanie")
      const n = document.getElementById('mp-napad-ind'); if (n) n.remove();
    },
  };

  defineAddon({
    id: 'napad', name: 'Slayer', icon: 'napad', color: ['#ff5d7a', '#b8325a'],
    desc: 'Pomaga dopaść przeciwnika. Klawiszem namierzasz najbliższego gracza, a dodatek zaatakuje go, gdy tylko znajdzie się w zasięgu — drugie naciśnięcie anuluje atak. Osobno możesz włączyć atak na każdego w pobliżu w wybranym przedziale poziomów (małe okienko „od – do”). Działa tylko przy włączonym dodatku. Kogo oszczędzić, ustawiasz w Bratanie.',
    defaults: { enabled: false, keyAttack: '', keyAll: '', allMode: false, lvlMin: 0, lvlMax: 500, target: null, remember: true },
    notes: () => [{ type: 'warn', text: '„Atakuj każdego w pobliżu” atakuje bez Twojego kliknięcia — to automat. Postać nigdy sama nie podchodzi do celu.' }],
    settings: [
      { group: 'Namierzanie klawiszem', key: 'keyAttack', type: 'key', label: 'Klawisz: namierz najbliższego gracza', hint: 'Pierwsze naciśnięcie namierza najbliższego gracza, drugie anuluje atak. Żeby zmienić cel na bliższy: anuluj i naciśnij jeszcze raz.' },
      { group: 'Namierzanie klawiszem', key: 'remember', type: 'bool', label: 'Zapamiętuj cel po jego zniknięciu', hint: 'Cel zostaje (z podświetleniem) także po zniknięciu z mapy, zmianie mapy i odświeżeniu gry — aż go anulujesz. Wyłączone: namierzenie znika razem z celem.' },
      { group: 'Atakuj każdego w pobliżu', key: 'allMode', type: 'bool', label: 'Włączone', hint: 'Na ekranie pojawi się małe okienko z zakresem poziomów „od – do” — atakowany jest każdy w zasięgu z tego zakresu.' },
      { group: 'Atakuj każdego w pobliżu', key: 'keyAll', type: 'key', label: 'Klawisz: włącz / wyłącz' },
    ],
    render(box, c, rerender) {
      rr = () => { if (box.isConnected) rerender(); };
      box.appendChild(el('div', { class: 'mp-card' }, el('h3', null, 'Zapamiętany cel'),
        S.lock ? el('div', { style: { display: 'flex', alignItems: 'center', gap: '10px' } },
          el('b', null, S.lock.nick), el('span', { class: 'mp-dim' }, game.otherById(S.lock.id) || game.otherByNick(S.lock.nick) ? 'na mapie' : 'poza mapą — czekam'),
          el('button', { class: 'mp-btn bad', style: { marginLeft: 'auto' }, onclick: () => { unlock(`Slayer: przerwano dobijanie ${S.lock ? S.lock.nick : ''}`); rerender(); } }, 'Przerwij dobijanie'))
          : el('div', { class: 'mp-dim' }, 'Brak. Ustaw klawiszem albo „Dobij" w menu gracza.')));
    },
    init(c) {
      cfg = c;
      if (!c._v15) { c._v15 = true; c.lvlMin = 0; c.lvlMax = 500; config.save(); }
      if (!c._v106) { c._v106 = true; c.allMode = false; config.save(); }   // dawniej: włączony dodatek = atak na każdego; teraz to osobny przełącznik
      keys.bind({ label: 'Slayer: namierz / anuluj', get: () => cfg.keyAttack || '', fn: () => keyNearest() });
      keys.bind({ label: 'Slayer: każdy w pobliżu', get: () => cfg.keyAll || '', fn: () => { if (cfg.enabled) setAll(!cfg.allMode); } });
      menus.add('player', (id) => {
        if (!cfg.enabled) return [];
        // namierzony gracz → zamiast „Dobij" jest „Przerwij dobijanie" (cofa polecenie ataku)
        const pp = game.otherById(id);
        if (S.lock && (S.lock.id === Number(id) || (pp && pp.nick === S.lock.nick))) return [{ label: 'Przerwij dobijanie', fn: () => unlock(`Slayer: przerwano dobijanie ${S.lock ? S.lock.nick : ''}`) }];
        const p = game.otherById(id);
        if (!p || !allowed(p)) return [];
        return [{ label: 'Dobij', fn: () => lockOn(game.otherById(id) || p) }];
      });
      bus.on('map:change', () => { S.protectedUntil = {}; S.tried = {}; S.refused = {}; if (!cfg.remember) unlock(); });
      // przywróć zapamiętany cel
      if (cfg.remember && cfg.target && cfg.target.nick) S.lock = { id: Number(cfg.target.id), nick: cfg.target.nick, t: now() };
      MP.napad = { attack: (p) => lockOn(p), lockOn, unlock, setAll };
      ensureLoop();
      allWin();
    },
    onChange(k) { if (k === 'allMode') { allWin(); ensureLoop(); } },
    onToggle(on) { if (!on && S.lock) unlock(); ensureLoop(); allWin(); },
  });
})();
