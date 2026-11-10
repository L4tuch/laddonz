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
    verycrit: 'CBK', lastheal: 'OR', holytouch: 'DA', curse: 'KL', pushback: 'OD', critred: 'KO', dmgred: 'FO', cleanse: 'PO', cleansing: 'PO', glare: 'OŚ',
  };
  const NAMES = { verycrit: 'Cios bardzo krytyczny', lastheal: 'Ostatni ratunek', holytouch: 'Dotyk anioła', curse: 'Klątwa', pushback: 'Odrzucenie', critred: 'Krytyczna osłona', dmgred: 'Fizyczna osłona', cleanse: 'Płomienne oczyszczenie', cleansing: 'Płomienne oczyszczenie', glare: 'Oślepienie' };

  function abbr(code) {
    if (cfg.map && cfg.map[code]) return cfg.map[code];
    if (/^cle/i.test(code)) return 'PO';            // Płomienne oczyszczenie (różne warianty kodu)
    return code.slice(0, 3).toUpperCase();
  }
  MP.legAbbr = (code) => (cfg ? abbr(code) : code);
  MP.legName = (code) => NAMES[code] || (/^cle/i.test(code) ? 'Płomienne oczyszczenie' : code);

  defineAddon({
    id: 'jakibon', name: 'Jaki To Bon', icon: 'jakibon', color: ['#ff9a3c', '#d4561c'],
    desc: 'Dodaje do założonych przedmiotów legendarnych skrót bonusu w prawym górnym rogu (OR — Ostatni ratunek, CBK — Cios bardzo krytyczny itd.).',
    defaults: { enabled: false, allItems: false, map: DEFAULT_MAP },
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
      if (!c._v16) { c._v16 = true; c.map = c.map || {}; if (c.map.resgain === 'PO') delete c.map.resgain; c.map.cleanse = 'PO'; c.map.cleansing = 'PO'; c.map.dmgred = c.map.dmgred || 'FO'; config.save(); }
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
    const head = it ? el('div', { class: 'mp-itemhead' }, it.icon ? el('img', { src: /^data:/.test(it.icon) ? it.icon : game.iconUrl(it.icon), alt: '' }) : null,
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
    defaults: { enabled: false, byId: {}, rules: [], autoTeleport: true },
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
 * Najechanie na gracza (na mapie albo na liście graczy) → okno w stylu dymka gry, które ZASTĘPUJE dymek gry:
 * informacje z dymka + postać z outfitem + ekwipunek ułożony jak w grze + podsumowanie bonusów.
 * Dane pobieramy tą samą funkcją co „Pokaż ekwipunek" w grze (okno gry jest na ten czas niewidoczne).
 * Gra opisuje przedmioty innych graczy szablonami (item-tpl-<nr>) — szukamy ich w danych gry na kilka sposobów.
 */
(() => {
  let cfg, cache = {}, tip = null, hoverId = null, lastReq = 0;
  let busy = false, wanted = null, anchor = null, userEqClick = 0, activeHide = null;
  const seenItems = new Map();      // dane przedmiotów/szablonów, które przeszły przez grę (id → obiekt, 'tpl:<nr>' → obiekt)

  function hide() {
    hoverId = null; wanted = null; anchor = null;
    document.body.classList.remove('mp-eq-on');
    if (tip) tip.style.display = 'none';
  }

  /** Zbiera obiekty wyglądające na przedmiot/szablon (mają name + stat lub icon). */
  function collectItems(obj, out, depth = 0) {
    if (!obj || typeof obj !== 'object' || depth > 3 || obj instanceof Node) return;
    if (obj.name && (obj.stat !== undefined || obj.icon)) {
      if (obj.id || obj.id === 0) out[String(obj.id)] = obj;
      if (obj.tpl) out['tpl:' + obj.tpl] = obj;
      return;
    }
    for (const [k, v] of Object.entries(obj)) {
      if (v && typeof v === 'object' && !(v instanceof Node)) {
        // słownik { idPrzedmiotu: {...} } — klucz to id
        if (v.name && (v.stat !== undefined || v.icon) && /^\d+$/.test(k) && !(v.id || v.id === 0)) out[k] = v;
        collectItems(v, out, depth + 1);
      }
    }
  }
  /** Podpinamy się pod funkcje gry, przez które przechodzą przedmioty i szablony. */
  function hookItemFlow() {
    const wrap = (obj, name) => {
      if (!obj || typeof obj[name] !== 'function' || obj[name].__mpEq) return;
      const f = obj[name];
      obj[name] = function (...a) {
        try { const o = {}; for (const x of a) if (x && typeof x === 'object') collectItems(x, o); for (const [k, v] of Object.entries(o)) seenItems.set(k, v); } catch {}
        return f.apply(this, a);
      };
      obj[name].__mpEq = true;
    };
    try { const I = E().items; ['newItem', 'newItemInLocation', 'updateItem', 'updateDATA'].forEach((n) => wrap(I, n)); } catch {}
    try {
      const T = E().tpls;
      if (T) {
        const names = new Set(Object.keys(T));
        for (let o = Object.getPrototypeOf(T); o && o !== Object.prototype; o = Object.getPrototypeOf(o)) Object.getOwnPropertyNames(o).forEach((n) => names.add(n));
        [...names].filter((n) => /update|add|set|new|parse/i.test(n) && n !== 'constructor').forEach((n) => wrap(T, n));
      }
    } catch {}
  }

  /** Kontenery w Engine.items / Engine.tpls, w których gra trzyma przedmioty i szablony (Map albo słownik id → obiekt). */
  let contCache = { t: 0, list: [] };
  function containers() {
    if (now() - contCache.t < 5000) return contCache.list;
    const list = [];
    const looks = (v) => v && typeof v === 'object' && (v.name || v.stat !== undefined);
    const consider = (c) => {
      if (!c || typeof c !== 'object' || c instanceof Node) return;
      if (c instanceof Map) { for (const v of c.values()) { if (looks(v)) list.push(c); break; } return; }
      if (Array.isArray(c)) return;
      const ks = Object.keys(c);
      for (let i = 0; i < Math.min(ks.length, 5); i++) if (/^\d+$/.test(ks[i]) && looks(c[ks[i]])) { list.push(c); return; }
    };
    for (const root of [E() && E().items, E() && E().tpls]) {
      if (!root) continue;
      consider(root);
      for (const v of Object.values(root)) { consider(v); if (v && typeof v === 'object' && !(v instanceof Map) && !Array.isArray(v) && !(v instanceof Node)) for (const w of Object.values(v)) consider(w); }
    }
    contCache = { t: now(), list };
    return list;
  }
  const fromContainers = (key) => {
    for (const c of containers()) {
      const v = c instanceof Map ? (c.get(key) || c.get(String(key)) || c.get(Number(key))) : (c[key] || c[String(key)]);
      if (v && (v.name || v.stat !== undefined)) return v;
    }
    return null;
  };
  /** Funkcje gry typu get…(nrSzablonu) w Engine.tpls. */
  const fromTplApi = (tpl) => {
    const T = E() && E().tpls;
    if (!T || !tpl) return null;
    const names = new Set();
    for (let o = T; o && o !== Object.prototype; o = Object.getPrototypeOf(o)) Object.getOwnPropertyNames(o).forEach((n) => names.add(n));
    for (const n of names) {
      if (!/^get/i.test(n) || /fetch|load|request|send/i.test(n)) continue;
      try { const f = T[n]; if (typeof f !== 'function') continue; const r = f.call(T, tpl) || f.call(T, String(tpl)); if (r && typeof r === 'object' && (r.name || r.stat !== undefined)) return r; } catch {}
    }
    return null;
  };
  /** Dane przypięte przez jQuery do elementu przedmiotu. */
  const fromJq = (n) => {
    try {
      const $ = W.$ || W.jQuery; if (!$ || !$(n).data) return null;
      const d = $(n).data(); for (const v of Object.values(d || {})) if (v && typeof v === 'object' && (v.name || v.stat !== undefined)) return v;
    } catch {}
    return null;
  };

  /** Rzadkość z elementu DOM (data-item-type np. „t-uniupg") — zapas, gdy brak danych przedmiotu. */
  function rarityFromEl(n) {
    const t = (n.getAttribute('data-item-type') || '') + ' ' + (n.querySelector('.highlight') ? n.querySelector('.highlight').className : '');
    if (/leg/i.test(t)) return 'legendary';
    if (/art/i.test(t)) return 'artefact';
    if (/her/i.test(t)) return 'heroic';
    if (/upg/i.test(t) && !/uni/i.test(t)) return 'upgraded';
    if (/uni/i.test(t)) return 'unique';
    return 'common';
  }

  const shown = (n) => n && n.isConnected && getComputedStyle(n).display !== 'none' && n.getBoundingClientRect().width > 0;
  const sigOf = (n) => $$('[class*="-showeq"]', n).map((x) => x.className).join('|');

  async function fetchRaw(id) {
    const raw = game.otherRaw(id);
    if (!raw || typeof raw.showEq !== 'function') return null;
    // sam masz otwarte okno „Ekwipunek Postaci" — nie ruszamy go
    if ($$('.showeq-window').some((n) => shown(n) && getComputedStyle(n).visibility !== 'hidden')) return 'own-window';
    hookItemFlow();
    const before = new Map($$('.showeq-window').map((n) => [n, shown(n) + '#' + sigOf(n)]));
    const hideCss = el('style', null, '.showeq-window{visibility:hidden!important;pointer-events:none!important}');
    document.head.appendChild(hideCss);
    activeHide = hideCss;
    const seen = {};
    const off = bus.on('data', (d) => collectItems(d, seen));
    const t0 = now();
    let items = null, w = null;
    const dbg = { id, ids: [], tpls: [], src: {}, fromDom: 0 };
    try {
      raw.showEq();
      while (now() - t0 < 3000) {
        await sleep(25);
        w = $$('.showeq-window').find((n) => shown(n) && n.querySelector('[class*="-showeq"]') && before.get(n) !== true + '#' + sigOf(n));
        if (w) break;
      }
      if (w) {
        const els = $$('[class*="item-id-"]', w).filter((n) => /item-id-\d+-showeq/.test(String(n.className)));
        const ids = els.map((n) => Number(String(n.className).match(/item-id-(\d+)-showeq/)[1]));
        const tpls = els.map((n) => Number((String(n.className).match(/item-tpl-(\d+)/) || [])[1]) || 0);
        dbg.ids = ids; dbg.tpls = tpls;
        const rects = els.map((n) => n.getBoundingClientRect());
        const ways = [
          ['store', (iid) => { const I = E().items; return I.getItemById(iid) || I.getItemById(String(iid)) || I.getItemById(iid + '-showeq'); }],
          ['hook', (iid) => seenItems.get(String(iid))],
          ['data', (iid) => seen[String(iid)]],
          ['jq', (iid, tpl, n) => fromJq(n)],
          ['cont', (iid) => fromContainers(iid)],
          ['tplHook', (iid, tpl) => tpl && (seenItems.get('tpl:' + tpl) || seen['tpl:' + tpl])],
          ['tplApi', (iid, tpl) => fromTplApi(tpl)],
          ['tplCont', (iid, tpl) => tpl && fromContainers(tpl)],
        ];
        const lookup = (i) => {
          for (const [name, f] of ways) { try { const r = f(ids[i], tpls[i], els[i]); if (r && (r.name || r.stat !== undefined)) { dbg.src[name] = (dbg.src[name] || 0) + 1; return r; } } catch {} }
          return null;
        };
        let found = els.map((n, i) => lookup(i));
        if (!found.every(Boolean)) { await sleep(120); dbg.src = {}; found = els.map((n, i) => lookup(i)); }
        items = ids.map((iid, i) => {
          let it;
          if (found[i]) { it = game.normItem(found[i]); it.id = iid; (dbg.items = dbg.items || []).push({ name: found[i].name, legbon: it.legbon, rarity: it.rarity, stat: String(found[i].stat || '').slice(0, 160) }); }
          else {
            (dbg.items = dbg.items || []).push({ brak: iid });
            dbg.fromDom++;
            const n = els[i];
            let img = '';
            try { const c = n.querySelector('canvas.icon, canvas'); if (c) img = c.toDataURL(); } catch {}
            it = { id: iid, name: '', icon: img, rarity: rarityFromEl(n), legbon: null, stats: {} };
          }
          it.pos = { x: rects[i].left, y: rects[i].top, w: rects[i].width || 32 };
          return it;
        });
      } else dbg.noWindow = true;
    } catch (e) { console.warn('[laddonz] showEq', e); dbg.error = String(e); }
    finally { off(); }
    // zamykanie okna gry w tle — nie każemy czekać na podgląd
    const userOpened = userEqClick >= t0 - 150;
    if (w && !userOpened) closeGameWindow(w).finally(() => { hideCss.remove(); if (activeHide === hideCss) activeHide = null; });
    else { hideCss.remove(); if (activeHide === hideCss) activeHide = null; }
    MP.pokazEq.lastDebug = dbg;
    return items;
  }

  /** Zamyka okno gry tak, jak zrobiłby to gracz. NIGDY go nie usuwa — gra używa tego okna ponownie. */
  async function closeGameWindow(w) {
    for (const c of $$('.close-button, [class*="close-button"], .close, [class*="close"]', w)) {
      try { c.click(); } catch {}
      for (let i = 0; i < 6; i++) { if (!shown(w)) return; await sleep(25); }
    }
  }

  async function fetchEq(id) {
    const c = cache[id];
    if (c && now() - c.t < cfg.cacheSec * 1000) return c.items;
    if (busy) { wanted = id; return 'wait'; }
    const gap = 350 - (now() - lastReq);
    if (gap > 0) await sleep(gap);
    if (hoverId !== id) return 'stale';
    busy = true; lastReq = now();
    let items = null;
    try { items = await fetchRaw(id); } finally { busy = false; }
    if (Array.isArray(items) && items.length) cache[id] = { t: now(), items };
    if (wanted && wanted !== id && hoverId === wanted) { const w = wanted; wanted = null; setTimeout(() => fill(w), 0); }
    return items;
  }

  /* ── wygląd ── */
  function outfitEl(id) {
    const raw = game.otherRaw(id);
    const d = raw && raw.d;
    if (!d || !d.icon) return null;
    const base = (W.CFG && W.CFG.a_opath) || 'https://micc.garmory-cdn.cloud/obrazki/postacie/';
    const url = /^https?:/.test(d.icon) ? d.icon : base.replace(/\/?$/, '/') + String(d.icon).replace(/^\//, '');
    const box = el('div', { class: 'mp-eqoutfit' });
    const img = new Image();
    img.onload = () => {
      const fw = Number(raw.fw) || img.width / 4, fh = Number(raw.fh) || img.height / 4;   // arkusz 4×4 klatek
      const S = 1.5;
      Object.assign(box.style, { width: fw * S + 'px', height: fh * S + 'px', backgroundImage: `url("${url}")`, backgroundSize: `${img.width * S}px ${img.height * S}px`, backgroundPosition: '0 0' });
    };
    img.src = url;
    return box;
  }

  function headerEl(id) {
    if (anchor && anchor.isConnected) {
      const c = el('div', { class: anchor.className + ' mp-clone' });
      c.innerHTML = anchor.innerHTML;
      // tylko tekst z dymka — bez obrazków/płócien (postać rysujemy sami) i bez sztywnych rozmiarów
      c.querySelectorAll('canvas, img, video, svg, [class*="outfit"], [class*="avatar"], [class*="canvas"]').forEach((n) => n.remove());
      c.querySelectorAll('[style]').forEach((n) => { n.style.width = ''; n.style.height = ''; n.style.minWidth = ''; n.style.minHeight = ''; n.style.position = ''; });
      return c;
    }
    const p = game.otherById(id);
    return el('div', { class: 'mp-eqhead2' }, el('div', { class: 'nick' }, p ? `${p.nick} (${p.lvl}${p.prof})` : '#' + id), p && p.clanName ? el('div', { class: 'clan' }, p.clanName) : null);
  }

  function place(x, y) {
    if (!tip) return;
    if (anchor && anchor.isConnected) {
      const r = anchor.getBoundingClientRect();
      tip.style.minWidth = Math.min(320, Math.round(r.width)) + 'px';
      const h = tip.offsetHeight || 200, wd = tip.offsetWidth || r.width;
      tip.style.left = clamp(r.left, 4, innerWidth - wd - 4) + 'px';
      tip.style.top = clamp(r.top, 4, Math.max(4, innerHeight - h - 4)) + 'px';
      return;
    }
    tip.style.minWidth = '';
    tip.style.left = clamp(x, 4, innerWidth - (tip.offsetWidth || 260) - 4) + 'px';
    tip.style.top = clamp(y, 4, innerHeight - (tip.offsetHeight || 200) - 4) + 'px';
  }

  /** Siatka w układzie okna gry: pozycje przedmiotów przeliczone na komórki. */
  function layoutGrid(items) {
    const cell = (it) => el('div', { class: 'mp-eqcell ' + it.rarity, title: it.name ? `${it.name}${it.legbon ? ' — ' + MP.legName(it.legbon) : ''}` : '' },
      it.icon ? el('img', { src: /^data:/.test(it.icon) ? it.icon : game.iconUrl(it.icon), alt: '' }) : null,
      it.legbon ? el('div', { class: 'mp-ibadge bon' }, MP.legAbbr(it.legbon)) : null);
    const withPos = items.filter((i) => i.pos && i.pos.w);
    if (withPos.length !== items.length || !items.length) return el('div', { class: 'mp-eqgrid' }, items.map(cell));
    const minX = Math.min(...withPos.map((i) => i.pos.x)), minY = Math.min(...withPos.map((i) => i.pos.y));
    const step = (vals) => {
      const u = [...new Set(vals.map((v) => Math.round(v)))].sort((a, b) => a - b);
      let m = Infinity;
      for (let i = 1; i < u.length; i++) { const d = u[i] - u[i - 1]; if (d >= 10 && d < m) m = d; }
      return isFinite(m) ? m : withPos[0].pos.w + 2;
    };
    const ux = step(withPos.map((i) => i.pos.x)), uy = step(withPos.map((i) => i.pos.y));
    const S = 36;
    let maxC = 0, maxR = 0;
    const box = el('div', { class: 'mp-eqlayout' });
    for (const it of withPos) {
      const c = Math.round((it.pos.x - minX) / ux), r = Math.round((it.pos.y - minY) / uy);
      maxC = Math.max(maxC, c); maxR = Math.max(maxR, r);
      const n = cell(it);
      n.style.left = c * S + 'px'; n.style.top = r * S + 'px';
      box.appendChild(n);
    }
    box.style.width = (maxC + 1) * S - 2 + 'px';
    box.style.height = (maxR + 1) * S - 2 + 'px';
    return box;
  }

  function summaryEl(items) {
    const sum = {};
    items.forEach((i) => { if (i.legbon) sum[i.legbon] = (sum[i.legbon] || 0) + 1; });
    const leg = items.filter((i) => i.rarity === 'legendary').length, her = items.filter((i) => i.rarity === 'heroic').length;
    const known = items.every((i) => i.name);
    return el('div', { class: 'mp-eqsum' },
      el('div', null, 'Legendy: ', el('b', null, String(leg)), ' · Heroiki: ', el('b', null, String(her))),
      Object.keys(sum).length
        ? el('div', { class: 'mp-eqbons' }, Object.entries(sum).map(([k, n]) => el('span', { class: 'mp-chip', title: MP.legName(k) }, `${MP.legAbbr(k)} ×${n}`)))
        : el('div', { class: 'mp-dim' }, known ? 'Brak bonusów legendarnych' : 'Bonusy: brak danych z gry'));
  }

  let eqBox = null, sumBox = null;
  function build(id) {
    tip.innerHTML = '';
    eqBox = el('div', { class: 'mp-eqmain' }, el('div', { class: 'mp-dim mp-eqload' }, 'Wczytuję ekwipunek…'));
    sumBox = el('div');
    tip.append(headerEl(id), el('div', { class: 'mp-eqbody' }, outfitEl(id), eqBox), sumBox);
  }
  async function fill(id) {
    const items = await fetchEq(id);
    if (hoverId !== id || items === 'wait' || items === 'stale') return;
    eqBox.innerHTML = '';
    if (items === 'own-window') eqBox.appendChild(el('div', { class: 'mp-dim mp-eqload' }, 'Masz otwarte okno ekwipunku z gry.'));
    else if (!items) eqBox.appendChild(el('div', { class: 'mp-warnc mp-eqload' }, 'Nie udało się pobrać.'));
    else if (!items.length) eqBox.appendChild(el('div', { class: 'mp-dim mp-eqload' }, 'Brak założonych przedmiotów.'));
    else { eqBox.appendChild(layoutGrid(items)); sumBox.innerHTML = ''; sumBox.appendChild(summaryEl(items)); }
    place();
  }

  function show(id, x, y, force, anc) {
    if (!cfg.enabled && !force) return;
    if (!tip) { tip = el('div', { id: 'mp-eqtip', class: 'mp-glass gamey' }); document.body.appendChild(tip); }
    const same = hoverId === id && anchor === (anc || null);
    anchor = anc || null;
    document.body.classList.toggle('mp-eq-on', !!anchor);      // chowa dymek gry — nasze okno go zastępuje
    tip.style.display = 'block';
    if (!same) { hoverId = id; build(id); fill(id); }
    place(x, y);
  }

  function watchHover() {
    let mx = 0, my = 0, shift = false, src = null, tipNode = null;
    const want = (id, from, anc) => {
      if (!cfg.enabled) return;
      if (from === 'map' && (!cfg.mapHover || (cfg.needShift && !shift))) return;
      if (from === 'list' && !cfg.listHover) return;
      src = from;
      show(id, mx + 18, my + 14, false, anc);
    };
    const stop = (from) => { if (src === from) { src = null; hide(); } };

    /* MAPA: dymek gry z nickiem przy kursorze (.tip-wrapper.normal-tip). Dymek jest tylko „wycięty" (clip-path),
       więc nadal wiemy, gdzie jest i czy gra go pokazuje. */
    const mapCheck = () => {
      if (!cfg.enabled || !cfg.mapHover || src === 'list') return;
      const tipSel = (cfg.tipSelector || '').split('\n').map((x) => x.trim()).filter(Boolean).join(',');
      let p = null;
      tipNode = null;
      if (tipSel) {
        for (const n of $$(tipSel)) {
          if (n.closest('#mp-eqtip, .mp-glass') || !isVisible(n)) continue;
          const r = n.getBoundingClientRect();
          const dx = Math.max(r.left - mx, 0, mx - r.right), dy = Math.max(r.top - my, 0, my - r.bottom);
          if (Math.hypot(dx, dy) > 90) continue;
          const txt = (n.textContent || '').toLowerCase();
          p = game.others().filter((o) => o.nick && txt.includes(o.nick.toLowerCase())).sort((a, b) => b.nick.length - a.nick.length)[0] || null;
          if (p) { tipNode = n; break; }
        }
      }
      if (p) want(p.id, 'map', tipNode); else stop('map');
    };

    /* LISTA GRACZY (w grze i w laddonz) */
    const listRow = (t) => t && t.closest && t.closest('.one-other, .tw-list-item, .mp-prow');
    const playerFromRow = (row) => {
      if (row.dataset && row.dataset.pid) return game.otherById(row.dataset.pid);
      const txt = (row.textContent || '').toLowerCase();
      return game.others().filter((o) => o.nick && txt.includes(o.nick.toLowerCase())).sort((a, b) => b.nick.length - a.nick.length)[0] || null;
    };
    document.addEventListener('mouseover', (e) => {
      const row = listRow(e.target);
      if (!row) return;
      const p = playerFromRow(row);
      if (p) { const r = row.getBoundingClientRect(); mx = r.right; my = r.top; want(p.id, 'list'); }
    }, true);
    document.addEventListener('mouseout', (e) => {
      const row = listRow(e.target);
      if (!row || (e.relatedTarget && row.contains(e.relatedTarget))) return;
      stop('list');
    }, true);

    let raf = 0;
    document.addEventListener('mousemove', (e) => {
      mx = e.clientX; my = e.clientY; shift = e.shiftKey;
      if (!raf) raf = requestAnimationFrame(() => { raf = 0; mapCheck(); });
    }, true);
    document.addEventListener('mouseleave', () => { stop('map'); stop('list'); });
    new MutationObserver(debounce(mapCheck, 30)).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class'] });

    /* zwykłe „Pokaż ekwipunek" z menu gry działa niezależnie: gdy go klikniesz, nie chowamy ani nie zamykamy okna gry */
    document.addEventListener('click', (e) => {
      const t = e.target && e.target.closest && e.target.closest('div, span, button, li');
      if (t && /^poka[żz] ekwipunek$/i.test((t.textContent || '').trim())) {
        userEqClick = now();
        if (activeHide) { activeHide.remove(); activeHide = null; }
        hide();
      }
    }, true);
  }

  MP.pokazEq = {
    showForce: (id, x, y) => { show(id, x, y, true); setTimeout(() => document.addEventListener('mousedown', hide, { once: true, capture: true }), 50); },
    hide,
  };

  defineAddon({
    id: 'pokazeq', name: 'Pokaż EQ', icon: 'pokazeq', color: ['#b48cff', '#7c5cff'],
    desc: 'Po najechaniu na gracza — na mapie albo na liście graczy — zamiast zwykłego dymka gry pokazuje rozszerzony: informacje o graczu, jego postać z outfitem, ekwipunek ułożony jak w grze i podsumowanie bonusów legendarnych. Zwykłe „Pokaż ekwipunek" z menu gry działa dalej normalnie.',
    defaults: { enabled: false, mapHover: true, listHover: true, needShift: false, cacheSec: 300, tipSelector: '.tip-wrapper.normal-tip' },
    notes: () => [{ type: 'info', text: 'Pierwszy podgląd gracza trwa tyle, ile odpowiedź serwera (jak „Pokaż ekwipunek" w grze). Kolejne przez 5 minut są natychmiastowe.' }],
    settings: [
      { key: 'mapHover', type: 'bool', label: 'Najechanie na gracza na mapie' },
      { key: 'listHover', type: 'bool', label: 'Najechanie na gracza na liście graczy (w grze i w laddonz)' },
      { key: 'needShift', type: 'bool', label: 'Na mapie tylko z wciśniętym Shift' },
      { key: 'cacheSec', type: 'number', label: 'Pamiętaj wynik przez (s)', min: 10, max: 1800 },
      { key: 'tipSelector', type: 'text', label: 'Selektor dymka gracza w grze', hint: 'Domyślnie .tip-wrapper.normal-tip' },
    ],
    init(c) {
      cfg = c;
      if (!c._v12) { c._v12 = true; c.needShift = false; c.tipSelector = '.tip-wrapper.normal-tip'; }
      if (!c._v16) { c._v16 = true; c.cacheSec = 300; }
      config.save();
      hookItemFlow();
      watchHover();
    },
    onToggle(on) { if (!on) hide(); },
  });
})();
