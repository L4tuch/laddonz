/* ───────── Fake Taxi ─────────
 * Automatycznie przyjmuje przywołania („Gracz X przyzywa do siebie swoją drużynę! Czy chcesz się teleportować…")
 * od wybranych osób: domyślnie od członków grupy, opcjonalnie od znajomych, klanu i z listy nicków.
 * Okno w ogóle się nie pokazuje: akcja „Tak" jest wywoływana od razu (a gdy okno jednak powstanie — jest ukryte i od razu klikane).
 */
(() => {
  let cfg;
  const SUMMON_RE = /(przyzywa|przywo[łl]uje|przywo[łl]anie|przyzwanie|teleportowa[ćc] do)/i;
  const lc = (x) => String(x || '').toLowerCase();

  /** Nicki członków grupy z okna grupy gry (wiersze „Nick (41p)") i z danych gry. */
  function partyNicks() {
    const out = new Set();
    $$('[class*="other-party-id-"]').forEach((n) => { const m = (n.textContent || '').trim().match(/^\s*(.+?)\s*\(\s*\d+/); if (m) out.add(lc(m[1])); });
    game.partyMembers().forEach((id) => { const o = game.otherById(id); if (o) out.add(lc(o.nick)); });
    return out;
  }
  function summoner(text) {
    const m = text.match(/Gracz(?:ka)?\s+(.+?)\s+(przyzywa|przywo[łl]uje)/i);
    return m ? m[1].trim() : null;
  }
  function allowed(text) {
    const who = summoner(text);
    const t = lc(text);
    const has = (nick) => (who ? lc(who) === lc(nick) : t.includes(lc(nick)));
    // gra pozwala przywołać tylko własną drużynę — przyjmujemy od członków grupy
    for (const n of partyNicks()) if (has(n)) return who || n;
    return null;
  }
  const YES_RE = /^\s*(tak|akceptuj|przyjmij|zgoda|ok)\b/i;
  const active = () => cfg && cfg.enabled && !game.inBattle();   // w trakcie walki gra i tak nie pozwala przyjąć
  const accepted = (who, how) => net.pushLog({ kind: 'info', src: 'Fake Taxi', msg: `Przyjęto przywołanie${who === true ? '' : ' od ' + who} (${how})` });

  /*
   * 1) Zanim okno w ogóle powstanie: przechwytujemy funkcję gry, która je tworzy (askAlert / mAlert / …).
   *    Jeśli to przywołanie od dozwolonej osoby — od razu wywołujemy akcję przycisku „Tak", a okna nie ma.
   */
  function textOf(x, d = 0, out = []) {
    if (d > 4 || x == null) return out;
    if (typeof x === 'string') out.push(x);
    else if (Array.isArray(x)) x.forEach((v) => textOf(v, d + 1, out));
    else if (typeof x === 'object' && !(x instanceof Node)) Object.values(x).forEach((v) => textOf(v, d + 1, out));
    return out;
  }
  /** Szuka akcji przycisku „Tak" w argumentach: [['Tak', fn], …] albo [{txt:'Tak', callback: fn}, …]. */
  function yesFn(x, d = 0) {
    if (d > 4 || x == null || typeof x !== 'object' || x instanceof Node) return null;
    if (Array.isArray(x) && typeof x[0] === 'string' && typeof x[1] === 'function' && YES_RE.test(x[0].replace(/<[^>]+>/g, ''))) return x[1];
    if (!Array.isArray(x)) {
      const lab = x.txt || x.text || x.label || x.name || x.title;
      const fn = x.callback || x.clb || x.cb || x.fn || x.action || x.onclick || x.click;
      if (typeof lab === 'string' && typeof fn === 'function' && YES_RE.test(lab.replace(/<[^>]+>/g, ''))) return fn;
    }
    for (const v of Object.values(x)) { const f = yesFn(v, d + 1); if (f) return f; }
    return null;
  }
  function hookOne(obj, name) {
    const orig = obj && obj[name];
    if (typeof orig !== 'function' || orig.__mpTaxi) return false;
    const wrapped = function (...args) {
      try {
        if (active()) {
          const text = textOf(args).join(' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
          if (SUMMON_RE.test(text)) {
            const who = allowed(text);
            const f = who && yesFn(args);
            if (f) { setTimeout(() => { try { f(); } catch {} }, 0); accepted(who, 'bez okna'); return; }
          }
        }
      } catch {}
      return orig.apply(this, args);
    };
    wrapped.__mpTaxi = true;
    try { obj[name] = wrapped; return true; } catch { return false; }
  }
  function hookAlerts() {
    const names = ['askAlert', 'mAlert', 'confirmAlert', 'alertAsk', '_alert'];
    names.forEach((n) => hookOne(W, n));
    try {
      const I = W.Engine && W.Engine.interface;
      if (I) {
        const seen = new Set();
        for (let p = I; p && p !== Object.prototype; p = Object.getPrototypeOf(p)) Object.getOwnPropertyNames(p).forEach((n) => seen.add(n));
        seen.forEach((n) => { if (/alert|ask|confirm|dialog/i.test(n)) { try { if (typeof I[n] === 'function') hookOne(I, n); } catch {} } });
      }
    } catch {}
  }

  /*
   * 2) Zapas: gdy okno jednak powstało — obserwator działa przed narysowaniem klatki,
   *    więc ukrywamy okno i klikamy „Tak" od razu; na ekranie nic nie mignie.
   */
  const done = new WeakSet();
  function dialogRoot(btn, box) {
    let r = box;
    const len = (box.textContent || '').length;
    while (r.parentElement && r.parentElement !== document.body && (r.parentElement.textContent || '').length < len + 120) r = r.parentElement;
    return r;
  }
  function scan() {
    if (!active()) return;
    let btns = $$('button, .button, .btn, [class*="button"], [class*="accept"], [class*="yes"]').filter((b) => YES_RE.test(b.textContent || '') && (b.textContent || '').trim().length < 20);
    btns = btns.filter((b) => !btns.some((o) => o !== b && b.contains(o)));   // sam przycisk, nie pojemnik z przyciskami
    for (const btn of btns) {
      let box = btn.parentElement;
      for (let i = 0; i < 8 && box && !SUMMON_RE.test(box.textContent || ''); i++) box = box.parentElement;
      if (!box || done.has(box) || box.closest('.mp-glass')) continue;
      const text = (box.textContent || '').replace(/\s+/g, ' ');
      if (!SUMMON_RE.test(text)) continue;
      done.add(box);
      const who = allowed(text);
      if (!who) continue;
      const root = dialogRoot(btn, box);
      root.style.setProperty('visibility', 'hidden', 'important');
      root.style.setProperty('opacity', '0', 'important');
      btn.click();
      accepted(who, 'kliknięto „Tak"');
    }
  }
  defineAddon({
    id: 'taxi', name: 'Fake Taxi', icon: 'taxi', color: ['#ffe14d', '#f0b400'],
    desc: 'Gdy ktoś z drużyny przyzywa grupę do siebie, dodatek od razu przyjmuje przywołanie — bez wyskakującego okienka.',
    defaults: {},
    init(c) {
      cfg = c;
      if ('auto' in c || 'dialogSelector' in c) { delete c.auto; delete c.dialogSelector; config.save(); }
      hookAlerts();
      setInterval(hookAlerts, 3000);   // gra może podmienić funkcje po wczytaniu
      new MutationObserver(scan).observe(document.body, { childList: true, subtree: true });
    },
  });
})();

/* ───────── Szybka walka (dawniej Auto f) ─────────
 * Włączone = na starcie każdej walki postać od razu przechodzi na szybką walkę.
 * Do tego jest przełącznik na liście dodatków — np. przy kolosie, gdy odchodzisz od komputera.
 */
(() => {
  let cfg, doneFor = 0;
  defineAddon({
    id: 'autof', name: 'Szybka walka', icon: 'autof', color: ['#ffd447', '#ff8a00'],
    desc: 'Każda walka od razu przechodzi w szybką walkę. Przydatne np. przy kolosie, gdy odchodzisz od komputera, a reszta nie chce czekać na Twoją turę.',
    defaults: { enabled: false, delayMin: 250, delayMax: 600 },
    settings: [
      { adv: true, key: 'delayMin', type: 'number', label: 'Opóźnienie od (ms)', min: 100, max: 3000 },
      { adv: true, key: 'delayMax', type: 'number', label: 'Opóźnienie do (ms)', min: 150, max: 4000 },
    ],
    init(c) {
      cfg = c;
      bus.on('battle:start', () => {
        if (!cfg.enabled) return;
        const t = now(); if (t - doneFor < 2000) return; doneFor = t;
        setTimeout(() => { if (game.inBattle()) net.send('fastFight', {}, { src: 'Szybka walka', urgent: true }); }, rnd(cfg.delayMin, Math.max(cfg.delayMin + 50, cfg.delayMax)));
      });
    },
    onToggle(on) { toast(on ? 'Szybka walka: włączona' : 'Szybka walka: wyłączona', on ? 'warn' : 'info', 1600); },
  });
})();

/* ───────── Szybka Rączka ─────────
 * Prawy klik na przedmiocie → „Użyj po walce": zaraz po zakończeniu walki przedmiot zostanie użyty
 * (teleporty, mikstury, przywołania…) — tak, jakbyś sam kliknął na nim „Użyj". Bez klawiszy i konfiguracji.
 * Prawy klik na ikonie grupy → „Rozwiąż grupę po walce".
 */
(() => {
  let cfg;
  const S = { disbandArmed: false, set: null };

  /*
   * Zmiana zestawu po walce. Prawy klik na numerze zestawu przy ekwipunku (także przed walką) → „Zmień po walce"
   * → lista Twoich zestawów z nazwami. Zaraz po zakończeniu walki zestaw przełącza się tą samą komendą co w grze
   * (builds&action=updateCurrent). Ponowny wybór tego samego albo „Nie zmieniaj" anuluje.
   */
  const BUILD_ANC = '[class*="build"], [class*="Build"], [class*="zestaw"], [class*="eq-set"], [class*="eqset"]';
  /** Lista zestawów: z danych gry (moduł zestawów), z listy rozwijanej w grze albo zapamiętana. */
  function buildList() {
    let list = [];
    try {
      const E0 = W.Engine || {};
      for (const k of Object.keys(E0).filter((x) => /build/i.test(x))) {
        const o = E0[k]; if (!o || typeof o !== 'object') continue;
        const cands = [o.builds, o.list, o.data, o.d, typeof o.getBuilds === 'function' ? o.getBuilds() : null, typeof o.getList === 'function' ? o.getList() : null];
        for (const c of cands) {
          const arr = c instanceof Map ? [...c.values()] : Array.isArray(c) ? c : c && typeof c === 'object' ? Object.values(c) : [];
          const got = arr.map((b) => b && typeof b === 'object' ? { id: Number(b.id ?? b.nr ?? b.number), name: String(b.name ?? b.title ?? '') } : null).filter((b) => b && b.id > 0);
          if (got.length) { list = got; break; }
        }
        if (list.length) break;
      }
    } catch {}
    if (!list.length) {
      // pozycje listy rozwijanej gry: „2. Zestaw 2"
      const seen = new Map();
      $$(BUILD_ANC + ' *, ' + BUILD_ANC).forEach((n) => { const m = (n.textContent || '').trim().match(/^(\d{1,2})\.\s*(.{1,30})$/); if (m && !n.children.length) seen.set(Number(m[1]), m[2].trim()); });
      list = [...seen].map(([id, name]) => ({ id, name }));
    }
    const saved = store.get('sets:names', {}) || {};
    if (list.length) { list.forEach((b) => { if (b.name) saved[b.id] = b.name; }); store.set('sets:names', saved); }
    const ids = new Set([...list.map((b) => b.id), ...Object.keys(saved).map(Number)]);
    const cur = currentBuild();
    if (cur) ids.add(cur);
    if (ids.size < 2) [1, 2, 3].forEach((i) => ids.add(i));
    return [...ids].filter(Boolean).sort((x, y) => x - y).map((id) => ({ id, name: (list.find((b) => b.id === id) || {}).name || saved[id] || `Zestaw ${id}` }));
  }
  /** Przycisk z numerem obecnego zestawu (najgłębszy element z samą cyfrą). */
  function buildBtn() {
    if (S.btnEl && S.btnEl.isConnected && /^\s*\d{1,2}\s*$/.test(S.btnEl.textContent || '')) return S.btnEl;
    const c = $$(BUILD_ANC + ', ' + BUILD_ANC + ' *').filter((n) => /^\s*\d{1,2}\s*$/.test(n.textContent || '') && isVisible(n) && !n.closest('.mp-glass, #mp-ctx'));
    return c.find((n) => ![...n.children].some((ch) => /^\s*\d{1,2}\s*$/.test(ch.textContent || ''))) || null;
  }
  function buildButtonFrom(t) {
    if (!t || !t.closest || t.closest('.mp-glass, #mp-qbar, #mp-qpop, #mp-ctx')) return null;
    let n = t;
    for (let i = 0; i < 4 && n && !/^\s*\d{1,2}\s*$/.test(n.textContent || ''); i++) n = n.parentElement;
    if (!n || !/^\s*\d{1,2}\s*$/.test(n.textContent || '') || !n.closest(BUILD_ANC)) return null;
    return n;
  }
  function currentBuild() {
    const b = buildBtn();
    return b ? Number((b.textContent || '').trim()) : 0;
  }
  /** Zegar przy numerze zestawu — jak przy przedmiotach czekających na użycie po walce. */
  function markSet() {
    $$('.mp-setclock').forEach((n) => n.remove());
    if (!S.set) return;
    const btn = buildBtn();
    if (!btn) return;
    if (getComputedStyle(btn).position === 'static') btn.style.position = 'relative';
    btn.appendChild(el('div', { class: 'mp-ibadge queued mp-setclock', title: `Po walce: ${S.set.id}. ${S.set.name}` }, icon('clock', 11)));
  }
  function armSet(b) {
    if (!b || (S.set && S.set.id === b.id)) { S.set = null; markSet(); toast('Szybka Rączka: zestaw nie zmieni się po walce'); return; }
    S.set = b; markSet();
    toast(`Szybka Rączka: po walce zmienię zestaw na „${b.name}"`);
  }
  async function switchSet(s) {
    if (currentBuild() === s.id) return;
    const r = await net.send('eqSet', { id: s.id }, { src: 'Szybka Rączka', urgent: true });
    if (!r.ok) toast(`Szybka Rączka: nie udało się zmienić zestawu na „${s.name}"`, 'warn');
  }
  /** Nasze podmenu z listą zestawów do wyboru „po walce". */
  function openSetMenu(x, y) {
    const cur = currentBuild();
    const list = buildList().filter((b) => b.id !== cur);
    menus.showGame(x, y, [
      ...list.map((b) => ({ label: `${b.id}. ${b.name}${S.set && S.set.id === b.id ? ' (wybrany)' : ''}`, fn: () => armSet(b) })),
      ...(S.set ? [{ label: 'Anuluj zmianę po walce', fn: () => armSet(null) }] : []),
    ], 'Zmień po walce na…');
  }
  /** Pozycje listy zestawów, którą gra pokazuje po kliknięciu numeru („2. Zestaw 2"). */
  function gameSetItems() {
    return $$('div, li, span, a, button').filter((n) => isVisible(n) && !n.closest('.mp-glass, #mp-ctx') && /^\s*\d{1,2}\.\s*\S.{0,30}$/.test(n.textContent || '') && ![...n.children].some((c) => /^\s*\d{1,2}\./.test(c.textContent || '')));
  }
  /** Do listy zestawów z gry dopisujemy pozycję „Zmień po walce…" (stare opcje gry zostają). */
  function injectIntoGameList(btnRect) {
    const items = gameSetItems();
    if (!items.length) return false;
    const names = store.get('sets:names', {}) || {};
    items.forEach((n) => { const m = (n.textContent || '').trim().match(/^(\d{1,2})\.\s*(.+)$/); if (m) names[m[1]] = m[2].trim(); });
    store.set('sets:names', names);
    if (now() - menus.lastInject < 1500) return true;                       // już dopisane do menu gry
    if ($$('.mp-buildq').some((n) => isVisible(n))) return true;             // już jest — tylko jedna pozycja
    const last = items[items.length - 1];
    const parent = last.parentElement;
    if (!parent || parent.querySelector(':scope > .mp-buildq')) return true;
    const row = last.cloneNode(false);
    row.classList.add('mp-buildq');
    row.textContent = 'Zmień po walce…';
    row.addEventListener('click', (ev) => {
      ev.preventDefault(); ev.stopPropagation();
      const r = row.getBoundingClientRect();
      openSetMenu(r.right + 4, r.top);
    }, true);
    parent.appendChild(row);
    return true;
  }
  function hookSets() {
    // prawy klik na numerze zestawu: menu gry zostaje (zmiana od razu), a my dokładamy „Zmień po walce…"
    document.addEventListener('contextmenu', (e) => {
      if (!cfg.enabled) return;
      let btn = buildButtonFrom(e.target);
      if (!btn) return;
      while ([...btn.children].some((ch) => /^\s*\d{1,2}\s*$/.test(ch.textContent || ''))) btn = [...btn.children].find((ch) => /^\s*\d{1,2}\s*$/.test(ch.textContent || ''));
      S.btnEl = btn;
      menus.setLast('build', Number((btn.textContent || '').trim()));
      const x = e.clientX, y = e.clientY, t0 = now();
      const tryInject = () => {
        if (injectIntoGameList()) return;
        if (now() - menus.lastInject < 600) return;          // dopisane do menu gry (showPopupMenu)
        if (now() - t0 < 350) { setTimeout(tryInject, 70); return; }
        openSetMenu(x, y);                                    // gra nie pokazała żadnej listy — nasze menu
      };
      setTimeout(tryInject, 40);
    }, true);
    // lewy klik też otwiera listę zestawów w grze — dopisujemy tam pozycję
    document.addEventListener('click', (e) => {
      if (!cfg.enabled) return;
      if (buildButtonFrom(e.target)) { S.btnEl = buildButtonFrom(e.target); setTimeout(() => injectIntoGameList(), 60); setTimeout(() => injectIntoGameList(), 200); }
    }, true);
    // w trakcie walki zwykły wybór zestawu z listy gry → zapamiętujemy i zmieniamy po walce
    document.addEventListener('click', (e) => {
      if (!cfg.enabled || !game.inBattle()) return;
      const t = e.target && e.target.closest && e.target.closest('div, li, span, a, button');
      if (!t || t.classList.contains('mp-buildq')) return;
      const m = (t.textContent || '').trim().match(/^(\d{1,2})\.\s*(.{1,30})$/);
      if (!m || !gameSetItems().includes(t)) return;
      e.preventDefault(); e.stopPropagation();
      armSet({ id: Number(m[1]), name: m[2].trim() });
    }, true);
    menus.add('build', () => (cfg.enabled ? [...(S.set ? [{ label: 'Anuluj zmianę po walce', fn: () => armSet(null) }] : []), { label: 'Zmień po walce…', fn: () => { const b = buildBtn(); const r = b ? b.getBoundingClientRect() : { right: 200, top: 200 }; openSetMenu(r.right + 4, r.top); } }] : []));
    setInterval(() => { if (S.set && !$('.mp-setclock')) markSet(); }, 1500);
  }

  /**
   * „Użyj po walce" tylko dla przedmiotów, których da się użyć (mikstury, teleporty, zwoje…).
   * Nigdy: neutralne, ekwipunek do założenia, torby, klucze itp.
   */
  function usable(it, menu) {
    if (!it) return false;
    let typ = '';
    try { const f = it.raw && (it.raw.getTipContent || it.raw.getTipData); let t = typeof f === 'function' ? f.call(it.raw) : ''; if (t && typeof t === 'object') t = JSON.stringify(t); typ = ((String(t || '').replace(/<[^>]+>/g, ' ').match(/Typ:\s*([^\s]+)/i) || [])[1] || '').toLowerCase(); } catch {}
    if (/neutral|torb|klucz|quest|zadan|walut|przepis/.test(typ)) return false;
    // gra sama ma w menu „Użyj"/„Teleportuj"… → na pewno da się użyć
    try { if (Array.isArray(menu) && menu.some((m) => /^(u[żz]yj|teleportuj|przywo[łl]aj|wypij|zjedz|otw[óo]rz)/i.test(menus.entryParts(m).label.trim()))) return true; } catch {}
    if (/lecz|konsump|teleport|zw[óo]j|b[łl]ogos|mikst|odnaw|u[żz]ytk|wzmacn/.test(typ)) return true;
    const st = it.stats || {};
    if (st.teleport != null || st.custom_teleport != null || st.leczy != null || st.perheal != null || st.fullheal != null) return true;
    return false;
  }
  function queued(id) { return cfg.queue.find((q) => q.id === Number(id)); }
  function toggleQueue(id) {
    const it = game.itemById(id);
    const i = cfg.queue.findIndex((q) => q.id === Number(id));
    if (i >= 0) { cfg.queue.splice(i, 1); toast(`Szybka Rączka: „${it ? it.name : id}" nie zostanie użyty po walce`); }
    else { cfg.queue.push({ id: Number(id), name: it ? it.name : '#' + id, tp: !!(it && (it.stats.teleport || it.stats.custom_teleport || /telepor|zwój|kamień/i.test(it.name))) }); toast(`Szybka Rączka: „${it ? it.name : id}" zostanie użyty po walce`); }
    config.save(); bus.emit('deco');
  }

  /** Użycie przedmiotu jak przez gracza: menu przedmiotu → „Użyj". Zapas: komenda użycia (podsłuchana albo domyślna). */
  async function useItem(id) {
    const node = $$(`.item.item-id-${id}`).find((n) => !/-showeq/.test(String(n.className)));
    if (node && await menus.chooseItemOption(node, /^(u[żz]yj|teleportuj|przywo[łl]aj|wypij|zjedz|otw[óo]rz)/i)) return true;
    const r = await net.send('useItem', { id }, { src: 'Szybka Rączka' });
    return r.ok;
  }

  let running = false;
  async function runQueue() {
    if (running) return;
    running = true;
    try {
      // najpierw rozwiązanie grupy (nie zmienia mapy), potem przedmioty — teleporty na końcu
      if (S.disbandArmed) { S.disbandArmed = false; MP.cook ? MP.cook.disband() : net.send('partyDisband', {}, { src: 'Szybka Rączka', urgent: true }); }
      // zmiana zestawu (przed użyciem przedmiotów) — ta sama komenda, którą wysyła gra
      if (S.set) { const st = S.set; S.set = null; markSet(); await switchSet(st); await sleep(250); }
      const items = cfg.queue.slice().sort((a, b) => a.tp - b.tp);
      for (const q of items) {
        cfg.queue = cfg.queue.filter((x) => x.id !== q.id);
        if (!game.itemById(q.id)) continue;
        // gdy gra tuż po walce jeszcze nie pokazuje opcji „Użyj" (żadna komenda nie poszła) — ponawiamy, maks. 3 razy
        for (let t = 0; t < 4; t++) {
          const calls = net.stats.gameCalls + net.stats.ourCalls;
          await useItem(q.id);
          if (net.stats.gameCalls + net.stats.ourCalls > calls) break;
          await sleep(400);
        }
      }
      config.save(); bus.emit('deco');
    } finally { running = false; }
  }

  function armDisband() {
    S.disbandArmed = !S.disbandArmed;
    toast(S.disbandArmed ? 'Grupa zostanie rozwiązana po walce' : 'Anulowano rozwiązanie grupy po walce');
  }

  /* prawy klik na ikonie grupy → nasze menu */
  function hookPartyIcon() {
    document.addEventListener('contextmenu', (e) => {
      if (!cfg.enabled) return;
      const sel = cfg.partySelector.split('\n').map((s) => s.trim()).filter(Boolean).join(',');
      if (!sel) return;
      const t = e.target.closest && e.target.closest(sel);
      if (!t) return;
      e.preventDefault(); e.stopPropagation();
      menus.showGame(e.clientX, e.clientY, [
        { label: S.disbandArmed ? 'Anuluj rozwiązanie grupy po walce' : 'Rozwiąż grupę po walce', fn: armDisband },
        { label: 'Rozwiąż grupę teraz', fn: () => (MP.cook ? MP.cook.disband() : net.send('partyDisband', {}, { src: 'Szybka Rączka' })) },
      ], 'Grupa');
    }, true);
  }

  defineAddon({
    id: 'szybka', name: 'Szybka Rączka', icon: 'szybka', color: ['#40e0d0', '#1a9e9e'],
    desc: 'Zaplanuj coś na koniec walki: użycie przedmiotu (teleport, mikstura, przywołanie), rozwiązanie grupy albo zmianę zestawu. Wybierasz to prawym klikiem, a dodatek zrobi to od razu po walce.',
    defaults: { queue: [], partySelector: '.widget-party\n[class*="widget-party"]\n.party-icon' },
    settings: [
      { adv: true, group: 'Zaawansowane', key: 'partySelector', type: 'textarea', label: 'Selektor ikony grupy', hint: 'Zmień tylko, jeśli menu na ikonie grupy się nie pokazuje.' },
    ],
    render(box, c, rerender) {
      const tb = el('tbody', null, c.queue.map((q, i) => el('tr', null, el('td', null, q.name, q.tp ? el('span', { class: 'mp-dim' }, ' (teleport)') : null),
        el('td', null, el('button', { class: 'mp-mini', onclick: () => { c.queue.splice(i, 1); config.save(); bus.emit('deco'); rerender(); } }, '×')))));
      box.appendChild(el('div', { class: 'mp-card' }, el('h3', null, 'Czeka na koniec walki'),
        c.queue.length ? el('table', { class: 'mp-table' }, tb) : el('div', { class: 'mp-dim' }, 'Nic — prawy klik na przedmiocie → „Użyj po walce".'),
        S.disbandArmed ? el('div', { class: 'mp-dim', style: { marginTop: '6px' } }, 'Po walce: rozwiązanie grupy') : null));
    },
    init(c) {
      cfg = c;
      if (!c._v17) { c._v17 = true; delete c.auto; delete c.key; config.save(); }
      document.getElementById('mp-szybka-ind')?.remove();
      menus.add('item', (id, menu) => {
        if (!cfg.enabled) return [];
        if (queued(id)) return [{ label: 'Anuluj użycie po walce', fn: () => toggleQueue(id) }];
        if (!usable(game.itemById(id), menu)) return [];
        return [{ label: 'Użyj po walce', fn: () => toggleQueue(id) }];
      });
      itemDeco.add((node, it, id) => (cfg.enabled && queued(id) ? { cls: 'queued', icon: 'clock', title: 'Szybka Rączka: zostanie użyty po walce' } : null));
      // od razu po zakończeniu walki
      hookSets();
      MP.szybka = { debug: () => ({ zestawWKolejce: S.set, zestawy: buildList(), obecny: currentBuild(), engineBuild: Object.keys(W.Engine || {}).filter((k) => /build/i.test(k)) }), buildList, armSet };
      bus.on('battle:end', () => { if (cfg.enabled && cfg.queue.length + (S.disbandArmed ? 1 : 0) + (S.set ? 1 : 0)) runQueue(); });
      if (!/widget-party/.test(cfg.partySelector || '')) { cfg.partySelector = '.widget-party\n[class*="widget-party"]\n' + (cfg.partySelector || ''); config.save(); }
      hookPartyIcon();
    },
    onToggle() { bus.emit('deco'); },
  });
})();

/* ───────── Ulepszarka ─────────
 * Wskazujesz przedmiot(y) do ulepszania — przeciągając go do okienka, klikając okienko i potem przedmiot,
 * albo z menu przedmiotu. Pod każdym wybierasz, jakimi przedmiotami go karmić: rzadkość (zwykłe / unikaty /
 * heroiki — legend NIGDY) i typy (hełm, pierścień, naszyjnik…). Każdy typ składników może karmić tylko jeden
 * przedmiot; gdy wszystkie typy są zajęte, nie da się dodać kolejnego przedmiotu.
 * Ulepszanie odpala TY — przyciskiem albo klawiszem. To zwykłe ulepszanie z gry, tylko kilka przedmiotów naraz.
 * Domyślnie przed ulepszeniem pokazuje listę zużywanych przedmiotów (z rzadkością) — można to wyłączyć.
 * Twarde bezpieczniki: nigdy założone, legendy, artefakty, ulepszane cele, podpisane w Podpisowniku,
 * z kolejki Szybkiej rączki ani chronione.
 */
(() => {
  let cfg, running = false, pickSlot = null, dragId = null;
  const RAR = [['common', 'Zwykłe'], ['unique', 'Unikaty'], ['heroic', 'Heroiki']];
  const TYPES = [
    ['helm', 'Hełm', [9]], ['neck', 'Naszyjnik', [13]], ['ring', 'Pierścień', [12]], ['gloves', 'Rękawice', [11]],
    ['armor', 'Zbroja', [8]], ['boots', 'Buty', [10]], ['weapon', 'Broń', [1, 2, 3, 4, 6]],
    ['offhand', 'Tarcza / pomocnicze', [5, 7, 14]], ['arrows', 'Strzały', [21, 29]],
  ];
  const typeOf = (cl) => (TYPES.find((t) => t[2].includes(Number(cl))) || [])[0] || null;
  const typeName = (k) => (TYPES.find((t) => t[0] === k) || [, k])[1];
  const NEVER = ['legendary', 'artefact', 'upgraded'];

  const slots = () => (Array.isArray(cfg.slots) ? cfg.slots : (cfg.slots = []));
  const targetIds = () => new Set(slots().map((s) => Number(s.id)));
  const RAR_PL = { common: 'zwykły', unique: 'unikat', heroic: 'heroiczny', legendary: 'legendarny', upgraded: 'ulepszony', artefact: 'artefakt' };
  /**
   * Stan okna rzemiosła. Serwer przyjmuje ulepszanie TYLKO przy otwartym oknie rzemiosła na zakładce ulepszania
   * (bez tego odpowiada „Błąd wewnętrzny" i wyrzuca z gry) — więc bez otwartego okna nic nie wysyłamy.
   * 'enh' = otwarte na ulepszaniu, 'other' = otwarte na innej zakładce, 'unknown' = otwarte, zakładki nie rozpoznano, null = zamknięte.
   */
  function craftState() {
    if (!net.craftOpen()) return null;
    try {
      for (const w of $$('[class*="window"]')) {
        if (!isVisible(w) || w.closest('.mp-glass')) continue;
        const head = ((w.querySelector('[class*="header"], [class*="title"]') || {}).textContent || '');
        if (!/rzemios/i.test(head)) continue;
        const act = $$('[class*="active"], [class*="selected"], [class*="--on"]', w).filter((n) => isVisible(n) && (n.textContent || '').trim().length < 30 && (n.textContent || '').trim());
        if (act.some((n) => /ulepsz/i.test(n.textContent))) return 'enh';
        const tabs = $$('[class*="tab"], [class*="card"]', w).filter((n) => /ulepsz/i.test(n.textContent || '') && (n.textContent || '').trim().length < 30);
        if (act.length && tabs.length) return 'other';
        return 'unknown';
      }
    } catch {}
    return 'unknown';
  }
  /**
   * Otwiera Rzemiosło tak jak gra (Engine.crafting.triggerOpen → gra sama wysyła artisanship&action=open)
   * i przełącza na zakładkę Ulepszanie. Zwraca true dopiero, gdy okno jest otwarte na ulepszaniu.
   */
  let openedByUs = false;
  async function ensureCraft() {
    if (craftState() === 'enh') return true;
    if (!net.craftOpen()) {
      const c = W.Engine && W.Engine.crafting;
      try { if (c && typeof c.triggerOpen === 'function') c.triggerOpen(); else if (c && typeof c.open === 'function') c.open(); } catch {}
      for (let i = 0; i < 20 && !net.craftOpen(); i++) await sleep(150);
      if (!net.craftOpen()) return false;
      openedByUs = true;
      await sleep(300);
    }
    if (craftState() !== 'enh') {
      // kliknięcie zakładki „Ulepszanie" w oknie rzemiosła
      const w = $$('[class*="window"]').find((x) => isVisible(x) && /rzemios/i.test(((x.querySelector('[class*="header"], [class*="title"]') || {}).textContent || '')));
      if (w) {
        let tabs = $$('*', w).filter((n) => isVisible(n) && /^\s*ulepszanie\s*$/i.test(n.textContent || ''));
        tabs = tabs.filter((n) => !tabs.some((o) => o !== n && n.contains(o)));
        const t = tabs[0];
        if (t) { (t.closest('[class*="tab"], [class*="card"], button') || t).click(); }
      }
      for (let i = 0; i < 14 && craftState() !== 'enh'; i++) await sleep(150);
    }
    return craftState() === 'enh';
  }
  /** Okno rzemiosła z gry (ulepszanie) — zamykane po ulepszeniu. */
  function closeCraft() {
    try {
      const c = W.Engine && W.Engine.crafting;
      if (c && typeof c.isOpen === 'function' && c.isOpen() && typeof c.triggerClose === 'function') { c.triggerClose(); if (!c.isOpen()) return true; }
    } catch {}
    try {
      for (const w of $$('[class*="window"]')) {
        if (!isVisible(w) || w.closest('.mp-glass')) continue;
        const head = ((w.querySelector('[class*="header"], [class*="title"]') || {}).textContent || '');
        if (!/rzemios|ulepsza/i.test(head)) continue;
        const x = w.querySelector('[class*="close-button"]') || w.querySelector('[class*="close"]');
        if (x) { x.click(); return true; }
      }
    } catch {}
    return false;
  }

  /** Składniki dla danego celu (bez przydziału do innych celów). */
  function fits(i, s) {
    if (!s.rar[i.rarity] || NEVER.includes(i.rarity)) return false;
    const t = typeOf(i.cl);
    return !!t && s.types.includes(t);
  }
  /**
   * Tylko prawdziwy ekwipunek (to, co da się założyć). Mikstury, strzały, zwoje itp. — nigdy, nawet gdyby
   * gra dała im numer klasy podobny do ekwipunku: rozpoznajemy je po statystykach i po „Typ: …" w opisie.
   */
  const NOT_EQ_STATS = ['amount', 'cansplit', 'capacity', 'leczy', 'perheal', 'fullheal', 'teleport', 'custom_teleport', 'ammo', 'quest', 'bag', 'recipe', 'blessing'];
  /** Prawdziwe strzały (gra daje miksturom podobny numer klasy — rozróżniamy po opisie/nazwie). */
  function isArrow(i) {
    if (!i) return false;
    if (i.stats && (i.stats.leczy != null || i.stats.perheal != null || i.stats.fullheal != null)) return false;
    const typ = (tipText(i).match(/Typ:\s*([^\s]+)/i) || [])[1] || '';
    if (typ) return /strza|be[łl]t|pocisk|amunic/i.test(typ);
    return /strza[łl]|be[łl]t|pocisk/i.test(i.name || '') || i.stats.ammo != null;
  }
  function isEquipment(i) {
    if (!i || !typeOf(i.cl)) return false;
    if (typeOf(i.cl) === 'arrows') return isArrow(i);
    if (NOT_EQ_STATS.some((k) => i.stats && i.stats[k] != null)) return false;
    const m = tipText(i).match(/Typ:\s*([^\s]+)/i);
    if (m && /lecz|konsump|neutral|strza|klucz|zw[óo]j|torb|talizman|b[łl]ogos|quest|zadan|ulepsz|przepis|walut|mikst/i.test(m[1])) return false;
    return true;
  }
  function candidates() {
    const queue = new Set((addons.cfg('szybka')?.queue || []).map((q) => Number(q.id)));
    const tg = targetIds();
    return game.bag().filter((i) => {
      if (i.st !== 0 || tg.has(i.id) || NEVER.includes(i.rarity)) return false;
      if (!isEquipment(i)) return false;
      if (MP.podpis && MP.podpis.isSigned(i.id)) return false;
      if (queue.has(i.id) || cfg.protect.includes(i.id) || nickIn(cfg.protectNames, i.name)) return false;
      return true;
    });
  }
  /** Składniki odrzucone przez grę dla danego przedmiotu (np. „Poziom przedmiotu jest zbyt niski!"). */
  function markRejected(target, ids) {
    const r = (cfg.rej = cfg.rej || {});
    const l = new Set((r[target] || []).concat(ids));
    r[target] = [...l].slice(-300);
    config.save();
  }
  const isRejected = (target, id) => !!(cfg.rej && cfg.rej[target] && cfg.rej[target].includes(Number(id)));
  /** Przydział: każdy składnik do pierwszego celu, któremu pasuje (i którego gra nie odrzuciła). */
  function plan() {
    const out = slots().map((s) => ({ s, target: game.itemById(s.id), list: [] }));
    for (const i of candidates()) { const o = out.find((o) => o.target && fits(i, o.s) && !isRejected(o.target.id, i.id)); if (o) o.list.push(i); }
    return out.filter((o) => o.target && o.list.length);
  }

  /** Odpowiedź gry „maksymalny poziom" → przedmiot znika z listy. */
  const maxResp = (o) => (data) => {
    // postęp ulepszania i dzienny limit — z odpowiedzi gry (enhancement.progressing / usages_preview)
    try {
      const e = data && data.enhancement;
      const pr = e && (e.progressing || e.progress_preview);
      const sl = slots().find((s) => Number(s.id) === o.target.id);
      if (pr && sl) { sl.prog = { cur: Number(pr.current) || 0, max: Number(pr.max) || 0, lvl: Number(pr.upgradeLevel) || 0 }; config.save(); }
      if (e && e.usages_preview) { cfg.usages = { count: Number(e.usages_preview.count) || 0, limit: Number(e.usages_preview.limit) || 0, day: new Date().toDateString() }; config.save(); }
    } catch {}
    let txt = ''; try { txt = JSON.stringify(data || {}); } catch {}
    if (/maksymaln|max(imum)? ?(lvl|level|poziom)/i.test(txt)) {
      const i = slots().findIndex((s) => Number(s.id) === o.target.id);
      if (i >= 0) { slots().splice(i, 1); config.save(); toast(`Ulepszarka: „${o.target.name}" osiągnął maksymalny poziom — usunięty z listy`, 'ok'); rr(); }
    }
  };
  /*
   * Komunikaty gry o odrzuconych składnikach („Poziom przedmiotu jest zbyt niski!") — w trakcie pracy Ulepszarki
   * chowamy je; Ulepszarka sama pomija takie składniki.
   */
  const NOISE = /poziom przedmiotu jest zbyt niski|nie mo[żz]e by[ćc] u[żz]yty|nie nadaje si[ęe]/i;
  let hushUntil = 0;
  new MutationObserver((muts) => {
    if (now() > hushUntil) return;
    for (const m of muts) for (const n of m.addedNodes) {
      if (n.nodeType !== 1 || n.closest('.mp-glass')) continue;
      if (NOISE.test(n.textContent || '') && (n.textContent || '').length < 120) n.style.setProperty('display', 'none', 'important');
    }
  }).observe(document.body, { childList: true, subtree: true });

  async function run(src, limit = 0) {
    if (running) return;
    if (game.inBattle()) { toast('Ulepszarka: najpierw skończ walkę', 'warn'); return; }
    dropMaxed();
    if (!slots().length) { toast('Ulepszarka: najpierw wskaż przedmiot do ulepszania', 'warn'); return; }
    const c = net.cmd('enhance');
    if (!c.t || !c.verified) { toast('Ulepszarka: ulepsz raz ręcznie w oknie rzemiosła — wtedy się nauczy', 'warn'); return; }
    if (usagesLeft() === 0) { limitMsg(); return; }
    running = true;
    hushUntil = now() + 120000;
    try {
      // serwer przyjmuje ulepszanie tylko przy otwartym Rzemiośle (bez tego wyrzuca) — otwieramy jak gra, a jak się nie da, nic nie wysyłamy
      if (!(await ensureCraft())) { toast('Ulepszarka: nie udało się otworzyć Rzemiosło → Ulepszanie', 'warn'); return 'nocraft'; }
      await precheck();               // przedmioty na maksimum same znikają z listy (także gdy nie ma składników)
      if (!slots().length) return;
      let p = plan();
      if (!p.length) { toast('Ulepszarka: brak pasujących przedmiotów w torbie', 'info'); return; }
      if (limit) { p = p.slice(0, 1); p[0].list = p[0].list.slice(0, limit); }
      if (cfg.confirm) {
        const items = []; p.forEach((o) => o.list.forEach((i) => items.push(el('span', null, i.name, ' ', el('span', { class: 'mp-rar ' + i.rarity }, RAR_PL[i.rarity] || i.rarity), el('span', { class: 'mp-dim' }, ' → ' + o.target.name)))));
        const ok = await confirmBox({ title: 'Ulepszyć teraz?', okText: 'Ulepsz', html: `Zużyję <b>${items.length}</b> przedmiotów:`, items });
        if (!ok) return;
      }
      await sendAll(p);
    } finally {
      running = false;
      await sleep(400);
      setTimeout(() => { hushUntil = 0; }, 1500);
      closeCraft();                   // okno rzemiosła zawsze zamykamy po ulepszaniu
      dropMaxed();
      rr();
    }
  }

  /*
   * Sprawdzenie „czy przedmiot ma już maksimum" — podgląd ulepszenia (nic nie zużywa) z dowolnym składnikiem
   * z torby. Gra odpowiada poziomem albo błędem o maksymalnym poziomie → przedmiot znika z listy.
   * Zapamiętujemy też, do jakiego poziomu da się ulepszyć daną rzadkość — następnym razem bez sprawdzania.
   */
  async function precheck() {
    const lvlOf = (i) => Number(i && i.stats && i.stats.lvl) || 0;
    // ciche komunikaty gry w trakcie sprawdzania (np. „Poziom przedmiotu jest zbyt niski!" z podglądu)
    const origMsg = W.message;
    let restored = false;
    if (typeof origMsg === 'function') W.message = function (m, ...a) { if (/^(Ulepszarka|Bratan|Dobijarka|Fake Taxi)/.test(String(m))) return origMsg.call(this, m, ...a); };
    try {
      for (const sl of slots().slice()) {
        const it = game.itemById(sl.id);
        if (!it) continue;
        // składnik próbny: przedmiot z ekwipunku w torbie o poziomie co najmniej takim jak ulepszany (niższy gra odrzuca)
        const tl = lvlOf(it);
        const pool = game.bag().filter((i) => isEquipment(i) && ['common', 'unique', 'heroic'].includes(i.rarity) && !targetIds().has(i.id) && !(MP.podpis && MP.podpis.isSigned(i.id)));
        // najlepiej składnik o poziomie ≥ ulepszanego (taki gra przyjmuje); gdy brak — najwyższy dostępny
        const probe = pool.filter((i) => lvlOf(i) >= tl && !isRejected(it.id, i.id)).sort((a, b) => lvlOf(a) - lvlOf(b))[0]
          || pool.sort((a, b) => lvlOf(b) - lvlOf(a))[0];
        if (!probe) continue;
        const r = await net.send('enhancePreview', { item: it.id, ingredients: probe.id }, { src: 'Ulepszarka' });
        const steps = (store.get('up:last', {}) || {}).steps || [];
        steps.push({ a: 'check', item: it.id, lvl: enhLevel(it), probeLvl: lvlOf(probe), resp: short(r.data) }); store.set('up:last', { t: new Date().toISOString(), steps: steps.slice(-20) });
        if (r.data && (r.data.t === 'stop' || r.data.t === 'reload')) return;
        try { const pv = r.data && r.data.enhancement && r.data.enhancement.progress_preview; if (pv && Array.isArray(pv.ingredients) && !pv.ingredients.map(Number).includes(probe.id)) markRejected(it.id, [probe.id]); } catch {}
        if (isMaxedResp(r.data)) { learnMax(it); removeMaxed(it.id, it.name); }
        else maxResp({ target: it })(r.data || {});   // zapis postępu
        await sleep(250);
      }
    } finally {
      await sleep(300);
      if (!restored && typeof origMsg === 'function') { W.message = origMsg; restored = true; }
    }
  }
  /** Zapamiętany maksymalny poziom dla rzadkości (np. zwykłe kończą się wcześniej niż heroiki). */
  function learnMax(it) {
    if (it && it.id) { cfg.maxed = [...new Set((cfg.maxed || []).concat(Number(it.id)))].slice(-200); config.save(); }
    return;
    const lvl = enhLevel(it);
    if (lvl == null || !it.rarity) return;
    const m = store.get('up:maxlvl', {}) || {};
    if (m[it.rarity] == null || lvl < m[it.rarity]) { m[it.rarity] = lvl; store.set('up:maxlvl', m); }
  }
  const maxFor = (it) => { const m = store.get('up:maxlvl', {}) || {}; return Math.min(MAX_LVL, m[it && it.rarity] != null ? m[it.rarity] : MAX_LVL); };

  /** Ile ulepszeń zostało na dziś (null = nie wiadomo). Gra liczy każdy zużyty składnik. */
  function usagesLeft() {
    const u = cfg.usages;
    if (!u || !u.limit || u.day !== new Date().toDateString()) return null;
    return Math.max(0, u.limit - u.count);
  }
  const limitMsg = () => toast(`Ulepszarka: na dziś koniec — wykorzystano dzienny limit ulepszeń (${cfg.usages.count}/${cfg.usages.limit}). Limit odnowi się jutro`, 'warn', 6000);

  async function sendAll(p) {
    let n = 0, failed = false, limitHit = false;
    const steps = [];
    const saveSteps = () => store.set('up:last', { t: new Date().toISOString(), steps: steps.slice(-30) });
    const preview = async (target, list) => {
      const r = await net.send('enhancePreview', { item: target.id, ingredients: list.map((i) => i.id).join(',') }, { src: 'Ulepszarka', onResponse: maxResp({ target }) });
      steps.push({ a: 'preview', item: target.id, n: list.length, ok: r.ok, resp: short(r.data) }); saveSteps();
      return r;
    };
    const pvOf = (r) => r && r.data && r.data.enhancement && r.data.enhancement.progress_preview;
    try {
      outer: for (const o of p) {
        // każdy składnik sprawdzony jeszcze raz tuż przed wysłaniem
        let rest = o.list.filter((i) => { const f = game.itemById(i.id); return f && f.st === 0 && !NEVER.includes(f.rarity) && !targetIds().has(f.id); });
        while (rest.length) {
          const left = usagesLeft();
          if (left === 0) { limitHit = true; break outer; }
          let part = rest.slice(0, Math.min(16, left == null ? 16 : left));
          // dokładnie tak jak gra: najpierw podgląd, potem ulepszenie; na pytanie gry „Tak" klika Ulepszarka
          const rp = await preview(o.target, part);
          if (isMaxedResp(rp.data)) { learnMax(o.target); removeMaxed(o.target.id, o.target.name); continue outer; }   // przedmiot już na maksimum — sam znika z listy
          if (!rp.ok || badResp(rp.data)) { failed = true; break outer; }
          // podgląd zwraca składniki, które gra PRZYJMUJE — odrzucone (np. za niski poziom) zapamiętujemy i pomijamy
          let pv = pvOf(rp);
          if (pv && Array.isArray(pv.ingredients)) {
            const acc = new Set(pv.ingredients.map(Number));
            const rej = part.filter((i) => !acc.has(i.id)).map((i) => i.id);
            if (rej.length) { markRejected(o.target.id, rej); rest = rest.filter((i) => !rej.includes(i.id)); part = part.filter((i) => acc.has(i.id)); }
          }
          if (!part.length) continue;
          // nie przepalamy: jeśli te składniki dają więcej, niż brakuje do następnego poziomu — bierzemy najmniej,
          // ile trzeba, żeby go osiągnąć (szukanie połówkowe na podglądach, nic nie zużywają)
          const reach = (x) => x && Number(x.current) + Number(x.gained) >= Number(x.max);
          if (pv && Number(pv.max) > 0 && reach(pv) && part.length > 1) {
            let lo = 1, hi = part.length;
            while (lo < hi) {
              const mid = (lo + hi) >> 1;
              const t = pvOf(await preview(o.target, part.slice(0, mid)));
              if (reach(t)) hi = mid; else lo = mid + 1;
              await sleep(150);
            }
            part = part.slice(0, lo);
            steps.push({ a: 'trim', n: lo }); saveSteps();
          }
          const useIds = part.map((i) => i.id);
          const okIds = useIds.join(',');
          await sleep(300);
          ask.arm();
          const r = await net.send('enhance', { item: o.target.id, ingredients: okIds }, { src: 'Ulepszarka', onResponse: maxResp(o) });
          steps.push({ a: 'progress', item: o.target.id, n: part.length, ok: r.ok, resp: short(r.data) }); saveSteps();
          if (isMaxedResp(r.data)) { learnMax(o.target); removeMaxed(o.target.id, o.target.name); continue outer; }
          if (!r.ok || badResp(r.data)) { failed = true; break outer; }
          let gone = await waitGone(useIds, 3500);
          if (!gone) {
            if (msgIds(r.data).includes(Q_SURE)) {   // tylko na znane pytanie „czy na pewno"
              await net.send('enhanceAnswer', { item: o.target.id, ingredients: okIds, q: Q_SURE }, { src: 'Ulepszarka', onResponse: maxResp(o) });
              steps.push({ a: 'answer', q: Q_SURE }); saveSteps();
            }
            gone = await waitGone(useIds, 5000);
          }
          steps.push({ a: 'gone', n: gone }); saveSteps();
          if (!gone) { if (usagesLeft() === 0) limitHit = true; else failed = true; break outer; }
          n += gone;
          rest = rest.filter((i) => !useIds.includes(i.id));
          const sl = slots().find((x) => Number(x.id) === o.target.id);
          if (!sl) continue outer;
          if (sl.prog && sl.prog.lvl >= maxFor(o.target)) { learnMax(o.target); removeMaxed(o.target.id, o.target.name); continue outer; }   // osiągnął maksimum
          await sleep(500);
        }
      }
    } finally {
      ask.disarm();
      net.pushLog({ kind: 'info', src: 'Ulepszarka', msg: `Zużyto ${n} przedmiotów na ulepszanie${failed ? ' (przerwano)' : ''}${limitHit ? ' (dzienny limit)' : ''}` });
      if (limitHit) limitMsg();
      else if (failed) toast(n ? `Ulepszarka: zużyto ${n}, potem gra przestała przyjmować ulepszenie — przerwałam` : 'Ulepszarka: gra nie przyjęła ulepszenia — przerwałam', 'bad');
      else if (n) toast(`Ulepszarka: ulepszono — zużyto ${n} przedmiotów`, 'ok');
      rr();
    }
  }
  /** Odpowiedź serwera z błędem (np. „Błąd wewnętrzny", t:stop) → przerywamy natychmiast. */
  /*
   * Numery komunikatów gry przy ulepszaniu (z raportów):
   *   1001012 — pytanie „czy na pewno" (np. przy unikatach) → odpowiadamy „Tak"
   *   1001013 — przedmiot ma już maksymalny poziom ulepszenia → znika z listy
   */
  const Q_SURE = '1001012', MSG_MAXED = '1001013';
  const msgIds = (d) => { try { return (Array.isArray(d && d.message) ? d.message : []).map((m) => String(m && (m.id ?? m))); } catch { return []; } };
  /** Odpowiedź gry „przedmiot ma już maksymalny poziom" (komunikat 1001013, błąd albo poziom w podglądzie). */
  const isMaxedResp = (d) => {
    if (!d) return false;
    if (msgIds(d).includes(MSG_MAXED)) return true;
    try {
      const e = d.enhancement, pr = e && (e.progress_preview || e.progressing);
      if (pr && Number(pr.upgradeLevel) >= MAX_LVL) return true;
      if (pr && pr.max != null && Number(pr.max) === 0) return true;
      const msg = [d.e, d.w, d.alert, d.m].filter((x) => typeof x === 'string').join(' ');
      return /maks|maximum|najwy[żz]sz|osi[aą]gn[ąa][łl]\w* (ju[żz] )?(maks|najwy)|nie (mo[żz]na|da si[ęe]) (ju[żz] )?(bardziej )?ulepsz/i.test(msg);
    } catch { return false; }
  };
  function removeMaxed(id, name, why) {
    const i = slots().findIndex((s) => Number(s.id) === Number(id));
    if (i < 0) return;
    slots().splice(i, 1); config.save();
    toast(why ? `Ulepszarka: „${name}" — ${why} — zdjęto z listy` : `Ulepszarka: Przedmiot osiągnął maksymalny poziom — zdjęto z listy „${name}"`, 'ok', 5000);
    net.pushLog({ kind: 'info', src: 'Ulepszarka', msg: `„${name}" maksymalnie ulepszony — usunięty z listy` });
    rr();
  }
  const badResp = (d) => !!d && (d.t === 'stop' || d.t === 'reload' || (d.e && d.e !== 'ok'));
  const short = (d) => { try { const s = JSON.stringify(d); return s && s.length > 300 ? s.slice(0, 300) + '…' : s; } catch { return '?'; } };
  async function waitGone(ids, ms) {
    const t0 = now();
    while (now() - t0 < ms) {
      const bag = new Set(game.heroItems().map((i) => i.id));
      const g = ids.filter((id) => !bag.has(id)).length;
      if (g) { await sleep(200); const bag2 = new Set(game.heroItems().map((i) => i.id)); return ids.filter((id) => !bag2.has(id)).length; }
      await sleep(150);
    }
    return 0;
  }

  /*
   * Pytanie gry przy ulepszaniu („Czy na pewno…?") — przez kilka sekund po naszym ulepszeniu klikamy „Tak"
   * (ukryte, więc nic nie mignie). Odpowiedź wysyła sama gra, dokładnie jak przy ręcznym kliknięciu.
   */
  const askSeen = [];
  const ask = {
    until: 0, mo: null,
    arm() {
      this.until = now() + 8000;
      if (!this.mo) {
        // tylko NOWE okienka, które pojawią się po naszym ulepszeniu (pytanie gry „Czy na pewno…?")
        this.mo = new MutationObserver((muts) => { if (now() > this.until) return; for (const m of muts) for (const n of m.addedNodes) if (n.nodeType === 1) this.check(n); });
        this.mo.observe(document.body, { childList: true, subtree: true });
      }
    },
    disarm() { this.until = 0; },
    check(node) {
      if (node.closest && node.closest('.mp-glass, .mp-modal-bg, #mp-qpop')) return;
      const win = node.closest && node.closest('[class*="window"]');
      if (win && /rzemios/i.test(((win.querySelector('[class*="header"], [class*="title"]') || {}).textContent || ''))) return;   // nigdy przyciski w samym oknie rzemiosła
      const yesRe = /^\s*(tak|ok|akceptuj|potwierd[źz])\b/i;
      let btns = [node, ...node.querySelectorAll('*')].filter((b) => yesRe.test(b.textContent || '') && (b.textContent || '').trim().length < 20);
      btns = btns.filter((b) => !btns.some((o) => o !== b && b.contains(o)));
      const btn = btns[0];
      if (!btn) return;
      let box = btn;
      while (box.parentElement && box.parentElement !== document.body && (box.parentElement.textContent || '').length < 700) box = box.parentElement;
      if (box.__mpUp) return;
      box.__mpUp = true;
      const txt = (box.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 200);
      askSeen.unshift({ t: new Date().toISOString().slice(11, 19), txt }); if (askSeen.length > 5) askSeen.length = 5;
      box.style.setProperty('visibility', 'hidden', 'important');
      setTimeout(() => btn.click(), 30);
      net.pushLog({ kind: 'info', src: 'Ulepszarka', msg: 'Potwierdzono pytanie gry: ' + txt.slice(0, 120) });
    },
  };


  /*
   * Maksymalnie ulepszony przedmiot → sam znika z listy. Poziom ulepszenia czytamy ze statystyk przedmiotu
   * (np. enhancement_upgrade_lvl), a gdy ich brak — z opisu przedmiotu („+5", „maksymalny poziom ulepszenia").
   */
  const MAX_LVL = 5;
  function enhLevel(it) {
    if (!it) return null;
    for (const [k, v] of Object.entries(it.stats || {})) {
      if (/enhanc.*(lvl|level)|upgrade_?lvl|upg_?lvl|enh_?lvl/i.test(k)) { const n = parseInt(v, 10); if (!isNaN(n)) return n; }
    }
    return null;
  }
  /** Tekst opisu przedmiotu (dymek gry). */
  function tipText(it) {
    try {
      const f = it.raw && (it.raw.getTipContent || it.raw.getTipData);
      if (typeof f === 'function') { let t = f.call(it.raw); if (t && typeof t === 'object') t = JSON.stringify(t); return String(t || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '); }
    } catch {}
    return '';
  }
  function isMaxed(it) {
    if (!it) return false;
    if (cfg && cfg.maxed && cfg.maxed.includes(Number(it.id))) return true;
    if (/maksymaln\w* (poziom\w* )?ulepsz|ulepszon\w* maksymalnie|max(imum)? (enhancement|upgrade)|nie mo[żz]na (ju[żz] )?(bardziej )?ulepsz/i.test(tipText(it))) return true;
    const lvl = enhLevel(it);
    return lvl != null && lvl >= maxFor(it);
  }
  function dropMaxed() {
    if (!cfg) return false;
    let changed = false;
    for (let i = slots().length - 1; i >= 0; i--) {
      const s = slots()[i];
      const it = game.itemById(s.id);
      if (it && isMaxed(it)) {
        slots().splice(i, 1); changed = true;
        toast(`Ulepszarka: Przedmiot osiągnął maksymalny poziom — zdjęto z listy „${s.name}"`, 'ok', 5000);
        net.pushLog({ kind: 'info', src: 'Ulepszarka', msg: `„${s.name}" maksymalnie ulepszony — usunięty z listy` });
      }
    }
    if (changed) { config.save(); rr(); }
    return changed;
  }

  /*
   * Ulepszanie przy zapełnionej torbie: gdy wolnych miejsc jest tyle, ile ustawisz (lub mniej) — ulepsza wszystkie
   * wybrane przedmioty. Po próbie czeka, aż w torbie coś się zmieni (żeby nie powtarzać w kółko, gdy nie ma czego użyć).
   */
  let freeBlockSig = '', freeNag = 0;
  const bagSig = () => game.bag().map((i) => i.id).join(',');
  async function freeWatch() {
    if (!cfg || !cfg.enabled || running || !cfg.freeAuto || !slots().length) return;
    if (usagesLeft() === 0) return;
    if (game.inBattle() || document.querySelector('.mp-modal-bg')) return;
    const free = game.freeBagSlots();
    if (free == null || free > Number(cfg.freeAt)) { freeBlockSig = ''; return; }
    const sig = bagSig();
    if (sig === freeBlockSig) return;          // już próbowaliśmy przy tej zawartości torby
    freeBlockSig = sig;
    if (!plan().length) return;
    net.pushLog({ kind: 'info', src: 'Ulepszarka', msg: `Wolne miejsca w torbie: ${free} — ulepszam` });
    await run('free');
    freeBlockSig = bagSig();
  }

  /** Dane Ulepszarki do wspólnego raportu (Ogólne → Kopiuj raport). */
  function report() {
    const E0 = W.Engine || {};
    return {
      wersja: MP.version, komenda: net.cmd('enhance'),
      ostatnieUlepszanie: store.get('up:last', null),
      rzemiosloOtwarte: craftState(),
      ostatnieKomendyGry: net.recent.slice(0, 40),
      bledyStrony: store.get('errlog', []),
      craftingFns: (() => { try { const c = W.Engine && W.Engine.crafting; const o = new Set(); for (let q = c; q && q !== Object.prototype; q = Object.getPrototypeOf(q)) Object.getOwnPropertyNames(q).forEach((k) => { try { if (typeof c[k] === 'function') o.add(k); } catch {} }); return [...o].slice(0, 60); } catch { return null; } })(),
      wolneMiejsca: game.freeBagSlots(),
      torby: game.heroItems().filter((i) => i.stats.bag != null).map((i) => ({ nazwa: i.name, st: i.st, bag: i.stats.bag, cl: i.cl })),
      wTorbie: game.bag().length,
      cele: slots().map((sl) => { const it = game.itemById(sl.id); return { nazwa: sl.name, staty: it ? it.stats : null, poziom: enhLevel(it) }; }),
      ruchyPrzyRzemiosle: net.learnLog.slice(0, 15),
      engine: Object.keys(E0).filter((k) => /craft|enhanc|recip|rzem/i.test(k)),
      okna: $$('[class*="window"]').filter(isVisible).map((w) => String(w.className).slice(0, 80) + ' | ' + ((w.querySelector('[class*="header"], [class*="title"]') || {}).textContent || '').trim().slice(0, 40)).slice(0, 12),
      dialogi: askSeen.slice(0, 5),
      maksPoziomy: store.get('up:maxlvl', {}),
    };
  }

  /* ── wybór celu ── */
  /** Typy składników zajęte przez inne ulepszane przedmioty (każdy typ może karmić tylko jeden przedmiot). */
  function usedTypes(except) { const u = new Set(); slots().forEach((s) => { if (s !== except) s.types.forEach((t) => u.add(t)); }); return u; }
  const freeTypes = (except) => { const u = usedTypes(except); return TYPES.map((t) => t[0]).filter((k) => !u.has(k)); };
  function addTarget(id) {
    pickSlot = null; document.body.classList.remove('mp-up-picking');
    const it = game.itemById(id);
    if (!it) { toast('Ulepszarka: to nie jest Twój przedmiot', 'warn'); return; }
    const t = typeOf(it.cl);
    if (!t || (t === 'arrows' && !isArrow(it)) || (t !== 'arrows' && !isEquipment(it) && it.st === 0 && it.stats.amount != null)) { toast(`Ulepszarka: „${it.name}" nie da się ulepszać`, 'warn'); return; }
    if (targetIds().has(it.id)) { toast(`Ulepszarka: „${it.name}" już jest ulepszany`, 'info'); return; }
    if (isMaxed(it)) { toast(`Ulepszarka: „${it.name}" jest już maksymalnie ulepszony`, 'info'); return; }
    const free = freeTypes();
    if (!free.length) { toast('Ulepszarka: wszystkie typy przedmiotów są już zajęte — odznacz jakiś typ w innym ulepszanym przedmiocie', 'warn'); return; }
    slots().push({ id: it.id, name: it.name, icon: it.icon, type: t, rar: { common: true, unique: false, heroic: false }, types: free.includes(t) ? [t] : [] });
    config.save();
    toast(`Ulepszarka: ulepszam „${it.name}"`, 'ok');
    rr();
  }
  function removeSlot(i) { slots().splice(i, 1); config.save(); rr(); }
  let rr = () => {};
  function startPick() {
    pickSlot = true;
    document.body.classList.add('mp-up-picking');
    toast('Ulepszarka: kliknij przedmiot, który chcesz ulepszać (Esc — anuluj)', 'info');
  }

  function itemNode(t) { return t && t.closest && t.closest('[class*="item-id-"], [data-item-id]'); }
  function overDrop(x, y) { return $$('.mp-updrop').some((d) => { const r = d.getBoundingClientRect(); return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom && isVisible(d); }); }
  function watchPointer() {
    // tryb „kliknij przedmiot"
    document.addEventListener('click', (e) => {
      if (!pickSlot) return;
      const n = itemNode(e.target);
      if (!n || n.closest('.mp-glass')) return;
      e.preventDefault(); e.stopPropagation();
      addTarget(game.itemIdFromEl(n));
    }, true);
    document.addEventListener('keydown', (e) => { if (pickSlot && e.key === 'Escape') { pickSlot = null; document.body.classList.remove('mp-up-picking'); } }, true);
    // przeciąganie przedmiotu z gry na okienko (gra przeciąga myszką, nie przez HTML5 drag)
    document.addEventListener('mousedown', (e) => { const n = itemNode(e.target); dragId = n && !n.closest('.mp-glass') ? game.itemIdFromEl(n) : null; }, true);
    document.addEventListener('mouseup', (e) => {
      const id = dragId; dragId = null;
      if (id && overDrop(e.clientX, e.clientY)) { e.stopPropagation(); addTarget(id); }
    }, true);
    document.addEventListener('dragover', (e) => { if (e.target.closest && e.target.closest('.mp-updrop')) e.preventDefault(); }, true);
    document.addEventListener('drop', (e) => { if (e.target.closest && e.target.closest('.mp-updrop') && dragId) { e.preventDefault(); const id = dragId; dragId = null; addTarget(id); } }, true);
  }

  function chip(label, on, fn, taken) { return el('button', { class: 'mp-upchip' + (on ? ' on' : '') + (taken ? ' taken' : ''), title: taken ? 'Ten typ karmi już: ' + taken : '', onclick: taken ? () => toast(`Ulepszarka: ten typ jest już używany do ulepszania „${taken}"`, 'warn') : fn }, label); }
  function slotEl(s, idx) {
    const it = game.itemById(s.id);
    const cnt = candidates().filter((i) => fits(i, s)).length;
    return el('div', { class: 'mp-card mp-upslot' },
      el('div', { class: 'mp-uphead' },
        el('div', { class: 'mp-updrop has', title: 'Przeciągnij tu inny przedmiot tego typu, żeby go podmienić', onclick: startPick },
          s.icon ? el('img', { src: game.iconUrl(s.icon), alt: '' }) : null),
        el('div', { style: { flex: 1, minWidth: 0 } },
          el('b', null, s.name), el('div', { class: 'mp-dim' }, typeName(s.type) + (it ? (it.st ? ' · założony' : ' · w torbie') : ' · brak w ekwipunku'))),
        el('button', { class: 'mp-x', title: 'Przestań ulepszać', onclick: () => removeSlot(idx) }, icon('close', 14))),
      el('div', { class: 'mp-uplab' }, 'Ulepszam przedmiotami'),
      el('div', { class: 'mp-chips' }, RAR.map(([k, l]) => chip(l, s.rar[k], () => { s.rar[k] = !s.rar[k]; config.save(); rr(); }))),
      el('div', { class: 'mp-uplab' }, 'Typy przedmiotów'),
      el('div', { class: 'mp-chips' }, TYPES.map(([k, l]) => {
        const owner = slots().find((o) => o !== s && o.types.includes(k));
        return chip(l, s.types.includes(k), () => { s.types = s.types.includes(k) ? s.types.filter((x) => x !== k) : s.types.concat(k); config.save(); rr(); }, owner && owner.name);
      })),
      !s.types.length ? el('div', { class: 'mp-warnc', style: { marginTop: '6px' } }, 'Wybierz przynajmniej jeden typ — inaczej ten przedmiot nie będzie ulepszany.') : null,
      el('div', { class: 'mp-dim', style: { marginTop: '6px' } }, `Pasujące w torbie teraz: ${cnt}` + (s.prog && s.prog.max ? ` · poziom +${enhLevel(it) != null ? enhLevel(it) : s.prog.lvl} · postęp ${s.prog.cur} / ${s.prog.max}` : (enhLevel(it) != null ? ` · poziom +${enhLevel(it)}` : ''))),
      s.prog && s.prog.max ? el('div', { class: 'mp-upbar' }, el('i', { style: { width: Math.min(100, Math.round(100 * s.prog.cur / s.prog.max)) + '%' } })) : null);
  }

  defineAddon({
    id: 'ulepszarka', name: 'Ulepszarka', icon: 'ulepszarka', color: ['#ff6bd6', '#b23cff'], renderFirst: true,
    desc: 'Ulepszanie kilkoma przedmiotami naraz. Wskazujesz, co ulepszasz i czym — według rzadkości i typu (nigdy legendami) — a potem ulepszasz jednym przyciskiem albo klawiszem.',
    defaults: { slots: [], protect: [], protectNames: [], key: '', confirm: true, freeAuto: false, freeAt: 0 },
    keys: [{ key: 'key', label: 'ulepsz teraz', fn: () => run() }],
    notes: () => [
      !net.cmd('enhance').verified ? { type: 'info', text: 'Ulepsz raz ręcznie w oknie rzemiosła — Ulepszarka sama się nauczy.' } : null,
    ],
    settings: [
      { group: 'Ustawienia', key: 'key', type: 'key', label: 'Klawisz: ulepsz teraz' },
      { group: 'Ustawienia', key: 'confirm', type: 'bool', label: 'Pokazuj listę przedmiotów przed ulepszeniem', hint: 'Lista zużywanych przedmiotów z ich rzadkością (zwykły, unikat, heroiczny…).' },
      { group: 'Ulepszaj sama, gdy kończy się miejsce', key: 'freeAuto', type: 'bool', label: 'Włączone', rerender: true },
      { group: 'Ulepszaj sama, gdy kończy się miejsce', key: 'freeAt', type: 'number', show: (c) => c.freeAuto, label: 'Ulepsz, gdy w torbie zostanie tyle wolnych miejsc (0 = torba pełna)', min: 0, max: 100, hint: 'Gdy zostanie tyle wolnych miejsc (lub mniej), Ulepszarka sama ulepszy wszystkie wybrane przedmioty. 0 = dopiero gdy torba jest pełna. Nie działa w trakcie walki.' },
      { group: 'Ochrona', key: 'protectNames', type: 'list', label: 'Nigdy nie używaj (nazwy)', placeholder: 'nazwa + Enter' },
    ],
    render(box, c, rerender) {
      rr = () => { if (box.isConnected) rerender(); };
      if (dropMaxed()) return;
      slots().forEach((s, i) => box.appendChild(slotEl(s, i)));
      const free = freeTypes();
      if (free.length) {
        box.appendChild(el('div', { class: 'mp-card' },
          el('div', { class: 'mp-uphead' },
            el('div', { class: 'mp-updrop', title: 'Przeciągnij tu przedmiot albo kliknij i wskaż go w ekwipunku', onclick: startPick }, icon('plus', 18)),
            el('div', { style: { flex: 1 } },
              el('b', null, slots().length ? 'Dodaj kolejny przedmiot' : 'Wybierz przedmiot do ulepszania'),
              el('div', { class: 'mp-dim' }, 'Przeciągnij go tutaj albo kliknij okienko, a potem przedmiot. Możesz też: prawy klik na przedmiocie → „Ulepszaj w Ulepszarce".'))),
          slots().length ? el('div', { class: 'mp-dim', style: { marginTop: '6px' } }, 'Wolne typy do ulepszania: ' + TYPES.filter((t) => free.includes(t[0])).map((t) => t[1]).join(', ')) : null));
      } else {
        box.appendChild(el('div', { class: 'mp-card mp-dim' }, 'Wszystkie typy przedmiotów są już przypisane — nie można dodać kolejnego przedmiotu. Odznacz jakiś typ w ulepszanym przedmiocie, żeby zwolnić miejsce.'));
      }
      if (cfg.usages && cfg.usages.limit && cfg.usages.day === new Date().toDateString()) box.appendChild(el('div', { class: 'mp-dim', style: { margin: '4px 2px' } }, `Dzisiejsze ulepszenia: ${cfg.usages.count} / ${cfg.usages.limit}`));
      if (cfg.freeAuto) {
        const f = game.freeBagSlots();
        box.appendChild(el('div', { class: 'mp-dim', style: { margin: '4px 2px' } }, f == null ? 'Nie udało się odczytać wolnych miejsc w torbie.' : `Wolne miejsca w torbie teraz: ${f} · ulepszę przy ${Number(cfg.freeAt) ? cfg.freeAt + ' lub mniej' : 'pełnej torbie'}`));
      }
      box.appendChild(el('div', { class: 'mp-btns' },
        slots().length ? el('button', { class: 'mp-btn pri', onclick: () => run() }, cfg.key ? `Ulepsz teraz (${cfg.key})` : 'Ulepsz teraz') : null,
        null));
    },
    init(c) {
      cfg = c;
      if (!c._v18) {   // stary format (jeden cel + automat) → nowy
        c._v18 = true;
        const it = c.target && game.itemById(c.target);
        c.slots = it && typeOf(it.cl) ? [{ id: it.id, name: it.name, icon: it.icon, type: typeOf(it.cl), rar: { common: true, unique: !!c.useUnique, heroic: !!c.useHeroic }, types: TYPES.map((t) => t[0]) }] : [];
        ['target', 'targetName', 'useUnique', 'useHeroic', 'classes', 'maxPer', 'minLvl', 'auto', 'key', '_autoAck'].forEach((k) => delete c[k]);
        config.save();
      }
      if (!Array.isArray(c.protect)) c.protect = [];
      { const u = new Set(); slots().forEach((sl) => { sl.types = (sl.types || []).filter((t) => !u.has(t)); sl.types.forEach((t) => u.add(t)); }); }   // typ składników tylko u jednego przedmiotu
      watchPointer();
      // wyrzuciło z gry w trakcie ulepszania? — automatyczne ulepszanie wstrzymane, dopóki go nie wznowisz
      if (c.freeAuto === undefined) { c.freeAuto = Number(c.freeAt) > 0; config.save(); }
      store.del('up:inflight'); if (cfg.autoPaused) { delete cfg.autoPaused; config.save(); }
      // stara komenda z dopisaną odpowiedzią (powodowała wyrzucenie) — usuwamy
      try { if ((config.data.commands || {}).enhance) net.resetCmd('enhance'); } catch {}   // komenda jest wbudowana — żadnych nauczonych zamienników
      setInterval(() => { if (cfg.enabled && !running) dropMaxed(); }, 5000);
      setInterval(freeWatch, 1500);
      MP.ulepszarka = { addTarget, plan, run, craftState, typeOf, closeCraft, reportData: report, dropMaxed, enhLevel };
      menus.add('item', (id) => {
        if (!cfg.enabled) return [];
        const it = game.itemById(id);
        const out = [];
        if (!it || !isEquipment(it)) return [];      // mikstury, neutralne, zwoje itp. — bez opcji Ulepszarki
        if (!targetIds().has(it.id) && freeTypes().length && !isMaxed(it)) out.push({ label: 'Ulepszaj w Ulepszarce', fn: () => addTarget(id) });
        if (it.st === 0) out.push(cfg.protect.includes(id) ? { label: 'Zdejmij ochronę przed Ulepszarką', fn: () => { cfg.protect = cfg.protect.filter((x) => x !== id); config.save(); } } : { label: 'Chroń przed Ulepszarką', fn: () => { cfg.protect.push(id); config.save(); } });
        return out;
      });
      bus.on('cmd:learned', () => rr());
    },
  });
})();
