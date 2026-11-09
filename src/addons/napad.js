/* ───────── Napad ─────────
 * Włączony  → atakuje każdego gracza, który wejdzie w zasięg (w zakresie poziomów).
 * Klawisz   → działa ZAWSZE (także gdy dodatek jest wyłączony): namierza najbliższego gracza
 *             i atakuje go w chwili, gdy będzie w zasięgu. Postać nie podchodzi sama.
 * Menu gracza (prawy klik) → „Napad": namierza tego gracza, atak gdy będzie w zasięgu.
 * Kogo NIE atakować (klan, znajomi…) — decyduje Bratan; Napad takich graczy po prostu pomija.
 */
(() => {
  const RANGE = 2;            // zasięg ataku w kratkach (liczy się większa z odległości w poziomie/pionie)
  const RETRY_MS = 600;       // jak często ponawiać atak na namierzony cel w zasięgu
  const LOCK_MS = 60000;      // namierzenie wygasa po minucie
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
      src: 'Napad',
      onResponse: (data) => {
        // odmowa serwera (np. żółta mapa: „Przeciwnik nie zgadza się na walkę") — nie ponawiamy w kółko
        let txt = ''; try { txt = JSON.stringify(data || {}); } catch {}
        if (/nie zgadza|nie mo[żz]esz|nie mo[żz]na/i.test(txt)) {
          S.refused[p.id] = now() + 30000;
          if (S.lock && S.lock.id === p.id) unlock();
          return;
        }
        const sec = parseProtection(data);
        if (sec) {
          S.protectedUntil[p.id] = now() + sec * 1000;
          if (S.lock && S.lock.id === p.id) toast(`Napad: ${p.nick} ma ochronę jeszcze ${sec} s — zaatakuję, gdy minie`);
        }
      },
    });
    return r.ok;
  }

  /* ── namierzanie (klawisz / menu / lista) ── */
  function lockOn(p) {
    if (!p) return;
    if (!allowed(p)) { toast(`Napad: ${p.nick} jest chroniony przez Bratana`); return; }
    S.lock = { id: p.id, nick: p.nick, t: now() };
    mark.set(p.id);
    toast(`Napad: cel ${p.nick} (${p.lvl}${p.prof})`);
    ensureLoop();
    tick();
  }
  function unlock(msg) {
    if (!S.lock) return;
    if (msg) toast(msg);
    S.lock = null;
    mark.clear();
    ensureLoop();
  }
  function keyNearest() {
    const h = game.hero(); if (!h) return;
    const list = game.others().filter(allowed).sort((a, b) => dist(h, a) - dist(h, b));
    if (!list.length) { toast('Napad: brak graczy na mapie'); return; }
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
  function tick() {
    if (!game.ready()) return;
    const h = game.hero(); if (!h) return;
    if (game.inBattle()) { if (S.lock) unlock(); return; }
    // 1) namierzony cel — atak, gdy tylko będzie w zasięgu
    if (S.lock) {
      const p = game.otherById(S.lock.id);
      if (!p) { unlock(`Napad: ${S.lock.nick} zniknął z mapy`); return; }
      if (now() - S.lock.t > LOCK_MS) { unlock('Napad: namierzanie wygasło'); return; }
      if (dist(h, p) <= RANGE) attack(p);
      return;
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
      let n = document.getElementById('mp-napad-ind');
      if (!S.lock) { n && n.remove(); return; }
      if (!n) {
        const pos = store.get('win:napad-ind', { x: Math.round(innerWidth / 2 - 80), y: 70 });
        n = el('div', { id: 'mp-napad-ind', class: 'mp-glass mp-target', title: 'Kliknij, żeby anulować', style: { left: pos.x + 'px', top: pos.y + 'px' } });
        const moved = makeDraggable(n, n, (p) => store.set('win:napad-ind', p));
        n.addEventListener('click', () => { if (!moved()) unlock('Napad: anulowano'); });
        document.body.appendChild(n);
      }
      n.innerHTML = '';
      n.append(icon('napad', 14), el('span', null, 'Cel: ', el('b', null, S.lock.nick)));
    },
  };

  defineAddon({
    id: 'napad', name: 'Napad', icon: 'napad', color: ['#ff5d7a', '#b8325a'], risk: 'auto',
    desc: 'Włączony: atakuje każdego gracza, który wejdzie w zasięg (w podanym zakresie poziomów). Klawisz działa zawsze — namierza najbliższego gracza i atakuje go, gdy tylko będzie w zasięgu. To samo robi opcja „Napad" w menu gracza. Kogo nie atakować, ustawiasz w Bratanie.',
    defaults: { enabled: false, keyAttack: '', lvlMin: 0, lvlMax: 500 },
    notes: () => [{ type: 'warn', text: 'Włączony Napad atakuje bez Twojego kliknięcia — to automat. Postać nigdy sama nie podchodzi do celu.' }],
    settings: [
      { key: 'lvlMin', type: 'number', label: 'Atakuj od poziomu', min: 0, max: 500, hint: 'Dotyczy ataku na każdego w zasięgu.' },
      { key: 'lvlMax', type: 'number', label: 'Atakuj do poziomu', min: 0, max: 500 },
      { key: 'keyAttack', type: 'key', label: 'Klawisz: namierz najbliższego gracza', hint: 'Działa także przy wyłączonym dodatku. Ponowne naciśnięcie = następny najbliższy. Klik we wskaźnik celu = anuluj.' },
    ],
    init(c) {
      cfg = c;
      if (!c._v15) { c._v15 = true; c.lvlMin = 0; c.lvlMax = 500; config.save(); }
      // klawisz działa niezależnie od włączenia dodatku
      keys.bind({ label: 'Napad: namierz najbliższego', get: () => cfg.keyAttack || '', fn: () => keyNearest() });
      menus.add('player', (id) => {
        // namierzony gracz → zamiast „Napad" jest „Przerwij napad" (cofa polecenie ataku)
        if (S.lock && S.lock.id === Number(id)) return [{ label: 'Przerwij napad', fn: () => unlock(`Napad: przerwano atak na ${S.lock ? S.lock.nick : 'cel'}`) }];
        const p = game.otherById(id);
        if (!p || !allowed(p)) return [];
        return [{ label: 'Napad', fn: () => lockOn(game.otherById(id) || p) }];
      });
      bus.on('map:change', () => { S.protectedUntil = {}; S.tried = {}; S.refused = {}; unlock(); });
      MP.napad = { attack: (p) => lockOn(p), lockOn, unlock };
      ensureLoop();
    },
    onToggle() { ensureLoop(); },
  });
})();
