/* ───────── Napad ─────────
 * Atak pod klawisz na najbliższego wroga w zasięgu (bez gonienia), opcja „Napad" w menu gracza,
 * pamiętanie ochrony (nie marnuje ataków), zmiana zestawu, oraz tryb AUTO
 * (atakuje graczy, którzy wejdą w zasięg — wg tych samych filtrów). AUTO domyślnie wyłączone.
 */
(() => {
  const S = { last: 0, protectedUntil: {}, backoff: {}, autoTried: {}, lastSet: { id: null, t: 0 }, auto: false, timer: null };
  let cfg;

  const enemies = () => game.others().filter((p) => !isFriendly(p));

  function candidates(range, forAuto) {
    const h = game.hero(); if (!h) return [];
    let list = game.others().filter((p) => !isFriendly(p) && !nickIn(cfg.neverList, p.nick));
    if (cfg.targetMode === 'tagged') list = list.filter((p) => p.isEnemyTagged || nickIn(cfg.targetList, p.nick));
    if (forAuto && cfg.autoOnlyList) list = list.filter((p) => nickIn(cfg.targetList, p.nick));
    if (cfg.lvlMin) list = list.filter((p) => p.lvl >= cfg.lvlMin);
    if (cfg.lvlMax) list = list.filter((p) => p.lvl <= cfg.lvlMax);
    if (range > 0) list = list.filter((p) => game.dist(h, p) <= range + 0.01);
    const t = now();
    if (cfg.skipProtected) list = list.filter((p) => !(S.protectedUntil[p.id] > t));
    list = list.filter((p) => !(S.backoff[p.id] > t));
    return list.sort((a, b) => {
      const pa = nickIn(cfg.targetList, a.nick) ? 0 : 1, pb = nickIn(cfg.targetList, b.nick) ? 0 : 1;
      return pa - pb || game.dist(h, a) - game.dist(h, b);
    });
  }

  async function attack(p, why) {
    if (!p) return false;
    const t = now();
    if (t - S.last < Math.max(500, cfg.minInterval)) return false;
    if (game.inBattle()) return false;
    if (cfg.skipProtected && S.protectedUntil[p.id] > t) {
      toast(`${p.nick} ma jeszcze ochronę (${Math.ceil((S.protectedUntil[p.id] - t) / 1000)} s)`, 'warn', 1800);
      return false;
    }
    S.last = t;
    // zestaw
    if (cfg.switchSet && cfg.setId) {
      const single = enemies().length === 1;
      if ((!cfg.setOnlySingleEnemy || single) && !(S.lastSet.id === cfg.setId && t - S.lastSet.t < 15000)) {
        S.lastSet = { id: cfg.setId, t };
        net.send('eqSet', { id: cfg.setId }, { src: 'Napad', urgent: true });
      }
    }
    const r = await net.send('attackPlayer', { id: p.id }, {
      src: 'Napad',
      onResponse: (data) => {
        const sec = parseProtection(data);
        if (sec) {
          S.protectedUntil[p.id] = now() + sec * 1000;
          toast(`${p.nick}: ochrona ${sec} s — wstrzymuję ataki na niego`, 'warn', 2200);
        }
      },
    });
    if (!r.ok && !r.dry) S.backoff[p.id] = now() + 2000;
    if (why === 'key' && r.ok) toast(`⚔ Napad: ${p.nick} (${p.lvl})`, 'info', 1500);
    return r.ok;
  }

  function attackNearest() {
    if (game.inBattle()) return;
    const c = candidates(cfg.range, false);
    if (!c.length) { toast('Napad: brak celu w zasięgu', 'warn', 1500); return; }
    attack(c[0], 'key');
  }

  /* ── tryb AUTO ── */
  function setAuto(on) {
    S.auto = !!on && cfg.enabled && cfg.autoMode;
    clearInterval(S.timer);
    if (S.auto) S.timer = setInterval(autoTick, 250);
    indicator();
  }
  function autoTick() {
    if (!S.auto || !game.ready() || game.inBattle()) return;
    const t = now();
    // ten sam cel nie częściej niż co 3 s (gdy atak się nie udał, nie męczymy serwera)
    const c = candidates(cfg.autoRange, true).filter((p) => !(S.autoTried[p.id] > t - 3000));
    if (c.length && t - S.last >= Math.max(500, cfg.minInterval)) { S.autoTried[c[0].id] = t; attack(c[0], 'auto'); }
  }
  function indicator() {
    let n = document.getElementById('mp-napad-ind');
    if (!S.auto || !cfg.showIndicator) { n && n.remove(); return; }
    if (!n) {
      const p = store.get('win:napad-ind', { x: innerWidth - 230, y: 70 });
      n = el('div', { id: 'mp-napad-ind', class: 'mp-glass', title: 'Kliknij, żeby wyłączyć', style: { position: 'fixed', zIndex: 2147482995, left: p.x + 'px', top: p.y + 'px', padding: '7px 12px', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', border: '1px solid rgba(255,93,122,.55)', boxShadow: '0 0 18px rgba(255,93,122,.35)' } },
        el('div', { class: 'mp-tile', style: { width: '24px', height: '24px', borderRadius: '7px', background: grad(['#ff5d7a', '#b8325a']) } }, icon('napad', 14)),
        el('div', null, el('div', { style: { fontWeight: 800, fontSize: '12px', letterSpacing: '.5px' } }, 'NAPAD AUTO'), el('div', { class: 'mp-badc', style: { fontSize: '11px', fontWeight: 700 } }, '● WŁĄCZONY')));
      const moved = makeDraggable(n, n, (pos) => store.set('win:napad-ind', pos));
      n.addEventListener('click', () => { if (!moved()) { setAuto(false); toast('Napad AUTO wyłączony', 'ok'); } });
      document.body.appendChild(n);
    }
  }
  function toggleAuto() {
    if (!cfg.autoMode) { toast('Najpierw włącz „Tryb AUTO" w ustawieniach Napadu', 'warn'); return; }
    setAuto(!S.auto);
    toast(S.auto ? 'Napad AUTO: WŁĄCZONY' : 'Napad AUTO: wyłączony', S.auto ? 'bad' : 'ok');
  }

  defineAddon({
    id: 'napad', name: 'Napad', icon: 'napad', color: ['#ff5d7a', '#b8325a'], risk: 'auto',
    desc: 'Atak na najbliższego wroga pod klawisz (bez gonienia), opcja „Napad" po prawym kliknięciu na gracza, pamiętanie ochrony, zmiana zestawu i opcjonalny tryb AUTO.',
    defaults: {
      keyAttack: '', range: 2, minInterval: 1000, targetMode: 'enemies', lvlMin: 0, lvlMax: 0,
      targetList: [], neverList: [], skipProtected: true, menuEntry: true,
      switchSet: false, setId: 1, setOnlySingleEnemy: true,
      autoMode: false, autoKey: '', autoRange: 2, autoOnlyList: false, showIndicator: true,
    },
    keys: [
      { key: 'keyAttack', label: 'atak na najbliższego', fn: () => attackNearest() },
      { key: 'autoKey', label: 'włącz/wyłącz AUTO', fn: () => toggleAuto() },
    ],
    notes: (c) => [
      c.switchSet && !net.cmd('eqSet').t ? { type: 'warn', text: 'Zmiana zestawu wymaga podsłuchania komendy: przełącz zestaw ręcznie w grze, potem Diagnostyka → Podsłuch → „Zmiana zestawu".' } : null,
      c.autoMode ? { type: 'bad', text: 'Tryb AUTO atakuje bez Twojego kliknięcia — to automatyzacja, za którą najłatwiej o bana. Używasz na własne ryzyko. Gdy jest aktywny, na ekranie widać czerwony wskaźnik „NAPAD AUTO".' } : null,
    ],
    settings: [
      { group: 'Atak pod klawisz', key: 'keyAttack', type: 'key', label: 'Klawisz ataku', hint: 'Jedno naciśnięcie = jedna próba ataku na najbliższy cel.' },
      { group: 'Atak pod klawisz', key: 'range', type: 'number', label: 'Zasięg (kratki)', min: 0, max: 30, hint: '0 = cała mapa. Postać nie podchodzi do celu.' },
      { group: 'Atak pod klawisz', key: 'minInterval', type: 'number', label: 'Odstęp między atakami (ms)', min: 500, max: 10000 },
      { group: 'Atak pod klawisz', key: 'menuEntry', type: 'bool', label: 'Opcja „⚔ Napad" w menu gracza (prawy przycisk)' },
      { group: 'Cele', key: 'targetMode', type: 'select', label: 'Kogo atakować', options: [['enemies', 'Wszystkich poza klanem/znajomymi/sojuszem'], ['tagged', 'Tylko oznaczonych jako wróg + lista celów']] },
      { group: 'Cele', key: 'lvlMin', type: 'number', label: 'Poziom od', min: 0, max: 500, hint: '0 = bez limitu' },
      { group: 'Cele', key: 'lvlMax', type: 'number', label: 'Poziom do', min: 0, max: 500 },
      { group: 'Cele', key: 'targetList', type: 'list', label: 'Lista celów (priorytet)', placeholder: 'nick + Enter' },
      { group: 'Cele', key: 'neverList', type: 'list', label: 'Nigdy nie atakuj', placeholder: 'nick + Enter' },
      { group: 'Cele', key: 'skipProtected', type: 'bool', label: 'Nie marnuj ataków na graczy z ochroną', hint: 'Po komunikacie o ochronie panel czeka, aż minie.' },
      { group: 'Zestaw', key: 'switchSet', type: 'bool', label: 'Przełącz zestaw przed atakiem', rerender: true },
      { group: 'Zestaw', key: 'setId', type: 'number', label: 'Numer zestawu', min: 1, max: 10, show: (c) => c.switchSet },
      { group: 'Zestaw', key: 'setOnlySingleEnemy', type: 'bool', label: 'Tylko gdy na mapie jest 1 wróg', hint: 'Na ustawkach zestaw się nie zmienia.', show: (c) => c.switchSet },
      { group: 'Tryb AUTO', key: 'autoMode', type: 'bool', auto: true, label: 'Tryb AUTO dostępny', rerender: true, danger: true, countdown: 3,
        confirm: 'Tryb AUTO sam atakuje graczy, którzy wejdą w zasięg. To automatyzacja i może skończyć się banem. Włączasz go potem klawiszem lub w tym panelu, a działanie sygnalizuje czerwony wskaźnik na ekranie.' },
      { group: 'Tryb AUTO', key: 'autoKey', type: 'key', label: 'Klawisz: włącz/wyłącz AUTO', show: (c) => c.autoMode },
      { group: 'Tryb AUTO', key: 'autoRange', type: 'number', label: 'Zasięg AUTO (kratki)', min: 1, max: 30, show: (c) => c.autoMode },
      { group: 'Tryb AUTO', key: 'autoOnlyList', type: 'bool', label: 'AUTO tylko na graczy z listy celów', hint: 'Wyłączone = każdy pasujący do filtrów „Cele".', show: (c) => c.autoMode },
      { group: 'Tryb AUTO', key: 'showIndicator', type: 'bool', label: 'Pokazuj wskaźnik „NAPAD AUTO"', show: (c) => c.autoMode },
    ],
    render(box, c, rerender) {
      if (!c.autoMode) return;
      box.appendChild(el('div', { class: 'mp-btns' }, el('button', { class: 'mp-btn ' + (S.auto ? 'bad' : 'pri'), onclick: () => { toggleAuto(); rerender(); } }, S.auto ? 'Wyłącz AUTO teraz' : 'Włącz AUTO teraz')));
    },
    init(c) {
      cfg = c;
      menus.add('player', (id) => {
        if (!cfg.enabled || !cfg.menuEntry) return [];
        const p = game.otherById(id);
        if (!p || isFriendly(p)) return [];
        return [{ label: '⚔ Napad', fn: () => attack(game.otherById(id) || p, 'key') }];
      });
      bus.on('map:change', () => { S.protectedUntil = {}; S.backoff = {}; });
      MP.napad = { attack, candidates: (r) => candidates(r ?? cfg.range, false) };
    },
    onToggle(on) { if (!on) setAuto(false); },
    onChange(k) { if (k === 'autoMode' && !cfg.autoMode) setAuto(false); if (k === 'showIndicator') indicator(); },
  });
})();
