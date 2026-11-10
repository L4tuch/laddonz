/* ───────── Dobijarka (id: napad — zostawione dla zgodności ustawień) ─────────
 * Włączony  → atakuje każdego gracza, który wejdzie w zasięg (w zakresie poziomów).
 * Klawisz   → działa ZAWSZE (także gdy dodatek jest wyłączony): namierza najbliższego gracza
 *             i atakuje go w chwili, gdy będzie w zasięgu. Postać nie podchodzi sama.
 * Menu gracza (prawy klik) → „Dobij": namierza tego gracza, atak gdy będzie w zasięgu.
 * Kogo NIE atakować (klan, znajomi…) — decyduje Bratan; Dobijarka takich graczy po prostu pomija.
 */
(() => {
  const RANGE = 2;            // zasięg ataku w kratkach (liczy się większa z odległości w poziomie/pionie)
  const RETRY_MS = 600;       // jak często ponawiać atak na namierzony cel w zasięgu
  const S = { last: 0, protectedUntil: {}, tried: {}, refused: {}, lock: null, timer: null };
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
        // odmowa serwera (np. żółta mapa: „Przeciwnik nie zgadza się na walkę") — nie ponawiamy w kółko
        let txt = ''; try { txt = JSON.stringify(data || {}); } catch {}
        if (/nie zgadza|nie mo[żz]esz|nie mo[żz]na/i.test(txt)) {
          S.refused[p.id] = now() + 30000;
          return;   // cel zostaje zapamiętany — spróbujemy znowu za 30 s
        }
        const sec = parseProtection(data);
        if (sec) {
          S.protectedUntil[p.id] = now() + sec * 1000;
          if (S.lock && S.lock.id === p.id) toast(`Dobijarka: ${p.nick} ma ochronę jeszcze ${sec} s — zaatakuję, gdy minie`);
        }
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
    const h = game.hero(); if (!h) return;
    const list = game.others().filter(allowed).sort((a, b) => dist(h, a) - dist(h, b));
    if (!list.length) { toast('Dobijarka: brak graczy na mapie'); return; }
    // ponowne naciśnięcie przy tym samym celu = następny najbliższy
    let p = list[0];
    if (S.lock && S.lock.id === p.id && list[1]) p = list[1];
    lockOn(p);
  }

  /* ── pętla: namierzony cel + tryb włączony ── */
  function ensureLoop() {
    const need = !!S.lock || (cfg && cfg.enabled);
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
    if (!game.ready()) return;
    const h = game.hero(); if (!h) return;
    if (game.inBattle()) return;
    // 1) namierzony cel — pamiętany, dopóki sam go nie zmienisz/przerwiesz; atak, gdy będzie w zasięgu
    if (S.lock) {
      const p = lockedPlayer();
      if (p && dist(h, p) <= RANGE && !(S.refused[p.id] > now())) { attack(p); return; }
      if (p) return;              // cel jest na mapie, ale daleko — czekamy
      // celu nie ma na mapie — w międzyczasie (gdy włączona) atakuje innych w zasięgu
    }
    // 2) dodatek włączony → każdy w zasięgu
    if (!cfg.enabled) return;
    const t = now();
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
    set(id) {
      this.clear(true);
      this.id = id;
      const raw = game.otherRaw(id);
      try { if (raw && typeof raw.addColorMark === 'function') raw.addColorMark('#ff0000', 'laddonz'); } catch {}
      this.ind();
    },
    clear(silent) {
      const raw = this.id && game.otherRaw(this.id);
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
    id: 'napad', name: 'Dobijarka', icon: 'napad', color: ['#ff5d7a', '#b8325a'], risk: 'auto',
    desc: 'Włączona: atakuje każdego gracza, który wejdzie w zasięg (w podanym zakresie poziomów). Klawisz działa zawsze — namierza najbliższego gracza i atakuje go, gdy tylko będzie w zasięgu. Cel jest pamiętany (także gdy zniknie z mapy lub odświeżysz grę), dopóki nie wybierzesz innego albo nie przerwiesz. To samo robi opcja „Dobij" w menu gracza; „Przerwij dobijanie" cofa polecenie. Kogo nie atakować, ustawiasz w Bratanie.',
    defaults: { enabled: false, keyAttack: '', lvlMin: 0, lvlMax: 500, target: null },
    notes: () => [{ type: 'warn', text: 'Włączona Dobijarka atakuje bez Twojego kliknięcia — to automat. Postać nigdy sama nie podchodzi do celu.' }],
    settings: [
      { key: 'lvlMin', type: 'number', label: 'Atakuj od poziomu', min: 0, max: 500, hint: 'Dotyczy ataku na każdego w zasięgu.' },
      { key: 'lvlMax', type: 'number', label: 'Atakuj do poziomu', min: 0, max: 500 },
      { key: 'keyAttack', type: 'key', label: 'Klawisz: namierz najbliższego gracza', hint: 'Działa także przy wyłączonym dodatku. Ponowne naciśnięcie = następny najbliższy. Przerwanie: prawy klik na celu → „Przerwij dobijanie".' },
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
      // klawisz działa niezależnie od włączenia dodatku
      keys.bind({ label: 'Dobijarka: namierz najbliższego', get: () => cfg.keyAttack || '', fn: () => keyNearest() });
      menus.add('player', (id) => {
        // namierzony gracz → zamiast „Dobij" jest „Przerwij dobijanie" (cofa polecenie ataku)
        const pp = game.otherById(id);
        if (S.lock && (S.lock.id === Number(id) || (pp && pp.nick === S.lock.nick))) return [{ label: 'Przerwij dobijanie', fn: () => unlock(`Dobijarka: przerwano atak na ${S.lock ? S.lock.nick : 'cel'}`) }];
        const p = game.otherById(id);
        if (!p || !allowed(p)) return [];
        return [{ label: 'Dobij', fn: () => lockOn(game.otherById(id) || p) }];
      });
      bus.on('map:change', () => { S.protectedUntil = {}; S.tried = {}; S.refused = {}; });
      // przywróć zapamiętany cel
      if (cfg.target && cfg.target.nick) S.lock = { id: Number(cfg.target.id), nick: cfg.target.nick, t: now() };
      MP.napad = { attack: (p) => lockOn(p), lockOn, unlock };
      ensureLoop();
    },
    onToggle() { ensureLoop(); },
  });
})();
