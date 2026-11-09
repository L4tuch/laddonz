/* ───────── Śmieciara ─────────
 * Usuwa TYLKO przedmioty, którym minęła ważność. Zawsze pokazuje listę do potwierdzenia.
 * Bezpieczniki: nigdy założone, nigdy podpisane, ponowne sprawdzenie ważności tuż przed usunięciem,
 * komenda usuwania musi być zweryfikowana (Diagnostyka).
 */
(() => {
  let cfg, running = false;

  function scan() {
    return game.bag().filter((i) => i.expired && i.st === 0 && !(MP.podpis && MP.podpis.isSigned(i.id)) && !nickIn(cfg.keep, i.name));
  }

  async function run() {
    if (running) return;
    if (game.inBattle()) { toast('Śmieciara: najpierw skończ walkę', 'warn'); return; }
    const list = scan();
    if (!list.length) { toast('Śmieciara: brak przedmiotów po terminie ważności', 'ok'); return; }
    const c = net.cmd('destroyItem');
    if (!c.t || !c.verified) {
      await confirmBox({ title: 'Śmieciara jest zablokowana', okText: 'OK', html: `Znalazłam <b>${list.length}</b> przedmiotów po terminie, ale komenda usuwania nie jest jeszcze zweryfikowana.<br><br>Usuń ręcznie JEDEN bezwartościowy przedmiot, a potem w <b>Diagnostyka → Podsłuch</b> przypisz go do „Usunięcie przedmiotu".`, items: list.map((i) => i.name) });
      return;
    }
    const ok = await confirmBox({
      title: `Usunąć ${list.length} przedmiotów?`, danger: true, okText: 'Usuń', countdown: 3,
      html: 'Te przedmioty <b>straciły ważność</b>. Operacji nie da się cofnąć.', items: list.map((i) => `${i.name} — ważny do ${new Date(i.expires * 1000).toLocaleString()}`),
    });
    if (!ok) return;
    running = true;
    let n = 0;
    try {
      for (const i of list) {
        const fresh = game.itemById(i.id);                       // ponowna kontrola tuż przed usunięciem
        if (!fresh || !fresh.expired || fresh.st !== 0) continue;
        const r = await net.send('destroyItem', { id: i.id }, { src: 'Śmieciara' });
        if (r.ok) n++;
        await sleep(350);
      }
    } finally { running = false; }
    toast(`Śmieciara: usunięto ${n} z ${list.length}`, 'ok');
  }

  defineAddon({
    id: 'smieciara', name: 'Śmieciara', icon: 'smieciara', color: ['#8b93a7', '#555d70'], risk: 'destructive',
    desc: 'Usuwa z ekwipunku wszystkie przedmioty, które straciły ważność — zawsze po pokazaniu listy i Twoim potwierdzeniu.',
    defaults: { key: '', keep: [] },
    keys: [{ key: 'key', label: 'sprzątnij', fn: () => run() }],
    notes: () => [!net.cmd('destroyItem').verified ? { type: 'bad', text: 'Usuwanie zablokowane, dopóki nie zweryfikujesz komendy w Diagnostyce. Do tego czasu Śmieciara tylko pokazuje listę.' } : null],
    settings: [
      { key: 'key', type: 'key', label: 'Klawisz: sprzątnij przeterminowane' },
      { key: 'keep', type: 'list', label: 'Nigdy nie usuwaj (dokładna nazwa)', placeholder: 'nazwa + Enter' },
    ],
    render(box) {
      const l = scan();
      box.appendChild(el('div', { class: 'mp-card' }, el('h3', null, `Teraz po terminie: ${l.length}`),
        l.length ? el('ul', { style: { margin: 0, paddingLeft: '18px' } }, l.map((i) => el('li', null, i.name))) : el('div', { class: 'mp-dim' }, 'Nic.'),
        el('div', { class: 'mp-btns' }, el('button', { class: 'mp-btn bad', onclick: () => run() }, 'Sprzątnij…'))));
    },
    init(c) { cfg = c; },
  });
})();

/* ───────── Fake Taxi ─────────
 * Automatyczna akceptacja przywołań od wybranych osób (AUTOMAT, domyślnie wyłączony).
 * Działa przez kliknięcie przycisku „Tak" w oknie przywołania gry — dokładnie to, co zrobiłbyś sam.
 */
(() => {
  let cfg;
  function whoAllowed(text) {
    const t = text.toLowerCase();
    if (cfg.list.some((n) => t.includes(String(n).toLowerCase()))) return true;
    const p = game.others().find((o) => t.includes(o.nick.toLowerCase()));
    if (p && ((cfg.clan && p.isClan) || (cfg.friends && p.isFriend))) return true;
    return false;
  }
  function scan() {
    if (!cfg.enabled || !cfg.auto) return;
    if (cfg.notInBattle && game.inBattle()) return;
    const sel = cfg.dialogSelector.split('\n').map((s) => s.trim()).filter(Boolean).join(',');
    for (const d of $$(sel).filter(isVisible)) {
      if (d.dataset.mpTaxi) continue;
      const text = d.textContent || '';
      if (!/przywo[łl]/i.test(text)) continue;
      d.dataset.mpTaxi = '1';
      if (!whoAllowed(text)) continue;
      const btn = $$('button, .button, .btn, [class*="accept"], [class*="yes"]', d).find((b) => /^(tak|akceptuj|przyjmij|zgoda|ok)\b/i.test((b.textContent || '').trim()));
      if (!btn) continue;
      setTimeout(() => { btn.click(); toast('Fake Taxi: przyjęto przywołanie', 'ok'); net.pushLog({ kind: 'info', src: 'Fake Taxi', msg: 'Kliknięto „Tak" w przywołaniu' }); }, rnd(400, 900));
    }
  }
  defineAddon({
    id: 'taxi', name: 'Fake Taxi', icon: 'taxi', color: ['#ffe14d', '#f0b400'], risk: 'auto',
    desc: 'Automatycznie przyjmuje przywołania od wybranych osób (lista nicków, opcjonalnie klan i znajomi).',
    defaults: { auto: false, list: [], clan: false, friends: false, notInBattle: true, dialogSelector: '.alert-window\n.ask-window\n.mAlert\n.dialog' },
    notes: () => [{ type: 'info', text: 'Panel klika przycisk „Tak" w oknie przywołania. Jeśli to nie działa, wskaż klasę okna przywołania (F12) w polu „Selektor okna".' }],
    settings: [
      { key: 'auto', type: 'bool', auto: true, label: 'Przyjmuj automatycznie', confirm: 'To automatyzacja — przywołania będą przyjmowane bez Twojego kliknięcia. Na własne ryzyko.', countdown: 2 },
      { key: 'list', type: 'list', label: 'Od kogo (nicki)', placeholder: 'nick + Enter' },
      { key: 'clan', type: 'bool', label: 'Także od klanowiczów' },
      { key: 'friends', type: 'bool', label: 'Także od znajomych' },
      { key: 'notInBattle', type: 'bool', label: 'Nie w trakcie walki' },
      { key: 'dialogSelector', type: 'textarea', label: 'Selektor okna przywołania' },
    ],
    init(c) { cfg = c; new MutationObserver(debounce(scan, 200)).observe(document.body, { childList: true, subtree: true }); },
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
 * Prawy klik na przedmiocie → „Użyj po walce": przedmiot zostanie użyty zaraz po zakończeniu walki
 * (teleporty, mikstury, przywołania…). Prawy klik na ikonie grupy → „Rozwiąż grupę po walce".
 * Wykonanie po walce to AUTOMAT — domyślnie wyłączony; bez niego kolejkę odpalasz klawiszem.
 */
(() => {
  let cfg;
  const S = { disbandArmed: false };

  function queued(id) { return cfg.queue.find((q) => q.id === Number(id)); }
  function toggleQueue(id) {
    const it = game.itemById(id);
    const i = cfg.queue.findIndex((q) => q.id === Number(id));
    if (i >= 0) { cfg.queue.splice(i, 1); toast('Szybka rączka: usunięto z kolejki', 'info', 1500); }
    else { cfg.queue.push({ id: Number(id), name: it ? it.name : '#' + id, tp: !!(it && (it.stats.teleport || /telepor|zwój|kamień/i.test(it.name))) }); toast(`Szybka rączka: „${it ? it.name : id}" po walce`, 'ok', 1600); }
    config.save(); bus.emit('deco'); indicator();
  }

  async function runQueue(src) {
    if (game.inBattle()) return;
    const items = cfg.queue.slice().sort((a, b) => a.tp - b.tp);   // teleporty na końcu (zmieniają mapę)
    for (const q of items) {
      const it = game.itemById(q.id);
      if (!it) { cfg.queue = cfg.queue.filter((x) => x.id !== q.id); continue; }
      await net.send('useItem', { id: q.id }, { src: 'Szybka rączka' });
      cfg.queue = cfg.queue.filter((x) => x.id !== q.id);
      await sleep(400);
    }
    if (S.disbandArmed) { S.disbandArmed = false; MP.cook ? await MP.cook.disband() : await net.send('partyDisband', {}, { src: 'Szybka rączka' }); }
    config.save(); bus.emit('deco'); indicator();
    if (src === 'key' && !items.length) toast('Szybka rączka: kolejka pusta', 'info', 1400);
  }

  function armDisband() {
    S.disbandArmed = !S.disbandArmed;
    toast(S.disbandArmed ? 'Grupa zostanie rozwiązana po walce' : 'Anulowano rozwiązanie grupy po walce', S.disbandArmed ? 'ok' : 'info');
    indicator();
  }

  /* mały wskaźnik: co czeka na koniec walki */
  function indicator() {
    let n = document.getElementById('mp-szybka-ind');
    const cnt = cfg.queue.length + (S.disbandArmed ? 1 : 0);
    if (!cfg.enabled || !cnt) { n && n.remove(); return; }
    if (!n) {
      const p = store.get('win:szybka-ind', { x: innerWidth - 230, y: 120 });
      n = el('div', { id: 'mp-szybka-ind', class: 'mp-glass', style: { position: 'fixed', zIndex: 2147482994, left: p.x + 'px', top: p.y + 'px', padding: '6px 10px', borderRadius: '11px', display: 'flex', gap: '8px', alignItems: 'center', fontSize: '12px', cursor: 'move' } });
      makeDraggable(n, n, (pos) => store.set('win:szybka-ind', pos));
      document.body.appendChild(n);
    }
    n.innerHTML = '';
    n.append(el('div', { class: 'mp-tile', style: { width: '22px', height: '22px', borderRadius: '7px', background: grad(['#40e0d0', '#1a9e9e']) } }, icon('szybka', 13)),
      el('div', null, el('b', null, 'Po walce: '), [cfg.queue.length ? `${cfg.queue.length} przedm.` : null, S.disbandArmed ? 'rozwiąż grupę' : null].filter(Boolean).join(' + '),
        cfg.auto ? null : el('span', { class: 'mp-dim' }, ` (klawisz ${cfg.key || '—'})`)));
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
        { label: S.disbandArmed ? '✖ Anuluj „rozwiąż po walce"' : '⏱ Rozwiąż grupę po walce', fn: armDisband },
        { label: '✖ Rozwiąż grupę teraz', fn: () => (MP.cook ? MP.cook.disband() : net.send('partyDisband', {}, { src: 'Szybka rączka' })) },
      ], 'Grupa');
    }, true);
  }

  defineAddon({
    id: 'szybka', name: 'Szybka rączka', icon: 'szybka', color: ['#40e0d0', '#1a9e9e'], risk: 'auto',
    desc: 'Prawy klik na przedmiocie → „Użyj po walce" (teleporty, mikstury, przywołania…). Prawy klik na ikonie grupy → „Rozwiąż grupę po walce".',
    defaults: { key: '', auto: false, queue: [], partySelector: '.party-icon\n.party-button\n.widget-button.party\n[class*="party-widget"]' },
    keys: [{ key: 'key', label: 'wykonaj kolejkę', fn: () => runQueue('key') }],
    notes: () => [{ type: 'info', text: 'Bez trybu automatycznego kolejka czeka na Twój klawisz — wtedy to nadal Twoje kliknięcie. Jeśli menu na ikonie grupy się nie pokazuje, wpisz jej klasę (F12) w „Selektor ikony grupy".' }],
    settings: [
      { key: 'key', type: 'key', label: 'Klawisz: wykonaj kolejkę teraz' },
      { key: 'auto', type: 'bool', auto: true, label: 'Wykonuj automatycznie po zakończeniu walki', confirm: 'To automatyzacja — przedmioty będą używane (a grupa rozwiązywana) bez Twojego kliknięcia. Na własne ryzyko.', countdown: 2 },
      { key: 'partySelector', type: 'textarea', label: 'Selektor ikony grupy' },
    ],
    render(box, c, rerender) {
      const tb = el('tbody', null, c.queue.map((q, i) => el('tr', null, el('td', null, q.name, q.tp ? el('span', { class: 'mp-dim' }, ' (teleport)') : null),
        el('td', null, el('button', { class: 'mp-mini', onclick: () => { c.queue.splice(i, 1); config.save(); bus.emit('deco'); indicator(); rerender(); } }, '×')))));
      box.appendChild(el('div', { class: 'mp-card' }, el('h3', null, 'Kolejka „po walce"'),
        c.queue.length ? el('table', { class: 'mp-table' }, tb) : el('div', { class: 'mp-dim' }, 'Pusta — prawy klik na przedmiocie → „Użyj po walce" (lub Alt + prawy klik).'),
        el('div', { class: 'mp-btns' },
          el('button', { class: 'mp-btn ' + (S.disbandArmed ? 'bad' : ''), onclick: () => { armDisband(); rerender(); } }, S.disbandArmed ? 'Anuluj: rozwiąż grupę po walce' : 'Rozwiąż grupę po walce'),
          el('button', { class: 'mp-btn pri', onclick: () => runQueue('key') }, 'Wykonaj teraz'))));
    },
    init(c) {
      cfg = c;
      menus.add('item', (id) => {
        if (!cfg.enabled) return [];
        return queued(id) ? [{ label: '✖ Usuń z „po walce"', fn: () => toggleQueue(id) }]
          : [{ label: '⏱ Użyj po walce', fn: () => toggleQueue(id) }];
      });
      itemDeco.add((node, it, id) => (cfg.enabled && queued(id) ? { cls: 'queued', text: '⏱', title: 'Szybka rączka: użyj po walce' } : null));
      bus.on('battle:end', () => { if (cfg.enabled && cfg.auto) setTimeout(() => runQueue('auto'), rnd(500, 900)); });
      hookPartyIcon();
      setTimeout(indicator, 1500);
    },
    onToggle() { indicator(); bus.emit('deco'); },
  });
})();

/* ───────── Ulepszarka ─────────
 * Ulepsza wybrany przedmiot składnikami z torby, wybranymi wg rzadkości. Pod klawisz albo (AUTOMAT) po walce.
 * Twarde bezpieczniki: nigdy założone, nigdy legendy/artefakty/ulepszone, nigdy podpisane ani z kolejki
 * Szybkiej rączki, heroiki tylko po osobnym potwierdzeniu, komenda musi być zweryfikowana.
 */
(() => {
  let cfg, running = false;
  const HARD_BLOCK = ['legendary', 'artefact', 'upgraded'];

  function ingredients() {
    const allowed = new Set(['common', cfg.useUnique && 'unique', cfg.useHeroic && 'heroic'].filter(Boolean));
    const classes = new Set(String(cfg.classes).split(',').map((s) => Number(s.trim())).filter(Boolean));
    const queue = new Set((addons.cfg('szybka')?.queue || []).map((q) => q.id));
    return game.bag().filter((i) => {
      if (i.id === cfg.target || i.st !== 0) return false;
      if (HARD_BLOCK.includes(i.rarity) || !allowed.has(i.rarity)) return false;
      if (classes.size && !classes.has(i.cl)) return false;
      if (MP.podpis && MP.podpis.isSigned(i.id)) return false;
      if (queue.has(i.id) || cfg.protect.includes(i.id) || nickIn(cfg.protectNames, i.name)) return false;
      if (cfg.minLvl && Number(i.stats.lvl || 0) < cfg.minLvl) return false;
      return true;
    }).slice(0, cfg.maxPer);
  }

  async function enhance(src) {
    if (running) return;
    if (game.inBattle()) return;
    const target = game.itemById(cfg.target);
    if (!target) { if (src === 'key') toast('Ulepszarka: ustaw przedmiot do ulepszania (prawy klik → „Cel ulepszania")', 'warn'); return; }
    const c = net.cmd('enhance');
    if (!c.t || !c.verified) { if (src === 'key') toast('Ulepszarka: zweryfikuj komendę ulepszania w Diagnostyce', 'bad'); return; }
    const list = ingredients();
    if (!list.length) { if (src === 'key') toast('Ulepszarka: brak pasujących składników', 'info'); return; }
    if (src === 'key' || !cfg._autoAck) {
      const ok = await confirmBox({ title: `Ulepszyć „${target.name}"?`, danger: true, okText: 'Ulepsz', countdown: 2, html: `Zużyję <b>${list.length}</b> przedmiotów:`, items: list.map((i) => `${i.name} (${i.rarity})`) });
      if (!ok) return;
      if (src === 'auto') { cfg._autoAck = true; config.save(); }
    }
    running = true;
    try {
      // każdy składnik jeszcze raz sprawdzony tuż przed wysłaniem
      const fresh = list.filter((i) => { const f = game.itemById(i.id); return f && f.st === 0 && !HARD_BLOCK.includes(f.rarity); });
      const tpl = c.t;
      if (tpl.includes('{ingredients}')) {
        await net.send('enhance', { item: target.id, ingredients: fresh.map((i) => i.id).join(',') }, { src: 'Ulepszarka' });
      } else {
        for (const i of fresh) { await net.send('enhance', { item: target.id, id: i.id, ingredients: i.id }, { src: 'Ulepszarka' }); await sleep(300); }
      }
      toast(`Ulepszarka: użyto ${fresh.length} składników`, 'ok');
    } finally { running = false; }
  }

  function setTarget(id) {
    const it = game.itemById(id);
    if (!it) return;
    cfg.target = it.id; cfg.targetName = it.name; config.save();
    toast(`Ulepszarka: cel = ${it.name}`, 'ok');
  }

  defineAddon({
    id: 'ulepszarka', name: 'Ulepszarka', icon: 'ulepszarka', color: ['#ff6bd6', '#b23cff'], risk: 'destructive',
    desc: 'Ulepsza wybrany przedmiot pod klawisz, używając składników z torby wg rzadkości (np. tylko zwykłe, albo zwykłe + unikaty). Opcjonalnie po każdej walce.',
    defaults: { key: '', target: 0, targetName: '', useUnique: false, useHeroic: false, classes: '1,2,3,4,5,6,7,8,9,10,11,12,13,14,29', maxPer: 10, minLvl: 0, protect: [], protectNames: [], auto: false },
    keys: [{ key: 'key', label: 'ulepsz', fn: () => enhance('key') }],
    notes: (c) => [
      !net.cmd('enhance').verified ? { type: 'bad', text: 'Ulepszanie zablokowane, dopóki nie zweryfikujesz komendy: ulepsz ręcznie przedmiot jednym składnikiem, potem Diagnostyka → Podsłuch → „Ulepszenie przedmiotu".' } : null,
      { type: 'info', text: 'Nigdy nie są używane jako składniki: założone przedmioty, legendy, artefakty, przedmioty ulepszone, podpisane w Podpisowniku i te z kolejki Szybkiej rączki.' },
    ],
    settings: [
      { group: 'Cel', key: 'target', type: 'select', label: 'Przedmiot do ulepszania', rerender: true, options: () => [[0, '— wybierz —'], ...game.heroItems().filter((i) => i.cl >= 1 && i.cl <= 14 || i.cl === 29).map((i) => [i.id, `${i.name}${i.st ? ' (założony)' : ''}`]), ...(cfg && cfg.target && !game.itemById(cfg.target) ? [[cfg.target, cfg.targetName + ' (brak w EQ)']] : [])] },
      { group: 'Cel', key: 'key', type: 'key', label: 'Klawisz: ulepsz' },
      { group: 'Składniki', key: 'useUnique', type: 'bool', label: 'Używaj unikatów', hint: 'Zwykłe przedmioty są zawsze dozwolone.' },
      { group: 'Składniki', key: 'useHeroic', type: 'bool', label: 'Używaj heroików', danger: true, countdown: 3, confirm: 'Heroiczne przedmioty zostaną <b>spalone</b> w ulepszaniu. Na pewno?' },
      { group: 'Składniki', key: 'maxPer', type: 'number', label: 'Maks. składników na raz', min: 1, max: 30 },
      { group: 'Składniki', key: 'minLvl', type: 'number', label: 'Minimalny poziom składnika', min: 0, max: 500 },
      { group: 'Składniki', key: 'classes', type: 'text', label: 'Klasy przedmiotów (cl)', hint: 'Domyślnie: broń, zbroje, biżuteria, tarcze, kołczany.' },
      { group: 'Składniki', key: 'protectNames', type: 'list', label: 'Nigdy nie używaj (nazwy)' },
      { group: 'Automat', key: 'auto', type: 'bool', auto: true, label: 'Ulepszaj automatycznie po każdej walce', danger: true, countdown: 3, confirm: 'Po każdej walce panel zużyje pasujące składniki bez pytania (pierwszy raz pokaże listę). Na własne ryzyko.' },
    ],
    render(box) {
      const l = ingredients();
      box.appendChild(el('div', { class: 'mp-card' }, el('h3', null, `Składniki teraz: ${l.length}`),
        l.length ? el('ul', { style: { margin: 0, paddingLeft: '18px' } }, l.map((i) => el('li', null, `${i.name} `, el('span', { class: 'mp-dim' }, i.rarity)))) : el('div', { class: 'mp-dim' }, 'Brak pasujących przedmiotów.'),
        el('div', { class: 'mp-btns' }, el('button', { class: 'mp-btn pri', onclick: () => enhance('key') }, 'Ulepsz teraz…'))));
    },
    init(c) {
      cfg = c;
      menus.add('item', (id) => {
        if (!cfg.enabled) return [];
        const it = game.itemById(id);
        const out = [];
        if (it && ((it.cl >= 1 && it.cl <= 14) || it.cl === 29)) out.push({ label: '✦ Cel ulepszania', fn: () => setTarget(id) });
        if (it && it.st === 0) out.push(cfg.protect.includes(id) ? { label: '🔓 Zdejmij ochronę przed Ulepszarką', fn: () => { cfg.protect = cfg.protect.filter((x) => x !== id); config.save(); } } : { label: '🔒 Chroń przed Ulepszarką', fn: () => { cfg.protect.push(id); config.save(); } });
        return out;
      });
      bus.on('battle:end', () => { if (cfg.enabled && cfg.auto) setTimeout(() => enhance('auto'), rnd(1200, 1800)); });
    },
    onChange(k) { if (k === 'target') { const it = game.itemById(cfg.target); cfg.targetName = it ? it.name : ''; config.save(); } if (k === 'auto') { cfg._autoAck = false; config.save(); } },
  });
})();
