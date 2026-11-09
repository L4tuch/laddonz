/* ───────── Kto tu jest? ─────────
 * Okno z listą graczy na mapie + wiele filtrów (nick, poziom, profesja, relacja, klan) i zapisywane zestawy filtrów.
 */
(() => {
  let cfg, timer = null, win = null;
  const F0 = { nick: '', clan: '', lvlMin: 0, lvlMax: 0, rel: 'all', profs: [], sort: 'dist' };

  function filtered() {
    const f = cfg.filter;
    const h = game.hero() || { x: 0, y: 0 };
    let l = game.others();
    if (f.nick) l = l.filter((p) => p.nick.toLowerCase().includes(f.nick.toLowerCase()));
    if (f.clan) l = l.filter((p) => (p.clanName || '').toLowerCase().includes(f.clan.toLowerCase()));
    if (f.lvlMin) l = l.filter((p) => p.lvl >= f.lvlMin);
    if (f.lvlMax) l = l.filter((p) => p.lvl <= f.lvlMax);
    if (f.profs.length) l = l.filter((p) => f.profs.includes(p.prof));
    const R = { enemy: (p) => !isFriendly(p), friendly: isFriendly, clan: (p) => p.isClan, friend: (p) => p.isFriend, ally: (p) => p.isAlly, tagged: (p) => p.isEnemyTagged };
    if (R[f.rel]) l = l.filter(R[f.rel]);
    const S = { dist: (a, b) => game.dist(h, a) - game.dist(h, b), lvl: (a, b) => b.lvl - a.lvl, nick: (a, b) => a.nick.localeCompare(b.nick) };
    return l.sort(S[f.sort] || S.dist).map((p) => Object.assign(p, { d: game.dist(h, p) }));
  }

  function open() {
    const w = floatWin({ id: 'ktotu', title: 'Kto tu jest?', iconName: 'ktotu', color: ['#3fa2ff', '#2a6fd6'], x: 90, y: 140, width: 380, onClose: () => { clearInterval(timer); win = null; } });
    win = w;
    draw();
    clearInterval(timer);
    timer = setInterval(drawList, 1000);
  }
  function close() { const n = document.getElementById('mp-win-ktotu'); if (n) n.style.display = 'none'; clearInterval(timer); win = null; }
  function toggle() { const n = document.getElementById('mp-win-ktotu'); if (n && n.style.display !== 'none') close(); else open(); }

  let listBox, countEl;
  function draw() {
    const b = win.body; b.innerHTML = '';
    const f = cfg.filter;
    const save = () => { config.save(); drawList(); };
    const inp = (k, ph, type = 'text') => { const i = el('input', { class: 'mp-in', placeholder: ph, type, value: f[k] || '' }); i.addEventListener('input', () => { f[k] = type === 'number' ? Number(i.value) || 0 : i.value; save(); }); return i; };
    const sel = (k, opts) => { const s = el('select', { class: 'mp-in' }, opts.map(([v, l]) => { const o = el('option', { value: v }, l); if (f[k] === v) o.selected = true; return o; })); s.onchange = () => { f[k] = s.value; save(); }; return s; };
    const profs = el('div', { class: 'mp-profs' }, Object.entries(game.PROF_NAMES).map(([k, n]) => {
      const bt = el('button', { class: 'mp-pf' + (f.profs.includes(k) ? ' on' : ''), title: n }, n);
      bt.onclick = () => { const i = f.profs.indexOf(k); if (i < 0) f.profs.push(k); else f.profs.splice(i, 1); bt.classList.toggle('on'); save(); };
      return bt;
    }));
    // zapisane zestawy filtrów
    const presetSel = el('select', { class: 'mp-in', style: { flex: 1 } }, el('option', { value: '' }, 'Zapisane filtry…'), Object.keys(cfg.presets).map((n) => el('option', { value: n }, n)));
    presetSel.onchange = () => { if (!presetSel.value) return; cfg.filter = structuredClone(cfg.presets[presetSel.value]); config.save(); draw(); };
    const presetRow = el('div', { style: { display: 'flex', gap: '6px', marginBottom: '8px' } }, presetSel,
      el('button', { class: 'mp-mini', title: 'Zapisz obecne filtry', onclick: () => { const n = prompt('Nazwa zestawu filtrów:'); if (n) { cfg.presets[n] = structuredClone(cfg.filter); config.save(); draw(); } } }, 'Zapisz'),
      el('button', { class: 'mp-mini', title: 'Usuń wybrany', onclick: () => { if (presetSel.value) { delete cfg.presets[presetSel.value]; config.save(); draw(); } } }, 'Usuń'),
      el('button', { class: 'mp-mini', onclick: () => { cfg.filter = structuredClone(F0); config.save(); draw(); } }, 'Reset'));
    b.append(presetRow, el('div', { class: 'mp-filters' },
      inp('nick', 'Nick zawiera…'), inp('clan', 'Klan zawiera…'),
      inp('lvlMin', 'Lvl od', 'number'), inp('lvlMax', 'Lvl do', 'number'),
      sel('rel', [['all', 'Wszyscy'], ['enemy', 'Obcy (nie swoi)'], ['tagged', 'Oznaczeni wrogowie'], ['friendly', 'Swoi'], ['clan', 'Klan'], ['friend', 'Znajomi'], ['ally', 'Sojusz']]),
      sel('sort', [['dist', 'Sortuj: odległość'], ['lvl', 'Sortuj: poziom'], ['nick', 'Sortuj: nick']]),
      profs));
    countEl = el('div', { class: 'mp-dim', style: { margin: '2px 0 6px', fontSize: '11.5px' } });
    listBox = el('div', { class: 'mp-plist' });
    b.append(countEl, listBox);
    drawList();
  }
  function drawList() {
    if (!listBox || !listBox.isConnected) return;
    const l = filtered();
    countEl.textContent = `Na mapie: ${game.others().length} · po filtrach: ${l.length}`;
    listBox.innerHTML = '';
    if (!l.length) { listBox.appendChild(el('div', { class: 'mp-dim', style: { padding: '8px' } }, 'Nikogo nie ma.')); return; }
    for (const p of l.slice(0, 80)) {
      const [cls, tl] = relTag(p);
      const row = el('div', { class: 'mp-prow', 'data-pid': p.id },
        el('span', { class: 'mp-dim', style: { width: '26px', fontSize: '11px' } }, p.prof.toUpperCase()),
        el('span', { class: 'n', title: p.clanName ? `${p.nick} [${p.clanName}]` : p.nick }, `${p.nick} `, el('span', { class: 'mp-dim', style: { fontWeight: 400 } }, `(${p.lvl})`)),
        cls ? el('span', { class: 'tag ' + cls }, tl) : null,
        el('span', { class: 'mp-dim', style: { fontSize: '11px', width: '34px', textAlign: 'right' } }, p.d.toFixed(1)),
        addons.on('napad') && !isFriendly(p) ? el('button', { class: 'mp-mini', title: 'Napad', onclick: () => MP.napad.attack(game.otherById(p.id), 'key') }, icon('napad', 12)) : null,
        addons.on('cook') ? el('button', { class: 'mp-mini', title: 'Zaproś do grupy', onclick: () => net.send('partyInvite', { id: p.id }, { src: 'Kto tu jest?' }) }, icon('cook', 12)) : null);
      if (addons.on('pokazeq')) row.addEventListener('mouseenter', (e) => MP.pokazEq && MP.pokazEq.show(p.id, e.clientX + 16, e.clientY));
      if (addons.on('pokazeq')) row.addEventListener('mouseleave', () => MP.pokazEq && MP.pokazEq.hide());
      listBox.appendChild(row);
    }
  }

  defineAddon({
    id: 'ktotu', name: 'Kto tu jest?', icon: 'ktotu', color: ['#3fa2ff', '#2a6fd6'],
    desc: 'Lista graczy na mapie z wieloma filtrami (nick, klan, poziom, profesja, relacja) i zapisywanymi zestawami filtrów.',
    defaults: { enabled: true, key: '', filter: structuredClone(F0), presets: {} },
    keys: [{ key: 'key', label: 'pokaż/ukryj listę', fn: () => toggle() }],
    settings: [{ key: 'key', type: 'key', label: 'Klawisz: pokaż/ukryj listę graczy' }],
    render(box) { box.appendChild(el('div', { class: 'mp-btns' }, el('button', { class: 'mp-btn pri', onclick: () => open() }, 'Otwórz listę graczy'))); },
    init(c) { cfg = c; },
    onToggle(on) { if (!on) close(); },
  });
})();

/* ───────── Kto złapie ─────────
 * W oknie łupu pod każdym przedmiotem pokazuje szansę na złapanie przy biciu w grupie (≈ 1 / liczba chętnych).
 */
(() => {
  let cfg, obs = null, declined = new Set();

  function partyCount() {
    const ids = game.partyMembers();
    if (!ids.length) return 1;
    let n = ids.length;
    if (cfg.onlyOnMap) {
      const here = new Set(game.others().map((p) => p.id));
      const h = game.hero();
      n = ids.filter((id) => id === (h && h.id) || here.has(id)).length || 1;
    }
    return Math.max(1, n - declined.size);
  }

  function decorate() {
    const sel = cfg.lootSelector.split('\n').map((s) => s.trim()).filter(Boolean).join(',');
    if (!sel) return;
    const wins = $$(sel).filter(isVisible);
    document.querySelectorAll('.mp-ibadge.chance').forEach((b) => { if (!wins.some((w) => w.contains(b))) b.remove(); });
    if (!wins.length) return;
    const n = partyCount();
    const pct = Math.round(1000 / n) / 10;
    for (const w of wins) {
      for (const it of $$('.item', w)) {
        if (getComputedStyle(it).position === 'static') it.style.position = 'relative';
        let b = it.querySelector(':scope > .mp-ibadge.chance');
        if (!b) { b = el('div', { class: 'mp-ibadge chance' }); it.appendChild(b); }
        b.textContent = `${pct}%`;
        b.title = n === 1 ? 'Jesteś sam — przedmiot jest Twój' : `Przybliżenie: 1 / ${n} osób w grupie`;
      }
    }
  }

  defineAddon({
    id: 'ktozlapie', name: 'Kto złapie', icon: 'ktozlapie', color: ['#ffd84a', '#e0a400'],
    desc: 'Pod kafelkami łupu pokazuje Twoją szansę (%) na złapanie przedmiotu przy biciu w grupie.',
    defaults: { enabled: true, onlyOnMap: true, lootSelector: '.loot-wnd\n.loots-window\n.loot-window' },
    notes: () => [{ type: 'info', text: 'To przybliżenie: zakłada równą szansę dla wszystkich członków grupy (opcjonalnie tylko tych na tej samej mapie). Jeśli liczby się nie pojawiają, sprawdź selektor okna łupu (F12 → wskaż okno łupu).' }],
    settings: [
      { key: 'onlyOnMap', type: 'bool', label: 'Licz tylko członków grupy na tej samej mapie' },
      { key: 'lootSelector', type: 'textarea', label: 'Selektor okna łupu' },
    ],
    init(c) {
      cfg = c;
      const run = debounce(() => { if (cfg.enabled) decorate(); }, 120);
      obs = new MutationObserver(run);
      obs.observe(document.body, { childList: true, subtree: true });
      bus.on('battle:start', () => declined.clear());
    },
  });
})();

/* ───────── Let's Cook Together ─────────
 * Zaproszenia do grupy pod klawisz (znajomi / klan / sojusz / wszyscy na mapie), rozwiązanie grupy pod klawisz,
 * opcjonalnie automatyczne zapraszanie nowych osób na mapie (AUTOMAT, domyślnie wyłączony).
 */
(() => {
  let cfg, invited = {};

  function eligible() {
    const h = game.hero(); if (!h) return [];
    const inParty = new Set(game.partyMembers());
    return game.others().filter((p) => {
      if (inParty.has(p.id)) return false;
      if (nickIn(cfg.never, p.nick)) return false;
      if (cfg.range > 0 && game.dist(h, p) > cfg.range) return false;
      if (cfg.everyone) return true;
      return (cfg.friends && p.isFriend) || (cfg.clan && p.isClan) || (cfg.allies && p.isAlly) || nickIn(cfg.always, p.nick);
    });
  }

  function inviteAll(src = 'Cook') {
    const cool = src === 'auto' ? 10 * 60000 : 30000; // automat nie męczy tej samej osoby częściej niż co 10 min
    const l = eligible().filter((p) => !(invited[p.id] > now() - cool));
    const room = Math.max(0, cfg.maxParty - Math.max(1, game.partyMembers().length));
    const pick = l.slice(0, room || l.length);
    if (!pick.length) { if (src === 'Cook') toast('Let\'s Cook: nikogo do zaproszenia', 'warn', 1600); return; }
    pick.forEach((p) => { invited[p.id] = now(); net.send('partyInvite', { id: p.id }, { src: 'Let\'s Cook' }); });
    toast(`Let's Cook: zapraszam ${pick.length} os.`, 'ok', 1800);
  }

  async function disband() {
    if (!game.partyMembers().length) { toast('Nie masz grupy', 'warn', 1500); return; }
    await net.send('partyDisband', {}, { src: 'Let\'s Cook' });
    toast('Rozwiązuję grupę', 'ok', 1500);
  }
  MP.cook = { disband };

  defineAddon({
    id: 'cook', name: 'Let\'s Cook Together', icon: 'cook', color: ['#ff8a5c', '#e2533a'], risk: 'auto',
    desc: 'Zaproszenia do grupy pod klawisz dla znajomych, klanowiczów, sojuszników albo wszystkich na mapie oraz rozwiązanie grupy pod klawisz.',
    defaults: { keyInvite: '', keyDisband: '', friends: true, clan: true, allies: false, everyone: false, always: [], never: [], range: 0, maxParty: 10, auto: false },
    keys: [
      { key: 'keyInvite', label: 'zaproś', fn: () => inviteAll() },
      { key: 'keyDisband', label: 'rozwiąż grupę', fn: () => disband() },
    ],
    notes: () => [!net.cmd('partyDisband').verified ? { type: 'info', text: 'Komenda rozwiązania grupy jest domyślna (niezweryfikowana). Jeśli nie działa: rozwiąż raz grupę ręcznie i przypisz komendę w Diagnostyka → Podsłuch.' } : null],
    settings: [
      { group: 'Klawisze', key: 'keyInvite', type: 'key', label: 'Klawisz: zaproś do grupy' },
      { group: 'Klawisze', key: 'keyDisband', type: 'key', label: 'Klawisz: rozwiąż grupę' },
      { group: 'Kogo zapraszać', key: 'friends', type: 'bool', label: 'Znajomych' },
      { group: 'Kogo zapraszać', key: 'clan', type: 'bool', label: 'Klanowiczów' },
      { group: 'Kogo zapraszać', key: 'allies', type: 'bool', label: 'Sojuszników' },
      { group: 'Kogo zapraszać', key: 'everyone', type: 'bool', label: 'Wszystkich na mapie' },
      { group: 'Kogo zapraszać', key: 'always', type: 'list', label: 'Zawsze zapraszaj (nicki)' },
      { group: 'Kogo zapraszać', key: 'never', type: 'list', label: 'Nigdy nie zapraszaj (nicki)' },
      { group: 'Kogo zapraszać', key: 'range', type: 'number', label: 'Zasięg (kratki, 0 = cała mapa)', min: 0, max: 100 },
      { group: 'Kogo zapraszać', key: 'maxParty', type: 'number', label: 'Maksymalny rozmiar grupy', min: 2, max: 10 },
      { group: 'Automat', key: 'auto', type: 'bool', auto: true, label: 'Automatycznie zapraszaj, gdy ktoś pasujący pojawi się na mapie', confirm: 'To automatyzacja — zaproszenia będą wysyłane bez Twojego kliknięcia. Na własne ryzyko.', countdown: 2 },
    ],
    render(box) {
      box.appendChild(el('div', { class: 'mp-btns' },
        el('button', { class: 'mp-btn pri', onclick: () => inviteAll() }, 'Zaproś teraz'),
        el('button', { class: 'mp-btn', onclick: () => disband() }, 'Rozwiąż grupę')));
    },
    init(c) {
      cfg = c;
      setInterval(() => { if (cfg.enabled && cfg.auto && game.ready() && !game.inBattle()) inviteAll('auto'); }, 3000);
      bus.on('map:change', () => { invited = {}; });
    },
  });
})();
