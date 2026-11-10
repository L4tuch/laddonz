/* ───────── Kto tu jest? ─────────
 * Lista graczy na mapie + filtry i zapisane zestawy filtrów. Tryb minimalny: sama lista po filtrach.
 * Kliknięcie gracza → karta z informacjami i akcjami (EQ, Dobij, zaproś, znajomi, Bratan…).
 */
(() => {
  let cfg, timer = null, win = null, openId = null;
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
    win = floatWin({ id: 'ktotu', title: 'Kto tu jest?', iconName: 'ktotu', color: ['#3fa2ff', '#2a6fd6'], x: 90, y: 140, width: cfg.minimal ? 250 : 380, onClose: () => { clearInterval(timer); win = null; } });
    win.win.style.width = (cfg.minimal ? 250 : 380) + 'px';
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
    const modeBtn = el('button', { class: 'mp-mini', title: cfg.minimal ? 'Pokaż filtry' : 'Tryb minimalny (sama lista)', onclick: () => { cfg.minimal = !cfg.minimal; config.save(); open(); } }, cfg.minimal ? 'Filtry' : 'Minimalny');
    countEl = el('span', { class: 'mp-dim', style: { fontSize: '11.5px', flex: 1 } });
    b.appendChild(el('div', { style: { display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' } }, countEl, modeBtn));
    if (!cfg.minimal) {
      const inp = (k, ph, type = 'text') => { const i = el('input', { class: 'mp-in', placeholder: ph, type, value: f[k] || '' }); i.addEventListener('input', () => { f[k] = type === 'number' ? Number(i.value) || 0 : i.value; save(); }); i.addEventListener('keydown', (e) => e.stopPropagation()); return i; };
      const sel = (k, opts) => { const s = el('select', { class: 'mp-in' }, opts.map(([v, l]) => { const o = el('option', { value: v }, l); if (f[k] === v) o.selected = true; return o; })); s.onchange = () => { f[k] = s.value; save(); }; return s; };
      const profs = el('div', { class: 'mp-profs' }, Object.entries(game.PROF_NAMES).map(([k, n]) => {
        const bt = el('button', { class: 'mp-pf' + (f.profs.includes(k) ? ' on' : ''), title: n }, n);
        bt.onclick = () => { const i = f.profs.indexOf(k); if (i < 0) f.profs.push(k); else f.profs.splice(i, 1); bt.classList.toggle('on'); save(); };
        return bt;
      }));
      const presetSel = el('select', { class: 'mp-in', style: { flex: 1 } }, el('option', { value: '' }, 'Zapisane filtry…'), Object.keys(cfg.presets).map((n) => el('option', { value: n }, n)));
      presetSel.onchange = () => { if (!presetSel.value) return; cfg.filter = structuredClone(cfg.presets[presetSel.value]); config.save(); draw(); };
      b.append(el('div', { style: { display: 'flex', gap: '6px', marginBottom: '8px' } }, presetSel,
        el('button', { class: 'mp-mini', onclick: async () => { const n = await promptBox({ title: 'Zapisz filtry', label: 'Nazwa zestawu filtrów:', placeholder: 'np. wrogowie 80+' }); if (n) { cfg.presets[n] = structuredClone(cfg.filter); config.save(); draw(); } } }, 'Zapisz'),
        el('button', { class: 'mp-mini', onclick: () => { if (presetSel.value) { delete cfg.presets[presetSel.value]; config.save(); draw(); } } }, 'Usuń'),
        el('button', { class: 'mp-mini', onclick: () => { cfg.filter = structuredClone(F0); config.save(); draw(); } }, 'Reset')),
      el('div', { class: 'mp-filters' },
        inp('nick', 'Nick zawiera…'), inp('clan', 'Klan zawiera…'),
        inp('lvlMin', 'Lvl od', 'number'), inp('lvlMax', 'Lvl do', 'number'),
        sel('rel', [['all', 'Wszyscy'], ['enemy', 'Obcy (nie swoi)'], ['tagged', 'Oznaczeni wrogowie'], ['friendly', 'Swoi'], ['clan', 'Klan'], ['friend', 'Znajomi'], ['ally', 'Sojusz']]),
        sel('sort', [['dist', 'Sortuj: odległość'], ['lvl', 'Sortuj: poziom'], ['nick', 'Sortuj: nick']]),
        profs));
    }
    listBox = el('div', { class: 'mp-plist' + (cfg.minimal ? ' mini' : '') });
    b.append(listBox);
    drawList();
  }

  function card(p) {
    const [cls, tl] = relTag(p);
    const ncfg = addons.cfg('napad') || {};
    const bcfg = addons.cfg('bratan') || {};
    const isTarget = nickIn(ncfg.targetList, p.nick);
    const isProt = nickIn(bcfg.nicks, p.nick);
    const btn = (label, ic, fn, title) => el('button', { class: 'mp-btn', style: { padding: '5px 9px', fontSize: '11.5px' }, title: title || label, onclick: (e) => { e.stopPropagation(); fn(e); } }, ic ? icon(ic, 13) : null, label);
    const togList = (c, key, nick, on) => { c[key] = (c[key] || []).filter((n) => n.toLowerCase() !== nick.toLowerCase()); if (!on) c[key].push(nick); config.save(); drawList(true); };
    return el('div', { class: 'mp-pcard' },
      el('div', { class: 'mp-pinfo' },
        el('span', null, game.PROF_NAMES[p.prof] || p.prof || '?'), el('span', null, `poziom ${p.lvl}`),
        p.clanName ? el('span', null, `klan: ${p.clanName}`) : null,
        cls ? el('span', { class: 'tag ' + cls }, tl) : null, el('span', null, `odl. ${p.d.toFixed(1)}`)),
      el('div', { class: 'mp-btns', style: { marginTop: '6px', gap: '5px' } },
        btn('EQ', 'pokazeq', (e) => MP.pokazEq.showForce(p.id, e.clientX + 14, e.clientY - 20)),
        !isFriendly(p) ? btn('Dobij', 'napad', () => MP.napad.attack(game.otherById(p.id) || p, 'key')) : null,
        btn('Zaproś', 'cook', () => net.send('partyInvite', { id: p.id }, { src: 'Kto tu jest?' }).then((r) => r.ok && toast(`Zaproszono ${p.nick}`, 'ok', 1500))),
        !p.isFriend ? btn('Znajomy', 'ktotu', () => net.send('friendAdd', { id: p.id, nick: p.nick }, { src: 'Kto tu jest?' }).then((r) => r.ok && toast(`Wysłano zaproszenie do znajomych: ${p.nick}`, 'ok', 1500)), 'Dodaj do znajomych') : null,
        btn(isProt ? 'Bratan (chroniony)' : 'Bratan', 'bratan', () => togList(bcfg, 'nicks', p.nick, isProt), isProt ? 'Usuń z ochrony Bratana' : 'Chroń przed atakiem (Bratan)'),
                btn('Kopiuj', null, () => { try { navigator.clipboard.writeText(p.nick); toast('Skopiowano nick', 'ok', 1200); } catch {} })));
  }

  function drawList(force) {
    if (!listBox || !listBox.isConnected) return;
    if (!force && listBox.matches(':hover') && openId) return; // nie przerysowuj pod kursorem przy otwartej karcie
    const l = filtered();
    countEl.textContent = `Na mapie: ${game.others().length} · widocznych: ${l.length}`;
    listBox.innerHTML = '';
    if (!l.length) { listBox.appendChild(el('div', { class: 'mp-dim', style: { padding: '8px' } }, 'Nikogo nie ma.')); return; }
    for (const p of l.slice(0, 80)) {
      const [cls, tl] = relTag(p);
      const row = el('div', { class: 'mp-prow' + (openId === p.id ? ' open' : ''), 'data-pid': p.id, onclick: () => { openId = openId === p.id ? null : p.id; drawList(true); } },
        cfg.minimal ? null : el('span', { class: 'mp-dim', style: { width: '22px', fontSize: '11px' } }, p.prof.toUpperCase()),
        el('span', { class: 'n' }, `${p.nick} `, el('span', { class: 'mp-dim', style: { fontWeight: 400 } }, `(${p.lvl}${cfg.minimal ? p.prof : ''})`)),
        cls ? el('span', { class: 'tag ' + cls }, cfg.minimal ? tl[0].toUpperCase() : tl) : null,
        el('span', { class: 'mp-dim', style: { fontSize: '11px', width: '30px', textAlign: 'right' } }, p.d.toFixed(0)));
      listBox.appendChild(row);
      if (openId === p.id) listBox.appendChild(card(p));
    }
  }

  defineAddon({
    id: 'ktotu', name: 'Kto tu jest?', icon: 'ktotu', color: ['#3fa2ff', '#2a6fd6'],
    desc: 'Lista graczy na mapie z filtrami (nick, klan, poziom, profesja, relacja) i zapisywanymi zestawami. Tryb minimalny pokazuje samą listę po filtrach. Kliknij gracza, żeby zobaczyć jego kartę: EQ, Dobij, zaproszenie do grupy i znajomych, Bratan.',
    defaults: { enabled: false, key: '', minimal: false, filter: structuredClone(F0), presets: {} },
    keys: [{ key: 'key', label: 'pokaż/ukryj listę', fn: () => toggle() }],
    notes: () => [!net.cmd('friendAdd').t ? { type: 'info', text: 'Przycisk „Znajomy" zadziała po jednorazowym nauczeniu komendy: dodaj ręcznie kogoś do znajomych, potem Diagnostyka → Podsłuch → „Dodanie do znajomych".' } : null],
    settings: [
      { key: 'key', type: 'key', label: 'Klawisz: pokaż/ukryj listę graczy' },
      { key: 'minimal', type: 'bool', label: 'Tryb minimalny (sama lista po filtrach)' },
    ],
    render(box) { box.appendChild(el('div', { class: 'mp-btns' }, el('button', { class: 'mp-btn pri', onclick: () => open() }, 'Otwórz listę graczy'))); },
    init(c) { cfg = c; },
    onToggle(on) { if (!on) close(); },
    onChange() { if (win) open(); },
  });
})();

/* ───────── Kto złapie ─────────
 * W oknie łupu pod każdym przedmiotem pokazuje Twoją szansę na złapanie: 1 / liczba graczy z Twojej drużyny,
 * którzy brali udział w walce (tylko oni dostają łup). Bez ustawień.
 */
(() => {
  let cfg, last = { n: 0, ids: [], t: 0 };
  const LOOT_SEL = '.loot-wnd, .loots-window, .loot-window, [class*="loot-window"], [class*="loots-window"]';

  /** Gracze (bez NPC i towarzyszy) z drużyny bohatera w bieżącej walce. */
  function fighters() {
    const b = E() && E().battle;
    if (!b) return null;
    const h = game.hero(); if (!h) return null;
    let ws = b.warriorsList || b.warriors;
    try { if (typeof ws === 'function') ws = ws.call(b); } catch { ws = null; }
    const arr = Array.isArray(ws) ? ws : Object.values(ws || {});
    if (!arr.length) return null;
    const f = (w, k) => (w && w[k] !== undefined ? w[k] : w && w.d ? w.d[k] : undefined);
    const idOf = (w) => Number(f(w, 'id'));
    const me = arr.find((w) => idOf(w) === h.id || f(w, 'name') === h.nick || f(w, 'nick') === h.nick);
    let myTeam = me ? f(me, 'team') : undefined;
    if (myTeam === undefined) { try { myTeam = typeof b.myteam === 'function' ? b.myteam() : b.myteam; } catch {} }
    const isPlayer = (w) => {
      const id = idOf(w);
      if (!(id > 0)) return false;                                   // NPC mają ujemne id
      if (f(w, 'npc') || f(w, 'isNpc') || f(w, 'pet') || f(w, 'isPet') || f(w, 'companion')) return false;
      const t = String(f(w, 'type') || f(w, 'kind') || '').toLowerCase();
      if (t && /npc|pet|mob|companion|towarz/.test(t)) return false;
      return true;
    };
    const ids = arr.filter((w) => (myTeam === undefined || f(w, 'team') === myTeam) && isPlayer(w)).map(idOf);
    if (!ids.includes(h.id)) ids.push(h.id);
    return [...new Set(ids)];
  }

  /** Zapamiętujemy uczestników przez całą walkę — okno łupu pojawia się już po niej. */
  function snapshot() {
    const ids = fighters();
    if (ids && ids.length) last = { n: ids.length, ids, t: now() };
  }

  function count() {
    const ids = fighters();
    if (ids && ids.length) { last = { n: ids.length, ids, t: now() }; return ids.length; }
    if (last.n && now() - last.t < 5 * 60000) return last.n;
    return 1;
  }

  function decorate() {
    const wins = $$(LOOT_SEL).filter(isVisible);
    document.querySelectorAll('.mp-ibadge.chance').forEach((b) => { if (!wins.some((w) => w.contains(b))) b.remove(); });
    if (!wins.length) return;
    const n = count();
    const pct = Math.round(1000 / n) / 10;
    for (const w of wins) {
      for (const it of $$('.item', w)) {
        if (getComputedStyle(it).position === 'static') it.style.position = 'relative';
        let b = it.querySelector(':scope > .mp-ibadge.chance');
        if (!b) { b = el('div', { class: 'mp-ibadge chance' }); it.appendChild(b); }
        b.textContent = `${pct}%`;
        b.title = n === 1 ? 'Walczyłeś sam — przedmiot jest Twój' : `1 / ${n} graczy z Twojej drużyny w walce`;
      }
    }
  }

  defineAddon({
    id: 'ktozlapie', name: 'Kto złapie', icon: 'ktozlapie', color: ['#ffd84a', '#e0a400'],
    desc: 'Pod kafelkami łupu pokazuje Twoją szansę (%) na złapanie przedmiotu: liczone są tylko osoby z Twojej drużyny, które brały udział w walce — tylko one dostają łup.',
    defaults: { enabled: false },
    init(c) {
      cfg = c;
      if ('onlyOnMap' in c || 'lootSelector' in c) { delete c.onlyOnMap; delete c.lootSelector; config.save(); }
      const run = debounce(() => { if (cfg.enabled) decorate(); }, 120);
      new MutationObserver(run).observe(document.body, { childList: true, subtree: true });
      bus.on('battle:start', () => { last = { n: 0, ids: [], t: 0 }; });
      setInterval(() => { if (cfg.enabled && game.ready() && E().battle && (game.inBattle() || (typeof E().battle.isBattleShow === 'function' && E().battle.isBattleShow()))) snapshot(); }, 500);
      bus.on('battle:end', () => { if (cfg.enabled) snapshot(); });
      MP.ktozlapie = { fighters, last: () => last };
    },
  });
})();

/* ───────── Let's Cook Together ─────────
 * Zaproszenia do grupy pod klawisz (znajomi / klan / sojusz / wszyscy na mapie) i rozwiązanie grupy pod klawisz.
 * Bez automatów — każde zaproszenie wysyłasz sam (klawisz albo przycisk).
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

  function inviteAll() {
    const l = eligible().filter((p) => !(invited[p.id] > now() - 30000));   // tej samej osoby nie częściej niż co 30 s
    const room = Math.max(0, cfg.maxParty - Math.max(1, game.partyMembers().length));
    const pick = l.slice(0, room || l.length);
    if (!pick.length) { toast('Let\'s Cook: nikogo do zaproszenia', 'warn', 1600); return; }
    pick.forEach((p) => { invited[p.id] = now(); net.send('partyInvite', { id: p.id }, { src: 'Let\'s Cook' }); });
    toast(`Let's Cook: zapraszam ${pick.length} os.`, 'ok', 1800);
  }

  async function disband() {
    if (!game.partyMembers().length) { toast('Nie masz grupy', 'warn', 1500); return; }
    await net.send('partyDisband', {}, { src: 'Let\'s Cook', urgent: true });
    toast('Rozwiązuję grupę', 'ok', 1500);
  }
  MP.cook = { disband };

  defineAddon({
    id: 'cook', name: 'Let\'s Cook Together', icon: 'cook', color: ['#ff8a5c', '#e2533a'],
    desc: 'Zaproszenia do grupy pod klawisz dla znajomych, klanowiczów, sojuszników albo wszystkich na mapie oraz rozwiązanie grupy pod klawisz.',
    defaults: { keyInvite: '', keyDisband: '', friends: true, clan: true, allies: false, everyone: false, always: [], never: [], range: 0, maxParty: 10 },
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
    ],
    render(box) {
      box.appendChild(el('div', { class: 'mp-btns' },
        el('button', { class: 'mp-btn pri', onclick: () => inviteAll() }, 'Zaproś teraz'),
        el('button', { class: 'mp-btn', onclick: () => disband() }, 'Rozwiąż grupę')));
    },
    init(c) {
      cfg = c;
      if ('auto' in c) { delete c.auto; config.save(); }   // usunięty automat z wcześniejszych wersji
      bus.on('map:change', () => { invited = {}; });
    },
  });
})();
