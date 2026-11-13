/* ───────── Dobijarka (id: napad — zostawione dla zgodności ustawień) ─────────
 * Wszystko działa tylko przy WŁĄCZONYM dodatku.
 * Klawisz   → namierza najbliższego gracza i atakuje go w chwili, gdy będzie w zasięgu. Ponowne
 *             naciśnięcie przy namierzonym celu = anulowanie (bez zmiany celu). Postać nie podchodzi sama.
 * „Atakuj każdego w pobliżu" → osobny przełącznik (też pod klawisz); gdy włączony, na ekranie jest małe
 *             okienko z zakresem poziomów „od – do" i atakowany jest każdy w zasięgu z tego zakresu.
 * Menu gracza (prawy klik) → „Dobij": namierza tego gracza, atak gdy będzie w zasięgu.
 * Kogo NIE atakować (klan, znajomi…) — decyduje Bratan; Dobijarka takich graczy po prostu pomija.
 */
(() => {
  const RANGE = 2;            // zasięg ataku w kratkach (liczy się większa z odległości w poziomie/pionie)
  const RETRY_MS = 600;       // jak często ponawiać atak na namierzony cel w zasięgu
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

  const dist = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
  const task = (id) => net.build('attackPlayer', { id }).task;
  /** Czy atak na tego gracza przeszedłby przez bezpieczniki (Bratan) — sprawdzamy po cichu. */
  const allowed = (p) => { const t = task(p.id); return !!t && !net.checkGuards(t); };
  const inLvl = (p) => p.lvl >= (Number(cfg.lvlMin) || 0) && p.lvl <= (Number(cfg.lvlMax) || 999);

  async function attack(p) {
    const t = now();
    if (!p || game.inBattle()) return false;
    if (t - S.last < RETRY_MS) return false;
    if (S.protectedUntil[p.id] > t) return false;           // nie marnujemy ataku na ochronę
    S.last = t;
    S.tried[p.id] = t;
    const r = await net.send('attackPlayer', { id: p.id }, {
      src: 'Dobijarka',
      onResponse: (data) => {
        // odmowa serwera (np. żółta mapa: „Przeciwnik nie zgadza się na walkę") — nie ponawiamy w kółko i MÓWIMY o tym
        let txt = ''; try { txt = JSON.stringify(data || {}); } catch {}
        const said = respText(data);
        if (/nie zgadza|nie mo[żz]esz|nie mo[żz]na|odmówi|odmowa/i.test(txt)) {
          S.refused[p.id] = now() + 30000;
          say('ref' + p.id, `Dobijarka: ${p.nick} — ${said || 'nie zgadza się na walkę'}`, 30000);
          return;   // cel zostaje zapamiętany — spróbujemy znowu za 30 s
        }
        const sec = parseProtection(data);
        if (sec) {
          S.protectedUntil[p.id] = now() + sec * 1000;
          say('prot' + p.id, `Dobijarka: ${p.nick} ma ochronę jeszcze ${sec} s — zaatakuję, gdy minie`, sec * 1000);
          return;
        }
        // każdy inny komunikat gry przy ataku (np. „Nie możesz atakować na tej mapie") — pokazujemy
        if (said && !game.inBattle()) say('msg' + p.id + said, `Dobijarka: ${p.nick} — ${said}`, 20000);
      },
    });
    return r.ok;
  }

  /* ── namierzanie (klawisz / menu / lista) ── */
  function lockOn(p) {
    if (!p) return;
    if (!allowed(p)) { toast(`Dobijarka: ${p.nick} jest chroniony przez Bratana`); return; }
    S.lock = { id: p.id, nick: p.nick, t: now() };
    cfg.target = { id: p.id, nick: p.nick };          // zapamiętany na stałe (także po odświeżeniu gry)
    config.save();
    mark.set(p.id);
    toast(`Dobijarka: cel ${p.nick}`);
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
    if (ui.panel && ui.sel === 'napad') ui.renderMain();
  }
  function keyNearest() {
    if (!cfg.enabled) return;
    // ponowne naciśnięcie przy namierzonym celu = anulowanie (żeby zmienić cel: anuluj i naciśnij jeszcze raz)
    if (S.lock) { unlock(`Dobijarka: anulowano atak na ${S.lock.nick}`); return; }
    const h = game.hero(); if (!h) return;
    const list = game.others().filter(allowed).sort((a, b) => dist(h, a) - dist(h, b));
    if (!list.length) { toast('Dobijarka: brak graczy na mapie'); return; }
    lockOn(list[0]);
  }

  /* ── „Atakuj każdego w pobliżu" — osobny przełącznik z małym okienkiem zakresu poziomów ── */
  function setAll(on, quiet) {
    cfg.allMode = !!on; config.save();
    allWin();
    ensureLoop();
    if (!quiet) toast(on ? `Dobijarka: atak na każdego w pobliżu (poz. ${Number(cfg.lvlMin) || 0}–${Number(cfg.lvlMax) || 500})` : 'Dobijarka: atak na każdego w pobliżu wyłączony', on ? 'ok' : 'info');
    if (ui.panel && ui.sel === 'napad') ui.renderMain();
  }
  function allWin() {
    let w = document.getElementById('mp-dbw');
    const show = cfg && cfg.enabled && cfg.allMode;
    if (!show) { if (w) w.remove(); return; }
    if (w) return;
    const num = (key, def) => el('input', { type: 'number', min: 0, max: 500, value: cfg[key] ?? def,
      onkeydown: (e) => e.stopPropagation(), onkeyup: (e) => e.stopPropagation(),
      oninput: (e) => { const v = Math.max(0, Math.min(500, parseInt(e.target.value, 10) || 0)); cfg[key] = v; config.save(); } });
    const head = el('div', { class: 'mp-dbw-h' }, el('span', null, 'Dobijarka — każdy w pobliżu'),
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

  /* ── pętla: namierzony cel + tryb włączony ── */
  function ensureLoop() {
    const need = !!(cfg && cfg.enabled) && (!!S.lock || !!cfg.allMode);
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
  function tick() {
    if (!cfg || !cfg.enabled) return;
    if (!game.ready()) return;
    const h = game.hero(); if (!h) return;
    if (game.inBattle()) return;
    // 1) namierzony cel — pamiętany, dopóki sam go nie zmienisz/przerwiesz; atak, gdy będzie w zasięgu
    if (S.lock) {
      const p = lockedPlayer();
      if (!p && !cfg.remember) { unlock(`Dobijarka: ${S.lock.nick} zniknął z mapy`); return; }
      if (p) mark.ensure(p.id);   // gracz wrócił (nowy obiekt w grze) — przywróć podświetlenie
      if (p && dist(h, p) <= RANGE && !allowed(p)) { say('br' + p.id, `Dobijarka: ${p.nick} jest chroniony przez Bratana — nie zaatakuję`, 60000); return; }
      if (p && dist(h, p) <= RANGE && !(S.refused[p.id] > now())) { attack(p); return; }
      if (p) return;              // cel jest na mapie, ale daleko — czekamy
      // celu nie ma na mapie — w międzyczasie (gdy włączona) atakuje innych w zasięgu
    }
    // 2) „Atakuj każdego w pobliżu" włączone → każdy w zasięgu z zakresu poziomów
    if (!cfg.allMode) return;
    const t = now();
    for (const p of game.others()) if (dist(h, p) <= RANGE && inLvl(p) && !allowed(p)) say('br' + p.id, `Dobijarka: pomijam ${p.nick} — chroniony przez Bratana`, 120000, 'info');
    const c = game.others()
      .filter((p) => dist(h, p) <= RANGE && inLvl(p) && allowed(p) && !(S.tried[p.id] > t - 2500) && !(S.refused[p.id] > t))
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
    id: 'napad', name: 'Dobijarka', icon: 'napad', color: ['#ff5d7a', '#b8325a'],
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
      box.appendChild(el('div', { class: 'mp-card' }, el('h3', null, 'Zapamiętany cel'),
        S.lock ? el('div', { style: { display: 'flex', alignItems: 'center', gap: '10px' } },
          el('b', null, S.lock.nick), el('span', { class: 'mp-dim' }, game.otherById(S.lock.id) || game.otherByNick(S.lock.nick) ? 'na mapie' : 'poza mapą — czekam'),
          el('button', { class: 'mp-btn bad', style: { marginLeft: 'auto' }, onclick: () => { unlock('Dobijarka: przerwano'); rerender(); } }, 'Przerwij dobijanie'))
          : el('div', { class: 'mp-dim' }, 'Brak. Ustaw klawiszem albo „Dobij" w menu gracza.')));
    },
    init(c) {
      cfg = c;
      if (!c._v15) { c._v15 = true; c.lvlMin = 0; c.lvlMax = 500; config.save(); }
      if (!c._v106) { c._v106 = true; c.allMode = false; config.save(); }   // dawniej: włączony dodatek = atak na każdego; teraz to osobny przełącznik
      keys.bind({ label: 'Dobijarka: namierz / anuluj', get: () => cfg.keyAttack || '', fn: () => keyNearest() });
      keys.bind({ label: 'Dobijarka: każdy w pobliżu', get: () => cfg.keyAll || '', fn: () => { if (cfg.enabled) setAll(!cfg.allMode); } });
      menus.add('player', (id) => {
        if (!cfg.enabled) return [];
        // namierzony gracz → zamiast „Dobij" jest „Przerwij dobijanie" (cofa polecenie ataku)
        const pp = game.otherById(id);
        if (S.lock && (S.lock.id === Number(id) || (pp && pp.nick === S.lock.nick))) return [{ label: 'Przerwij dobijanie', fn: () => unlock(`Dobijarka: przerwano atak na ${S.lock ? S.lock.nick : 'cel'}`) }];
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
