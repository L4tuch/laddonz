/* ───────── wspólny dekorator przedmiotów (Jaki To Bon, Podpisownik, Szybka rączka) ───────── */
const itemDeco = {
  painters: [],     // fn(itemEl, item) -> [{cls, text, title}] | null
  add(fn) { this.painters.push(fn); },
  run() {
    for (const node of game.itemEls()) {
      const id = game.itemIdFromEl(node);
      if (!id) continue;
      const it = game.itemById(id);
      const want = [];
      for (const p of this.painters) { try { const r = p(node, it, id); if (r) want.push(...[].concat(r)); } catch {} }
      const have = Array.from(node.querySelectorAll(':scope > .mp-ibadge:not(.chance)'));
      const sig = want.map((w) => w.cls + '|' + w.text).join(';');
      if (node.dataset.mpSig === sig && have.length === want.length) continue;
      have.forEach((h) => h.remove());
      if (want.length && getComputedStyle(node).position === 'static') node.style.position = 'relative';
      want.forEach((w) => node.appendChild(el('div', { class: 'mp-ibadge ' + w.cls, title: w.title || '' }, w.text)));
      node.dataset.mpSig = sig;
    }
  },
  start() {
    const run = debounce(() => this.run(), 150);
    new MutationObserver((muts) => { if (muts.some((m) => !(m.target.classList && m.target.classList.contains('mp-ibadge')))) run(); })
      .observe(document.body, { childList: true, subtree: true });
    setInterval(() => this.run(), 3000);
    bus.on('deco', run);
  },
};
MP.itemDeco = itemDeco;

/* ───────── Jaki To Bon ─────────
 * Skrót nazwy bonusu legendarnego w prawym górnym rogu przedmiotu (OR, CBK, …).
 */
(() => {
  let cfg;
  // Kody legbon → skrót. Kody pochodzą z danych gry (statystyka „legbon"); jeśli jakiś się nie zgadza,
  // popraw go w panelu — lista „Kody na Twoich przedmiotach" pokazuje, co faktycznie masz założone.
  const DEFAULT_MAP = {
    verycrit: 'CBK', lastheal: 'OR', holytouch: 'DA', curse: 'KL', pushback: 'OD', critred: 'KO', dmgred: 'FO', resgain: 'PO', glare: 'OŚ',
  };
  const NAMES = { verycrit: 'Cios bardzo krytyczny', lastheal: 'Ostatni ratunek', holytouch: 'Dotyk anioła', curse: 'Klątwa', pushback: 'Odrzucenie', critred: 'Krytyczna osłona', dmgred: 'Fizyczna osłona', resgain: 'Płomienne oczyszczenie', glare: 'Oślepienie' };

  function abbr(code) { return (cfg.map && cfg.map[code]) || code.slice(0, 3).toUpperCase(); }
  MP.legAbbr = (code) => (cfg ? abbr(code) : code);
  MP.legName = (code) => NAMES[code] || code;

  defineAddon({
    id: 'jakibon', name: 'Jaki To Bon', icon: 'jakibon', color: ['#ff9a3c', '#d4561c'],
    desc: 'Dodaje do założonych przedmiotów legendarnych skrót bonusu w prawym górnym rogu (OR — Ostatni ratunek, CBK — Cios bardzo krytyczny itd.).',
    defaults: { enabled: true, allItems: false, map: DEFAULT_MAP },
    settings: [{ key: 'allItems', type: 'bool', label: 'Pokazuj też na przedmiotach w torbach', hint: 'Domyślnie tylko założone.' }],
    render(box, c, rerender) {
      const tb = el('tbody');
      Object.entries(c.map).forEach(([code, ab]) => {
        const i = el('input', { class: 'mp-in', value: ab, style: { width: '70px' } });
        i.onchange = () => { c.map[code] = i.value.trim() || code; config.save(); bus.emit('deco'); };
        tb.appendChild(el('tr', null, el('td', { class: 'mp-mono' }, code), el('td', null, NAMES[code] || el('span', { class: 'mp-dim' }, '?')), el('td', null, i),
          el('td', null, el('button', { class: 'mp-mini', onclick: () => { delete c.map[code]; config.save(); rerender(); } }, '×'))));
      });
      const nc = el('input', { class: 'mp-in', placeholder: 'kod (np. verycrit)', style: { width: '140px' } });
      const na = el('input', { class: 'mp-in', placeholder: 'skrót', style: { width: '70px' } });
      const mine = [...new Set(game.heroItems().map((i) => i.legbon).filter(Boolean))];
      box.appendChild(el('div', { class: 'mp-card' }, el('h3', null, 'Skróty bonusów'),
        el('table', { class: 'mp-table' }, el('thead', null, el('tr', null, el('th', null, 'Kod'), el('th', null, 'Nazwa'), el('th', null, 'Skrót'), el('th'))), tb),
        el('div', { class: 'mp-btns' }, nc, na, el('button', { class: 'mp-btn', onclick: () => { if (nc.value.trim()) { c.map[nc.value.trim()] = na.value.trim() || nc.value.trim().slice(0, 3).toUpperCase(); config.save(); rerender(); } } }, 'Dodaj')),
        el('div', { class: 'mp-dim', style: { marginTop: '8px' } }, 'Kody na Twoich przedmiotach: ', mine.length ? el('span', { class: 'mp-mono' }, mine.join(', ')) : 'brak legend lub gra nie wczytana')));
    },
    init(c) {
      cfg = c;
      itemDeco.add((node, it) => {
        if (!cfg.enabled || !it || !it.legbon) return null;
        if (!cfg.allItems && !(it.st > 0)) return null;
        return { cls: 'bon', text: abbr(it.legbon), title: MP.legName(it.legbon) };
      });
    },
    onToggle() { bus.emit('deco'); },
  });
})();

/* ───────── Podpisownik ─────────
 * Własne podpisy na przedmiotach (np. kamienie teleportacyjne: „Ithan", „Eder"). Podpis widać w ekwipunku.
 */
(() => {
  let cfg;
  function labelFor(it, id) {
    if (cfg.byId[id]) return cfg.byId[id];
    if (!it) return null;
    const n = it.name.toLowerCase();
    for (const r of cfg.rules) { if (r.match && n.includes(r.match.toLowerCase())) return r.label; }
    if (cfg.autoTeleport && it.stats.teleport) {
      const parts = String(it.stats.teleport).split(',');
      const txt = parts.find((p) => /[a-ząćęłńóśźż]{3,}/i.test(p));
      if (txt) return txt.trim();
    }
    return null;
  }
  MP.podpis = { labelFor: (it, id) => (cfg && cfg.enabled ? labelFor(it, id) : null), isSigned: (id) => !!(cfg && cfg.byId[id]) };

  async function signItem(id) {
    const it = game.itemById(id);
    const cur = cfg.byId[id] || '';
    const towns = ['Ithan', 'Torneg', 'Werbin', 'Eder', 'Karka-han', 'Nithal', 'Tuzmer', 'Thuzal', 'Mythar', 'Port Tuzmer'];
    const isTp = it && (it.stats.teleport || /telepor|kamie[nń]|zw[oó]j/i.test(it.name));
    const head = it ? el('div', { class: 'mp-itemhead' }, it.icon ? el('img', { src: game.iconUrl(it.icon), alt: '' }) : null,
      el('div', null, el('b', null, it.name), el('div', { class: 'mp-dim', style: { fontSize: '11.5px' } }, cur ? 'Obecny podpis: ' + cur : 'Bez podpisu'))) : null;
    const v = await promptBox({
      title: 'Podpisz przedmiot', head, label: 'Krótki podpis, widoczny na przedmiocie w ekwipunku (do 14 znaków):',
      value: cur, placeholder: isTp ? 'np. Ithan' : 'np. na e2', maxLength: 14, suggestions: isTp ? towns : [], allowClear: true,
    });
    if (v === null) return;
    if (v) cfg.byId[id] = v.slice(0, 14); else delete cfg.byId[id];
    config.save(); bus.emit('deco');
    toast(v ? `Podpisano: ${v}` : 'Usunięto podpis', 'ok', 1500);
  }

  defineAddon({
    id: 'podpis', name: 'Podpisownik', icon: 'podpis', color: ['#78bcff', '#4a7fd8'],
    desc: 'Własne podpisy na przedmiotach (np. dokąd prowadzi kamień teleportacyjny), widoczne w ekwipunku. Prawy klik na przedmiocie → „Podpisz…" (albo Alt + prawy klik).',
    defaults: { enabled: true, byId: {}, rules: [], autoTeleport: true },
    settings: [{ key: 'autoTeleport', type: 'bool', label: 'Automatycznie podpisuj teleporty nazwą celu (jeśli gra ją podaje)' }],
    render(box, c, rerender) {
      const tb = el('tbody');
      c.rules.forEach((r, i) => tb.appendChild(el('tr', null, el('td', null, r.match), el('td', null, r.label), el('td', null, el('button', { class: 'mp-mini', onclick: () => { c.rules.splice(i, 1); config.save(); bus.emit('deco'); rerender(); } }, '×')))));
      const m = el('input', { class: 'mp-in', placeholder: 'nazwa zawiera…', style: { width: '170px' } });
      const l = el('input', { class: 'mp-in', placeholder: 'podpis', style: { width: '110px' } });
      box.appendChild(el('div', { class: 'mp-card' }, el('h3', null, 'Reguły według nazwy'),
        c.rules.length ? el('table', { class: 'mp-table' }, tb) : el('div', { class: 'mp-dim' }, 'Brak reguł.'),
        el('div', { class: 'mp-btns' }, m, l, el('button', { class: 'mp-btn', onclick: () => { if (m.value.trim() && l.value.trim()) { c.rules.push({ match: m.value.trim(), label: l.value.trim().slice(0, 14) }); config.save(); bus.emit('deco'); rerender(); } } }, 'Dodaj'))));
      const ids = Object.entries(c.byId);
      box.appendChild(el('div', { class: 'mp-card' }, el('h3', null, 'Podpisane pojedyncze przedmioty'),
        ids.length ? el('table', { class: 'mp-table' }, el('tbody', null, ids.map(([id, lb]) => el('tr', null, el('td', null, game.itemById(id)?.name || el('span', { class: 'mp-dim' }, '#' + id + ' (nie w EQ)')), el('td', null, lb), el('td', null, el('button', { class: 'mp-mini', onclick: () => { delete c.byId[id]; config.save(); bus.emit('deco'); rerender(); } }, '×'))))))
          : el('div', { class: 'mp-dim' }, 'Brak — prawy klik na przedmiocie → „Podpisz…".')));
    },
    init(c) {
      cfg = c;
      itemDeco.add((node, it, id) => { const lb = cfg.enabled && labelFor(it, id); return lb ? { cls: 'sig', text: lb, title: 'Podpisownik: ' + lb } : null; });
      menus.add('item', (id) => (cfg.enabled ? [{ label: '✎ Podpisz…', fn: () => signItem(id) }] : []));
    },
    onToggle() { bus.emit('deco'); },
  });
})();

/* ───────── Pokaż EQ ─────────
 * Po najechaniu na gracza (na mapie lub w „Kto tu jest?") pokazuje jego ekwipunek i podsumowanie bonusów legendarnych.
 */
(() => {
  let cfg, cache = {}, tip = null, pending = null, lastReq = 0, hoverId = null;

  function hide() { hoverId = null; tip && (tip.style.display = 'none'); }

  /**
   * Pobranie EQ gracza tak samo, jak robi to gra po kliknięciu „Pokaż ekwipunek":
   * wywołujemy funkcję gry showEq(), okno gry jest na ten czas niewidoczne, odczytujemy z niego
   * przedmioty i zamykamy je. (Sprawdzone diagnostyką: okno .showeq-window, przedmioty .item-id-<id>-showeq)
   */
  let busy = false;
  async function fetchEq(id) {
    const c = cache[id];
    if (c && now() - c.t < cfg.cacheSec * 1000) return c.items;
    if (busy || now() - lastReq < 1200) return null;   // nie spamujemy serwera
    const raw = game.otherRaw(id);
    if (!raw || typeof raw.showEq !== 'function') return null;
    busy = true; lastReq = now();
    const hideCss = el('style', null, '.showeq-window{visibility:hidden!important;pointer-events:none!important}');
    const already = $$('.showeq-window').filter(isVisible);
    document.head.appendChild(hideCss);
    let items = null;
    try {
      raw.showEq();
      const t0 = now();
      let w = null;
      while (now() - t0 < 2500) {
        await sleep(100);
        w = $$('.showeq-window').find((n) => !already.includes(n) && n.querySelector('[class*="-showeq"]'));
        if (w) { await sleep(150); break; }
      }
      if (w) {
        const ids = $$('[class*="item-id-"]', w).map((n) => { const m = String(n.className).match(/item-id-(\d+)-showeq/); return m ? Number(m[1]) : null; }).filter(Boolean);
        items = ids.map((iid) => {
          let it = null;
          try { it = E().items.getItemById(iid); } catch {}
          return it ? game.normItem(it) : null;
        }).filter(Boolean);
        const close = w.querySelector('.close-button, [class*="close-button"], .close, [class*="close"]');
        if (close) close.click(); else w.style.display = 'none';
      }
    } catch (e) { console.warn('[laddonz] showEq', e); }
    finally { setTimeout(() => hideCss.remove(), 200); busy = false; }
    if (items) cache[id] = { t: now(), items };
    return items;
  }

  async function show(id, x, y, force) {
    if (!cfg.enabled && !force) return;
    hoverId = id;
    const p = game.otherById(id);
    if (!tip) { tip = el('div', { id: 'mp-eqtip', class: 'mp-glass' }); document.body.appendChild(tip); }
    tip.style.display = 'block';
    tip.style.left = clamp(x, 4, innerWidth - 300) + 'px';
    tip.style.top = clamp(y, 4, innerHeight - 260) + 'px';
    tip.innerHTML = '';
    tip.appendChild(el('div', { style: { fontWeight: 700 } }, p ? `${p.nick} (${p.lvl}${p.prof})` : '#' + id));
    tip.appendChild(el('div', { class: 'mp-dim' }, 'Wczytuję ekwipunek…'));
    const items = await fetchEq(id);
    if (hoverId !== id) return;
    tip.lastChild.remove();
    if (!items) { tip.appendChild(el('div', { class: 'mp-warnc' }, 'Nie udało się pobrać — spróbuj za chwilę.')); return; }
    if (!items.length) { tip.appendChild(el('div', { class: 'mp-dim' }, 'Brak danych o przedmiotach.')); return; }
    const grid = el('div', { class: 'mp-eqgrid' }, items.slice(0, 18).map((it) => el('div', { class: 'mp-eqcell ' + it.rarity, title: `${it.name} (${it.rarity})` },
      el('img', { src: game.iconUrl(it.icon), alt: '' }), it.legbon ? el('div', { class: 'mp-ibadge bon' }, MP.legAbbr(it.legbon)) : null)));
    const sum = {};
    items.forEach((i) => { if (i.legbon) sum[i.legbon] = (sum[i.legbon] || 0) + 1; });
    const leg = items.filter((i) => i.rarity === 'legendary').length;
    tip.append(grid, el('div', { style: { fontSize: '12px' } },
      el('div', null, `Legendy: `, el('b', null, String(leg)), ` · Heroiki: `, el('b', null, String(items.filter((i) => i.rarity === 'heroic').length))),
      Object.keys(sum).length ? el('div', { style: { marginTop: '4px' } }, Object.entries(sum).map(([k, n]) => el('span', { class: 'mp-chip', style: { marginRight: '4px', padding: '2px 8px' } }, `${MP.legAbbr(k)} ×${n}`))) : el('div', { class: 'mp-dim' }, 'Brak bonusów legendarnych')));
  }

  /*
   * Najechanie na gracza NA MAPIE — dwa sposoby naraz:
   *  1) hak w prototypie gracza (funkcje tip/hover gry) → zdarzenie player:hover,
   *  2) zapas: dymek gry z nickiem (selektor w ustawieniach).
   */
  function watchHover() {
    let mx = 0, my = 0, shift = false, shownAt = null, hoverT = 0;
    document.addEventListener('mousemove', (e) => {
      mx = e.clientX; my = e.clientY; shift = e.shiftKey;
      // chowamy podgląd z mapy, gdy kursor odjedzie
      if (shownAt && Math.hypot(mx - shownAt.x, my - shownAt.y) > 60 && now() - hoverT > 350 && !document.querySelector('.mp-prow:hover')) { shownAt = null; hide(); }
    }, true);
    let pend = null;
    const want = (id) => {
      if (!cfg.enabled || !cfg.mapHover) return;
      if (cfg.needShift && !shift) return;
      hoverT = now();
      if (hoverId === id) return;
      clearTimeout(pend);
      pend = setTimeout(() => { shownAt = { x: mx, y: my }; show(id, mx + 18, my + 10); }, Number(cfg.delay) || 400);
    };
    bus.on('player:hover', (id) => want(id));
    const check = debounce(() => {
      if (!cfg.enabled || !cfg.mapHover || menus.hoverHooked) return;
      const tipSel = cfg.tipSelector.split('\n').map((s) => s.trim()).filter(Boolean).join(',');
      const t = tipSel && $$(tipSel).find((n) => isVisible(n) && !n.closest('.mp-glass'));
      if (!t) return;
      const txt = t.textContent.toLowerCase();
      const p = game.others().find((o) => o.nick && txt.includes(o.nick.toLowerCase()));
      if (p) want(p.id);
    }, 120);
    new MutationObserver(check).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class'] });
  }

  MP.pokazEq = { show: (id, x, y) => (cfg.enabled && cfg.listHover ? show(id, x, y) : null), showForce: (id, x, y) => { show(id, x, y, true); setTimeout(() => document.addEventListener('mousedown', hide, { once: true, capture: true }), 50); }, hide };

  defineAddon({
    id: 'pokazeq', name: 'Pokaż EQ', icon: 'pokazeq', color: ['#b48cff', '#7c5cff'],
    desc: 'Po najechaniu na gracza pokazuje jego ekwipunek, a na dole podsumowanie bonusów legendarnych.',
    defaults: { mapHover: true, listHover: true, needShift: true, delay: 450, cacheSec: 120, tipSelector: '.tip-wrapper.normal-tip' },
    notes: () => [{ type: 'info', text: 'Podgląd korzysta z tej samej funkcji co „Pokaż ekwipunek" w grze. Każdy podgląd to jedno zapytanie do serwera, dlatego na mapie domyślnie trzeba trzymać Shift, a wynik jest pamiętany przez 2 minuty.' }],
    settings: [
      { key: 'mapHover', type: 'bool', label: 'Najechanie na gracza na mapie' },
      { key: 'listHover', type: 'bool', label: 'Najechanie na gracza w „Kto tu jest?"' },
      { key: 'needShift', type: 'bool', label: 'Tylko z wciśniętym Shift (mapa)' },
      { key: 'delay', type: 'number', label: 'Opóźnienie (ms)', min: 150, max: 3000 },
      { key: 'cacheSec', type: 'number', label: 'Pamiętaj wynik przez (s)', min: 10, max: 1800 },
      { key: 'tipSelector', type: 'textarea', label: 'Selektor dymka gracza w grze' },
    ],
    init(c) { cfg = c; watchHover(); },
    onToggle(on) { if (!on) hide(); },
  });
})();
