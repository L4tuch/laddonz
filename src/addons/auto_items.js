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
    if (cfg.list.some(has)) return who || true;
    if (cfg.party) for (const n of partyNicks()) if (has(n)) return who || n;
    const p = who ? game.otherByNick(who) : game.others().find((o) => t.includes(lc(o.nick)));
    if (p && ((cfg.clan && p.isClan) || (cfg.friends && p.isFriend))) return p.nick;
    return null;
  }
  const YES_RE = /^\s*(tak|akceptuj|przyjmij|zgoda|ok)\b/i;
  const active = () => cfg && cfg.enabled && !(cfg.notInBattle && game.inBattle());
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
    id: 'taxi', name: 'Fake Taxi', icon: 'taxi', color: ['#ffe14d', '#f0b400'], risk: 'auto',
    desc: 'Automatycznie przyjmuje przywołania („…przyzywa do siebie swoją drużynę!") od wybranych osób — domyślnie od członków Twojej grupy.',
    defaults: { party: true, list: [], clan: false, friends: false, notInBattle: true },
    settings: [
      { key: 'party', type: 'bool', label: 'Od członków grupy' },
      { key: 'friends', type: 'bool', label: 'Od znajomych' },
      { key: 'clan', type: 'bool', label: 'Od klanowiczów' },
      { key: 'list', type: 'list', label: 'Zawsze od (nicki)', placeholder: 'nick + Enter' },
      { key: 'notInBattle', type: 'bool', label: 'Nie w trakcie walki' },
    ],
    init(c) {
      cfg = c;
      if ('auto' in c || 'dialogSelector' in c) { delete c.auto; delete c.dialogSelector; config.save(); }
      hookAlerts();
      setInterval(hookAlerts, 3000);   // gra może podmienić funkcje po wczytaniu
      new MutationObserver(scan).observe(document.body, { childList: true, subtree: true });
    },
  });
})();

/* ───────── Auto f ─────────
 * Włączone = na starcie każdej walki postać od razu przechodzi na szybką walkę.
 * Do tego jest przełącznik na liście dodatków — np. przy kolosie, gdy odchodzisz od komputera.
 */
(() => {
  let cfg, doneFor = 0;
  defineAddon({
    id: 'autof', name: 'Auto f', icon: 'autof', color: ['#ffd447', '#ff8a00'], risk: 'auto',
    desc: 'Włącz/wyłącz. Gdy jest włączony, każda walka od razu przechodzi na szybką walkę — np. przy kolosie, gdy odchodzisz od komputera, a reszta nie musi czekać na Twoją turę.',
    defaults: { enabled: false, delayMin: 250, delayMax: 600 },
    notes: () => [{ type: 'warn', text: 'To automat: działa bez Twojego kliknięcia, dopóki go nie wyłączysz.' }],
    settings: [
      { key: 'delayMin', type: 'number', label: 'Opóźnienie od (ms)', min: 100, max: 3000 },
      { key: 'delayMax', type: 'number', label: 'Opóźnienie do (ms)', min: 150, max: 4000 },
    ],
    init(c) {
      cfg = c;
      bus.on('battle:start', () => {
        if (!cfg.enabled) return;
        const t = now(); if (t - doneFor < 2000) return; doneFor = t;
        setTimeout(() => { if (game.inBattle()) net.send('fastFight', {}, { src: 'Auto f', urgent: true }); }, rnd(cfg.delayMin, Math.max(cfg.delayMin + 50, cfg.delayMax)));
      });
    },
    onToggle(on) { toast(on ? 'Auto f: włączony' : 'Auto f: wyłączony', on ? 'warn' : 'info', 1600); },
  });
})();

/* ───────── Szybka rączka ─────────
 * Prawy klik na przedmiocie → „Użyj po walce": zaraz po zakończeniu walki przedmiot zostanie użyty
 * (teleporty, mikstury, przywołania…) — tak, jakbyś sam kliknął na nim „Użyj". Bez klawiszy i konfiguracji.
 * Prawy klik na ikonie grupy → „Rozwiąż grupę po walce".
 */
(() => {
  let cfg;
  const S = { disbandArmed: false };

  function queued(id) { return cfg.queue.find((q) => q.id === Number(id)); }
  function toggleQueue(id) {
    const it = game.itemById(id);
    const i = cfg.queue.findIndex((q) => q.id === Number(id));
    if (i >= 0) { cfg.queue.splice(i, 1); toast(`Szybka rączka: „${it ? it.name : id}" nie zostanie użyty po walce`); }
    else { cfg.queue.push({ id: Number(id), name: it ? it.name : '#' + id, tp: !!(it && (it.stats.teleport || it.stats.custom_teleport || /telepor|zwój|kamień/i.test(it.name))) }); toast(`Szybka rączka: „${it ? it.name : id}" zostanie użyty po walce`); }
    config.save(); bus.emit('deco');
  }

  /** Użycie przedmiotu jak przez gracza: menu przedmiotu → „Użyj". Zapas: komenda użycia (podsłuchana albo domyślna). */
  async function useItem(id) {
    const node = $$(`.item.item-id-${id}`).find((n) => !/-showeq/.test(String(n.className)));
    if (node && await menus.chooseItemOption(node, /^(u[żz]yj|teleportuj|przywo[łl]aj|wypij|zjedz|otw[óo]rz)/i)) return true;
    const r = await net.send('useItem', { id }, { src: 'Szybka rączka' });
    return r.ok;
  }

  let running = false;
  async function runQueue() {
    if (running) return;
    running = true;
    try {
      // najpierw rozwiązanie grupy (nie zmienia mapy), potem przedmioty — teleporty na końcu
      if (S.disbandArmed) { S.disbandArmed = false; MP.cook ? MP.cook.disband() : net.send('partyDisband', {}, { src: 'Szybka rączka', urgent: true }); }
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
      menus.showOwn(e.clientX, e.clientY, [
        { label: S.disbandArmed ? 'Anuluj „rozwiąż po walce"' : 'Rozwiąż grupę po walce', fn: armDisband },
        { label: 'Rozwiąż grupę teraz', fn: () => (MP.cook ? MP.cook.disband() : net.send('partyDisband', {}, { src: 'Szybka rączka' })) },
      ], 'Grupa');
    }, true);
  }

  defineAddon({
    id: 'szybka', name: 'Szybka rączka', icon: 'szybka', color: ['#40e0d0', '#1a9e9e'], risk: 'auto',
    desc: 'Prawy klik na przedmiocie → „Użyj po walce": zaraz po zakończeniu walki przedmiot zostanie użyty (teleporty, mikstury, przywołania…). Przedmiot czekający na użycie ma w rogu ikonkę zegara. Prawy klik na ikonie grupy → „Rozwiąż grupę po walce".',
    defaults: { queue: [], partySelector: '.widget-party\n[class*="widget-party"]\n.party-icon' },
    settings: [
      { group: 'Zaawansowane', key: 'partySelector', type: 'textarea', label: 'Selektor ikony grupy', hint: 'Zmień tylko, jeśli menu na ikonie grupy się nie pokazuje.' },
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
      menus.add('item', (id) => {
        if (!cfg.enabled) return [];
        return queued(id) ? [{ label: 'Nie używaj po walce', fn: () => toggleQueue(id) }]
          : [{ label: 'Użyj po walce', fn: () => toggleQueue(id) }];
      });
      itemDeco.add((node, it, id) => (cfg.enabled && queued(id) ? { cls: 'queued', icon: 'clock', title: 'Szybka rączka: zostanie użyty po walce' } : null));
      // od razu po zakończeniu walki
      bus.on('battle:end', () => { if (cfg.enabled && cfg.queue.length + (S.disbandArmed ? 1 : 0)) runQueue(); });
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
  /** Okno rzemiosła z gry (ulepszanie) — zamykane po ulepszeniu. */
  function closeCraft() {
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
  function candidates() {
    const queue = new Set((addons.cfg('szybka')?.queue || []).map((q) => Number(q.id)));
    const tg = targetIds();
    return game.bag().filter((i) => {
      if (i.st !== 0 || tg.has(i.id) || NEVER.includes(i.rarity)) return false;
      if (MP.podpis && MP.podpis.isSigned(i.id)) return false;
      if (queue.has(i.id) || cfg.protect.includes(i.id) || nickIn(cfg.protectNames, i.name)) return false;
      return true;
    });
  }
  /** Przydział: każdy składnik do pierwszego celu, któremu pasuje. */
  function plan() {
    const out = slots().map((s) => ({ s, target: game.itemById(s.id), list: [] }));
    for (const i of candidates()) { const o = out.find((o) => o.target && fits(i, o.s)); if (o) o.list.push(i); }
    return out.filter((o) => o.target && o.list.length);
  }

  /** Odpowiedź gry „maksymalny poziom" → przedmiot znika z listy. */
  const maxResp = (o) => (data) => {
    let txt = ''; try { txt = JSON.stringify(data || {}); } catch {}
    if (/maksymaln|max(imum)? ?(lvl|level|poziom)/i.test(txt)) {
      const i = slots().findIndex((s) => Number(s.id) === o.target.id);
      if (i >= 0) { slots().splice(i, 1); config.save(); toast(`Ulepszarka: „${o.target.name}" jest już maksymalnie ulepszony — usunięto z listy`, 'ok'); rr(); }
    }
  };
  async function run(src) {
    if (running) return;
    if (game.inBattle()) { toast('Ulepszarka: najpierw skończ walkę', 'warn'); return; }
    dropMaxed();
    if (!slots().length) { toast('Ulepszarka: najpierw wskaż przedmiot do ulepszania', 'warn'); return; }
    const c = net.cmd('enhance');
    if (!c.t || !c.verified) { toast('Ulepszarka: ulepsz raz ręcznie w oknie rzemiosła — wtedy się nauczy', 'warn'); return; }
    const p = plan();
    if (!p.length) { toast('Ulepszarka: brak pasujących przedmiotów', 'info'); return; }
    if (cfg.confirm) {
      const items = []; p.forEach((o) => o.list.forEach((i) => items.push(el('span', null, i.name, ' ', el('span', { class: 'mp-rar ' + i.rarity }, RAR_PL[i.rarity] || i.rarity), el('span', { class: 'mp-dim' }, ' → ' + o.target.name)))));
      const ok = await confirmBox({ title: 'Ulepszyć teraz?', okText: 'Ulepsz', html: `Zużyję <b>${items.length}</b> przedmiotów:`, items });
      if (!ok) return;
    }
    running = true;
    let n = 0;
    const used = [];
    try {
      for (const o of p) {
        // każdy składnik sprawdzony jeszcze raz tuż przed wysłaniem
        const fresh = o.list.filter((i) => { const f = game.itemById(i.id); return f && f.st === 0 && !NEVER.includes(f.rarity) && !targetIds().has(f.id); });
        for (let k = 0; k < fresh.length; k += 20) {
          const part = fresh.slice(k, k + 20);
          if (c.t.includes('{ingredients}')) await net.send('enhance', { item: o.target.id, ingredients: part.map((i) => i.id).join(',') }, { src: 'Ulepszarka', onResponse: maxResp(o) });
          else for (const i of part) { await net.send('enhance', { item: o.target.id, id: i.id, ingredients: i.id }, { src: 'Ulepszarka', onResponse: maxResp(o) }); await sleep(250); }
          n += part.length; used.push(...part.map((i) => i.id));
        }
      }
      net.pushLog({ kind: 'info', src: 'Ulepszarka', msg: `Wysłano ${n} przedmiotów do ulepszenia` });
      // sprawdzenie: czy przedmioty naprawdę zniknęły? Jeśli nie — zapamiętana komenda jest zła, uczymy się od nowa
      setTimeout(() => {
        const bag = new Set(game.heroItems().map((i) => i.id));
        const gone = used.filter((id) => !bag.has(id)).length;
        if (cfg.closeCraft) closeCraft();
        dropMaxed();
        if (!gone && used.length) {
          // zapamiętana (nauczona) komenda nie zadziałała → wracamy do wbudowanej
          const own = (config.data.commands || {}).enhance;
          if (own) { net.resetCmd('enhance'); toast('Ulepszarka: gra nie przyjęła ulepszenia — przywróciłam domyślną komendę, spróbuj jeszcze raz', 'bad'); }
          else toast('Ulepszarka: gra nie przyjęła ulepszenia (żaden przedmiot nie zniknął)', 'bad');
        } else toast(`Ulepszarka: ulepszono — zużyto ${gone} przedmiotów`, 'ok');
        rr();
      }, 1500);
    } finally { running = false; rr(); }
  }

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
  function isMaxed(it) {
    const lvl = enhLevel(it);
    if (lvl != null) return lvl >= MAX_LVL;
    try {
      const f = it.raw && (it.raw.getTipContent || it.raw.getTipData);
      if (typeof f === 'function') {
        let t = f.call(it.raw); if (t && typeof t === 'object') t = JSON.stringify(t);
        const txt = String(t || '').replace(/<[^>]+>/g, ' ');
        if (/maksymaln\w* (poziom\w* )?ulepsz|ulepszon\w* maksymalnie|max(imum)? (enhancement|upgrade)/i.test(txt)) return true;
      }
    } catch {}
    return false;
  }
  function dropMaxed() {
    if (!cfg) return false;
    let changed = false;
    for (let i = slots().length - 1; i >= 0; i--) {
      const s = slots()[i];
      const it = game.itemById(s.id);
      if (it && isMaxed(it)) {
        slots().splice(i, 1); changed = true;
        toast(`Ulepszarka: „${s.name}" jest już maksymalnie ulepszony — usunięto z listy`, 'ok');
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
  let freeBlockSig = '';
  const bagSig = () => game.bag().map((i) => i.id).join(',');
  async function freeWatch() {
    if (!cfg || !cfg.enabled || running || !(Number(cfg.freeAt) > 0) || !slots().length) return;
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

  /** Raport do wysłania twórcy, gdy samouczenie nie zadziała. */
  function report() {
    const E0 = W.Engine || {};
    const r = {
      wersja: MP.version, komenda: net.cmd('enhance'),
      wolneMiejsca: game.freeBagSlots(),
      torby: game.heroItems().filter((i) => i.stats.bag != null).map((i) => ({ nazwa: i.name, st: i.st, bag: i.stats.bag, cl: i.cl })),
      wTorbie: game.bag().length,
      cele: slots().map((sl) => { const it = game.itemById(sl.id); return { nazwa: sl.name, staty: it ? it.stats : null, poziom: enhLevel(it) }; }),
      ruchyPrzyRzemiosle: net.learnLog.slice(0, 15),
      engine: Object.keys(E0).filter((k) => /craft|enhanc|recip|rzem/i.test(k)),
      okna: $$('[class*="window"]').filter(isVisible).map((w) => String(w.className).slice(0, 80) + ' | ' + ((w.querySelector('[class*="header"], [class*="title"]') || {}).textContent || '').trim().slice(0, 40)).slice(0, 12),
    };
    const txt = JSON.stringify(r, null, 1);
    const fallback = () => { const t = el('textarea', { style: { position: 'fixed', left: '-9999px' } }); t.value = txt; document.body.appendChild(t); t.select(); try { document.execCommand('copy'); } catch {} t.remove(); };
    try { navigator.clipboard.writeText(txt).catch(fallback); } catch { fallback(); }
    toast('Ulepszarka: raport skopiowany — wklej go w rozmowie', 'ok');
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
    if (!t) { toast(`Ulepszarka: „${it.name}" nie da się ulepszać`, 'warn'); return; }
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
      el('div', { class: 'mp-dim', style: { marginTop: '6px' } }, `Pasujące w torbie teraz: ${cnt}`));
  }

  defineAddon({
    id: 'ulepszarka', name: 'Ulepszarka', icon: 'ulepszarka', color: ['#ff6bd6', '#b23cff'], renderFirst: true,
    desc: 'Wskaż przedmiot do ulepszania i wybierz, czym go karmić: rzadkość (zwykłe, unikaty, heroiki — nigdy legendy) i typy przedmiotów. Ulepszasz przyciskiem albo klawiszem — to zwykłe ulepszanie z gry, tylko kilka przedmiotów naraz. Każdy typ składników może być przypisany tylko do jednego ulepszanego przedmiotu.',
    defaults: { slots: [], protect: [], protectNames: [], key: '', confirm: true, closeCraft: true, freeAt: 0 },
    keys: [{ key: 'key', label: 'ulepsz teraz', fn: () => run() }],
    notes: () => [
      !net.cmd('enhance').verified ? { type: 'info', text: 'Ulepsz raz ręcznie w oknie rzemiosła — Ulepszarka sama się nauczy.' } : null,
    ],
    settings: [
      { group: 'Ustawienia', key: 'key', type: 'key', label: 'Klawisz: ulepsz teraz' },
      { group: 'Ustawienia', key: 'confirm', type: 'bool', label: 'Pokazuj listę przedmiotów przed ulepszeniem', hint: 'Lista zużywanych przedmiotów z ich rzadkością (zwykły, unikat, heroiczny…).' },
      { group: 'Ustawienia', key: 'closeCraft', type: 'bool', label: 'Zamykaj okno rzemiosła po ulepszeniu' },
      { group: 'Ulepszaj sama, gdy kończy się miejsce', key: 'freeAt', type: 'number', label: 'Ulepsz, gdy w torbie zostanie tyle wolnych miejsc', min: 0, max: 100, hint: '0 = wyłączone. Np. 3 — gdy zostaną 3 wolne miejsca (lub mniej), Ulepszarka sama ulepszy wszystkie wybrane przedmioty pasującymi składnikami. Nie działa w trakcie walki.' },
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
      if (Number(cfg.freeAt) > 0) {
        const f = game.freeBagSlots();
        box.appendChild(el('div', { class: 'mp-dim', style: { margin: '4px 2px' } }, f == null ? 'Nie udało się odczytać wolnych miejsc w torbie — kliknij „Kopiuj raport" i wklej w rozmowie.' : `Wolne miejsca w torbie teraz: ${f} · ulepszę przy ${cfg.freeAt} lub mniej`));
      }
      box.appendChild(el('div', { class: 'mp-btns' },
        slots().length ? el('button', { class: 'mp-btn pri', onclick: () => run() }, cfg.key ? `Ulepsz teraz (${cfg.key})` : 'Ulepsz teraz') : null,
        el('button', { class: 'mp-btn', title: 'Gdy ulepszanie nie działa — skopiuj i wklej w rozmowie', onclick: report }, 'Kopiuj raport'),
        (config.data.commands || {}).enhance ? el('button', { class: 'mp-btn', title: 'Wróć do wbudowanej komendy ulepszania', onclick: () => { net.resetCmd('enhance'); rr(); } }, 'Przywróć domyślne') : null));
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
      setInterval(() => { if (cfg.enabled && !running) dropMaxed(); }, 5000);
      setInterval(freeWatch, 1500);
      MP.ulepszarka = { addTarget, plan, run, typeOf, closeCraft, report, dropMaxed, enhLevel };
      menus.add('item', (id) => {
        if (!cfg.enabled) return [];
        const it = game.itemById(id);
        const out = [];
        if (it && typeOf(it.cl) && !targetIds().has(it.id) && freeTypes().length) out.push({ label: 'Ulepszaj w Ulepszarce', fn: () => addTarget(id) });
        if (it && it.st === 0) out.push(cfg.protect.includes(id) ? { label: 'Zdejmij ochronę przed Ulepszarką', fn: () => { cfg.protect = cfg.protect.filter((x) => x !== id); config.save(); } } : { label: 'Chroń przed Ulepszarką', fn: () => { cfg.protect.push(id); config.save(); } });
        return out;
      });
      bus.on('cmd:learned', () => rr());
    },
  });
})();
