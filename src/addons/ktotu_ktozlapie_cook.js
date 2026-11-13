/* ───────── Gracze na mapie+ ─────────
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
    win = floatWin({ id: 'ktotu', title: 'Gracze na mapie+', iconName: 'ktotu', color: ['#3fa2ff', '#2a6fd6'], x: 90, y: 140, width: cfg.minimal ? 250 : 380, onClose: () => { clearInterval(timer); win = null; } });
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
        btn('Zaproś', 'cook', () => net.send('partyInvite', { id: p.id }, { src: 'Gracze na mapie+' }).then((r) => r.ok && toast(`Zaproszono ${p.nick}`, 'ok', 1500))),
        !p.isFriend ? btn('Znajomy', 'ktotu', async () => {
          // jak gracz: opcja „Dodaj do znajomych" z menu gracza w grze
          const ok = await menus.choosePlayerOption(p.id, /znajom/i);
          if (ok) toast(`Wysłano zaproszenie do znajomych: ${p.nick}`, 'ok', 1500);
          else if (net.cmd('friendAdd').t) net.send('friendAdd', { id: p.id, nick: p.nick }, { src: 'Gracze na mapie+' });
          else toast('Nie znalazłam opcji „Dodaj do znajomych" w menu tego gracza', 'warn');
        }, 'Dodaj do znajomych') : null,
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
    id: 'ktotu', name: 'Gracze na mapie+', icon: 'ktotu', color: ['#3fa2ff', '#2a6fd6'],
    desc: 'Przejrzysta lista wszystkich graczy na mapie. Możesz ją filtrować po nicku, klanie, poziomie, profesji i relacji oraz zapisywać ulubione filtry. Po kliknięciu gracza zobaczysz jego kartę z ekwipunkiem i szybkimi akcjami: dobijaniem, zaproszeniem do grupy i do znajomych.',
    defaults: { enabled: false, key: '', minimal: false, filter: structuredClone(F0), presets: {} },
    keys: [{ key: 'key', label: 'pokaż/ukryj listę', fn: () => toggle() }],
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
 * Pod każdym przedmiotem w oknie łupu: Twoja szansa na złapanie.
 * Liczeni są gracze z Twojej drużyny, którzy brali udział w walce (polegli też).
 * Zasady łupu Margonem: przy przedmiocie z wymaganiem profesji pierwszeństwo mają gracze tej profesji —
 * jeśli ktoś taki był w walce, tylko oni się liczą; jeśli nie było nikogo — losują wszyscy. Bez ustawień.
 */
(() => {
  let cfg, last = { ids: [], prof: {}, t: 0 };
  const LOOT_SEL = '.loot-wnd, .loots-window, .loot-window, [class*="loot-window"], [class*="loots-window"]';

  const PROF_BY_NAME = { wojownik: 'w', paladyn: 'p', 'tancerz ostrzy': 'b', 'tancerka ostrzy': 'b', mag: 'm', tropiciel: 't', tropicielka: 't', 'łowca': 'h', 'łowczyni': 'h', lowca: 'h' };
  /** Profesja członka grupy z okna grupy gry: wiersz „Nick (41p)". */
  function profFromParty(id) {
    const row = document.querySelector(`[class*="other-party-id-${id}"]`);
    const m = row && (row.textContent || '').match(/\(\s*\d+\s*([wpbmth])\s*\)/i);
    return m ? m[1].toLowerCase() : '';
  }
  /** Gracze (bez NPC i towarzyszy) z drużyny bohatera w bieżącej walce: [{ id, prof }]. */
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
    const sameTeam = (w) => myTeam === undefined || myTeam === null || String(f(w, 'team')) === String(myTeam);
    const party = new Set(game.partyMembers());
    const out = {};
    for (const w of arr) {
      const id = idOf(w);
      if (!((sameTeam(w) && isPlayer(w)) || party.has(id))) continue;
      const o = game.otherById(id);
      out[id] = String(f(w, 'prof') || (o && o.prof) || (id === h.id ? h.prof : '') || profFromParty(id) || '');
    }
    out[h.id] = h.prof || out[h.id] || '';
    return out;
  }

  /** Zbieramy wszystkich uczestników przez całą walkę (polegli też dostają łup). */
  function snapshot() {
    const fs = fighters();
    if (!fs) return;
    const prof = Object.assign({}, last.prof);
    for (const [id, p] of Object.entries(fs)) prof[id] = p || prof[id] || '';
    last = { ids: Object.keys(prof).map(Number), prof, t: now() };
  }
  function participants() {
    snapshot();
    for (const id of last.ids) if (!last.prof[id]) { const o = game.otherById(id); last.prof[id] = (o && o.prof) || profFromParty(id) || ''; }
    if (last.ids.length && now() - last.t < 5 * 60000) return last;
    // nie udało się odczytać walki — członkowie grupy
    const h = game.hero();
    const ids = game.partyMembers().length ? game.partyMembers() : [h && h.id].filter(Boolean);
    const prof = {};
    ids.forEach((id) => { const o = game.otherById(id); prof[id] = id === (h && h.id) ? h.prof : ((o && o.prof) || profFromParty(id)); });
    return { ids, prof };
  }

  /** Profesje przedmiotu (statystyka „reqp", np. „wp"); null = bez wymagań; undefined = jeszcze nie wiadomo. */
  const reqCache = new Map();
  function reqProfs(node) {
    const id = game.itemIdFromEl(node);
    if (id && reqCache.has(id)) return reqCache.get(id);
    let it = id ? game.itemById(id) : null;
    if (!it && MP.anyLookup) it = MP.anyLookup(node, id);
    if (it && it.stats) {
      const r = it.stats.reqp || it.stats.reqprof || '';
      const v = r ? String(r).toLowerCase().replace(/[^a-z]/g, '').split('') : null;
      if (id) reqCache.set(id, v);
      return v;
    }
    readFromTip(node, id);       // brak danych przedmiotu — odczyt z opisu przedmiotu (dymka gry)
    return undefined;
  }
  /** „Wymagana profesja: Wojownik, Paladyn" z dymka gry nad przedmiotem. */
  const tipBusy = new Set();
  const tipTries = new Map();
  function readFromTip(node, id) {
    if (!id || tipBusy.has(id)) return;
    // najwyżej 2 próby odczytu dymka na przedmiot — potem liczymy bez wymagań (wcześniej „…” wisiało,
    // a ciągłe wywoływanie dymka zjadało klatki, zwłaszcza przy efektach Legendarnego Łupu)
    const n = (tipTries.get(id) || 0) + 1;
    tipTries.set(id, n);
    if (n > 2) { reqCache.set(id, null); return; }
    tipBusy.add(id);
    const r = node.getBoundingClientRect();
    const opt = { bubbles: true, cancelable: true, view: W, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
    ['mouseover', 'mouseenter', 'mousemove'].forEach((t) => node.dispatchEvent(new MouseEvent(t, opt)));
    setTimeout(() => {
      let v = null;
      const tip = $$('.tip-wrapper').find((n) => isVisible(n) && !n.closest('#mp-eqtip'));
      const txt = tip ? (tip.textContent || '') : '';
      const m = txt.match(/Wymagana profesja:\s*([^\n]+?)(?:Wymagany|Warto|$)/i);
      if (m) v = Object.entries(PROF_BY_NAME).filter(([name]) => new RegExp(name, 'i').test(m[1])).map(([, l]) => l);
      if (m && !v.length) v = null;
      if (tip) reqCache.set(id, v && v.length ? [...new Set(v)] : null);
      ['mouseout', 'mouseleave'].forEach((t) => node.dispatchEvent(new MouseEvent(t, opt)));
      tipBusy.delete(id);
      decorate();
    }, 120);
  }

  function decorate() {
    const wins = $$(LOOT_SEL).filter(isVisible);
    document.querySelectorAll('.mp-ibadge.chance').forEach((b) => { if (!wins.some((w) => w.contains(b))) b.remove(); });
    if (!wins.length) return;
    const P = participants();
    // szansa ma sens tylko w grupie — przy walce w pojedynkę nic nie pokazujemy
    if (P.ids.length < 2 && !game.partyMembers().length) { document.querySelectorAll('.mp-ibadge.chance').forEach((b) => b.remove()); return; }
    const h = game.hero();
    for (const w of wins) {
      for (const it of $$('.item', w)) {
        const req = reqProfs(it);
        if (req === undefined) {           // czekamy na odczyt wymagań — nie pokazujemy błędnego wyniku
          if (getComputedStyle(it).position === 'static') it.style.position = 'relative';
          let b0 = it.querySelector(':scope > .mp-ibadge.chance');
          if (!b0) { b0 = el('div', { class: 'mp-ibadge chance' }); it.appendChild(b0); }
          b0.textContent = '…'; b0.title = 'Sprawdzam wymagania przedmiotu';
          continue;
        }
        // Zasady łupu: gracze z profesją pasującą do przedmiotu losują PIERWSI. Gdy w walce nie ma nikogo
        // z pasującą profesją — przedmiot losują wszyscy uczestnicy. Przedmiot bez wymagań — wszyscy.
        const matching = req ? P.ids.filter((id) => req.includes(String(P.prof[id] || '').toLowerCase())) : [];
        const priority = !!(req && matching.length);
        const eligible = priority ? matching : P.ids;
        const meOk = !priority || req.includes(String(h && h.prof || '').toLowerCase());
        const n = Math.max(1, eligible.length);
        const pct = meOk ? Math.round(1000 / n) / 10 : 0;
        if (getComputedStyle(it).position === 'static') it.style.position = 'relative';
        let b = it.querySelector(':scope > .mp-ibadge.chance');
        if (!b) { b = el('div', { class: 'mp-ibadge chance' }); it.appendChild(b); }
        b.textContent = `${pct}%`;
        b.classList.toggle('zero', !meOk);
        const profNames = req ? req.map((p) => game.PROF_NAMES[p] || p).join(', ') : '';
        b.title = !meOk ? `Pierwszeństwo mają: ${profNames} (${matching.length} w walce) — Twoja szansa praktycznie zerowa`
          : priority ? (n === 1 ? `Przedmiot dla: ${profNames} — jesteś jedyną taką osobą w walce` : `1 / ${n} — pierwszeństwo: ${profNames}`)
          : req ? `Nikt w walce nie ma profesji ${profNames} — losują wszyscy: 1 / ${n}`
          : n === 1 ? 'Przedmiot jest Twój' : `1 / ${n} graczy z drużyny w walce`;
      }
    }
  }

  defineAddon({
    id: 'ktozlapie', name: 'Kto złapie', icon: 'ktozlapie', color: ['#ffd84a', '#e0a400'],
    desc: 'Przy oknie łupu pokazuje, jaką masz szansę na zdobycie każdego przedmiotu. Uwzględnia członków drużyny, którzy brali udział w walce, oraz pierwszeństwo profesji.',
    defaults: { enabled: false },
    init(c) {
      cfg = c;
      if ('onlyOnMap' in c || 'lootSelector' in c) { delete c.onlyOnMap; delete c.lootSelector; config.save(); }
      const run = debounce(() => { if (cfg.enabled) decorate(); }, 120);
      // tylko zmiany poza dymkami gry i poza naszymi znaczkami — inaczej odczyt dymka wywoływał kolejne przeliczenia w kółko
      const skip = (n) => n && n.nodeType === 1 && (n.closest('.tip-wrapper, .mp-ibadge, .mp-lg-cv, .mp-lg-cap, #mp-eqtip') || n.classList.contains('mp-ibadge'));
      new MutationObserver((muts) => {
        if (!cfg.enabled || !document.querySelector(LOOT_SEL)) return;
        if (muts.every((m) => skip(m.target) || [...m.addedNodes, ...m.removedNodes].every((x) => x.nodeType !== 1 || skip(x)))) return;
        run();
      }).observe(document.body, { childList: true, subtree: true });
      bus.on('battle:start', () => { last = { ids: [], prof: {}, t: 0 }; });
      setInterval(() => { if (cfg.enabled && game.ready() && E().battle && (game.inBattle() || (typeof E().battle.isBattleShow === 'function' && E().battle.isBattleShow()))) snapshot(); }, 500);
      bus.on('battle:end', () => { if (cfg.enabled) snapshot(); });
      MP.ktozlapie = { fighters, participants, debug: () => ({ uczestnicy: participants(), wymagania: Object.fromEntries(reqCache) }) };
    },
  });
})();

/* ───────── Lepsza Grupa (dawniej Let's Cook Together) ─────────
 * Zaproszenia do grupy pod klawisz (znajomi / klan / sojusz / wszyscy na mapie) i rozwiązanie grupy pod klawisz.
 * Bez automatów — każde zaproszenie wysyłasz sam (klawisz albo przycisk).
 */
(() => {
  let cfg, invited = {}, drawList = () => {};

  /** Nicki znajomych z listy znajomych gry (Engine.society) — dodatkowe źródło obok relacji gracza. */
  let frCache = { t: 0, set: new Set() };
  function friendNicks() {
    if (now() - frCache.t < 5000) return frCache.set;
    const out = new Set();
    const walk = (o, d, inFr) => {
      if (!o || typeof o !== 'object' || d > 4 || o instanceof Node) return;
      if (inFr && typeof (o.nick || o.name) === 'string' && (o.id || o.id === 0 || o.nick)) out.add(String(o.nick || o.name).toLowerCase());
      for (const [k, v] of Object.entries(o)) if (v && typeof v === 'object') walk(v, d + 1, inFr || /friend|przyjac|znajom|^fr$/i.test(k));
    };
    try { walk(E().society, 0, false); } catch {}
    frCache = { t: now(), set: out };
    return out;
  }
  const isFriendP = (p) => p.isFriend || friendNicks().has(String(p.nick).toLowerCase());

  function eligible() {
    const h = game.hero(); if (!h) return [];
    const inParty = new Set(game.partyMembers());
    return game.others().filter((p) => {
      if (inParty.has(p.id)) return false;
      if (nickIn(cfg.never, p.nick)) return false;
      if (cfg.range > 0 && game.dist(h, p) > cfg.range) return false;
      if (cfg.everyone) return true;
      return (cfg.friends && isFriendP(p)) || (cfg.clan && p.isClan) || (cfg.allies && p.isAlly) || nickIn(cfg.always, p.nick);
    });
  }

  let lastPress = 0;
  /** Zaproszenie jak gracz. Gdy w menu nie ma „Zaproś do grupy" (wisi stare zaproszenie, np. do AFK),
   *  najpierw je anulujemy i zapraszamy od nowa. */
  async function invite(p) {
    if (await menus.choosePlayerOption(p.id, /^zapro[śs] do grupy/i)) return 'ok';
    const labels = await menus.playerMenuLabels(p.id);
    const cancel = labels.find((l) => /(anuluj|cofnij|odwo[łl]aj).*zaprosz/i.test(l));
    if (cancel) {
      await menus.choosePlayerOption(p.id, new RegExp('^' + cancel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i'));
      await sleep(400);
      if (await menus.choosePlayerOption(p.id, /^zapro[śs] do grupy/i)) return 'ok';
    }
    const r = await net.send('partyInvite', { id: p.id }, { src: 'Lepsza Grupa' });
    return r.ok ? 'cmd' : 'fail';
  }

  function inviteAll() {
    const h = game.hero();
    // dwa szybkie naciśnięcia klawisza = zaproś jeszcze raz także tych, których zapraszałeś przed chwilą
    const force = now() - lastPress < 1500;
    lastPress = now();
    if (force) invited = {};
    const party = new Set(game.partyMembers());
    // ktoś, kto dołączył do grupy albo grupa została rozwiązana — zapomnij o wcześniejszym zaproszeniu
    for (const id of Object.keys(invited)) if (party.has(Number(id))) delete invited[id];
    const matching = game.others().filter((p) => {
      if (nickIn(cfg.never, p.nick)) return false;
      if (cfg.range > 0 && h && game.dist(h, p) > cfg.range) return false;
      return cfg.everyone || (cfg.friends && isFriendP(p)) || (cfg.clan && p.isClan) || (cfg.allies && p.isAlly) || nickIn(cfg.always, p.nick);
    });
    const inParty = matching.filter((p) => party.has(p.id));
    const recent = matching.filter((p) => !party.has(p.id) && invited[p.id] > now() - 4000);   // ta sama osoba nie częściej niż co 4 s
    const l = matching.filter((p) => !party.has(p.id) && !(invited[p.id] > now() - 4000));
    const room = Math.max(0, cfg.maxParty - Math.max(1, party.size));
    const pick = l.slice(0, room || l.length);
    if (!pick.length) {
      const total = game.others().length;
      const why = [];
      if (inParty.length) why.push(`już w grupie: ${inParty.map((p) => p.nick).join(', ')}`);
      if (recent.length) why.push(`zaproszeni przed chwilą: ${recent.map((p) => p.nick).join(', ')} (naciśnij klawisz 2× szybko, żeby zaprosić ponownie)`);
      if (l.length && !room) why.push('grupa jest pełna');
      toast(why.length ? `Lepsza Grupa: ${why.join('; ')}` : total ? `Lepsza Grupa: nikt z ${total} graczy na mapie nie pasuje do ustawień` : 'Lepsza Grupa: brak graczy na mapie', 'warn', 2500);
      return;
    }
    // jak gracz: menu gracza → „Zaproś do grupy"; zapas: komenda zaproszenia
    (async () => {
      for (const p of pick) {
        invited[p.id] = now();
        await invite(p);
        await sleep(250);
      }
    })();
    toast(`Lepsza Grupa: zapraszam ${pick.map((p) => p.nick).join(', ')}`, 'ok', 1800);
  }

  async function disband() {
    invited = {};
    game._partyCache = [];
    // bez okienka „Czy na pewno chcesz rozwiązać grupę?" — od razu komenda rozwiązania (działała od początku)
    await net.send('partyDisband', {}, { src: 'Lepsza Grupa', urgent: true });
    toast('Rozwiązuję grupę');
  }
  MP.cook = { disband };

  defineAddon({
    id: 'cook', name: 'Lepsza Grupa', icon: 'cook', color: ['#ff8a5c', '#e2533a'],
    desc: 'Ułatwia zbieranie drużyny. Jednym klawiszem zapraszasz wybrane osoby: znajomych, klanowiczów, sojuszników albo wszystkich graczy na mapie, a drugim rozwiązujesz grupę. Lista w ustawieniach od razu pokazuje, kogo dodatek zaprosi.',
    defaults: { keyInvite: '', keyDisband: '', friends: true, clan: true, allies: false, everyone: false, always: [], never: [], range: 0, maxParty: 10 },
    keys: [
      { key: 'keyInvite', label: 'zaproś', fn: () => inviteAll() },
      { key: 'keyDisband', label: 'rozwiąż grupę', fn: () => disband() },
    ],
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
      // podgląd: kogo zaprosi — odświeża się od razu po zmianie ustawień
      const card = el('div', { class: 'mp-card' });
      box.appendChild(card);
      drawList = () => {
        if (!card.isConnected) { drawList = () => {}; return; }
        const ok = new Set(eligible().map((p) => p.id));
        const party = new Set(game.partyMembers());
        const rows = game.others().map((p) => el('tr', null, el('td', null, p.nick, el('span', { class: 'mp-dim' }, ` (${p.lvl}${p.prof})`)),
          el('td', { class: 'mp-dim' }, [isFriendP(p) && 'znajomy', p.isClan && 'klan', p.isAlly && 'sojusz'].filter(Boolean).join(', ') || '—'),
          el('td', null, party.has(p.id) ? el('span', { class: 'mp-dim' }, 'w grupie') : ok.has(p.id) ? el('span', { class: 'mp-okc' }, 'zaprosi') : el('span', { class: 'mp-dim' }, 'pominie'))));
        card.innerHTML = '';
        card.append(el('h3', null, 'Gracze na mapie'), rows.length ? el('table', { class: 'mp-table' }, el('tbody', null, rows)) : el('div', { class: 'mp-dim' }, 'Brak graczy.'));
      };
      drawList();
    },
    onChange() { drawList(); },
    init(c) {
      cfg = c;
      if ('auto' in c) { delete c.auto; config.save(); }   // usunięty automat z wcześniejszych wersji
      bus.on('map:change', () => { invited = {}; });
    },
  });
})();
