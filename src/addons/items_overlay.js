/* ───────── wspólny dekorator przedmiotów (Jaki To Bon, Podpisownik, Szybka rączka) ───────── */
const itemDeco = {
  painters: [],     // fn(itemEl, item) -> [{cls, text, title}] | null
  add(fn) { this.painters.push(fn); },
  run() {
    for (const node of game.itemEls()) {
      const id = game.itemIdFromEl(node);
      if (!id) continue;
      // przedmioty z okna „Ekwipunek Postaci" innego gracza — dane z szablonów gry (Pokaż EQ)
      let it = /-showeq/.test(String(node.className)) ? (MP.eqLookup ? MP.eqLookup(node) : null) : game.itemById(id);
      // przedmioty z dymka gracza w grze (EQ innego gracza) — dane z magazynu przedmiotów gry
      if (!it && node.closest('.tip-wrapper') && MP.anyLookup) it = MP.anyLookup(node, id);
      const want = [];
      for (const p of this.painters) { try { const r = p(node, it, id); if (r) want.push(...[].concat(r)); } catch {} }
      const have = Array.from(node.querySelectorAll(':scope > .mp-ibadge:not(.chance)'));
      const sig = want.map((w) => w.cls + '|' + (w.text || w.icon)).join(';');
      if (node.dataset.mpSig === sig && have.length === want.length) continue;
      have.forEach((h) => h.remove());
      if (want.length && getComputedStyle(node).position === 'static') node.style.position = 'relative';
      want.forEach((w) => node.appendChild(el('div', { class: 'mp-ibadge ' + w.cls, title: w.title || '' }, w.icon ? icon(w.icon, 11) : w.text)));
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
 * Skrót bonusu legendarnego w prawym górnym rogu przedmiotu: na Twoim EQ, w oknie „Ekwipunek Postaci" z gry
 * i w podglądzie Pokaż EQ. Bonus rozpoznawany po kodzie z danych przedmiotu albo po nazwie z opisu przedmiotu.
 */
(() => {
  let cfg;
  // Aktualna lista 10 bonusów legendarnych. „re" dopasowuje różne warianty kodów, „name" — nazwę z opisu przedmiotu.
  const BONUSES = [
    { id: 'CBK', name: 'Cios bardzo krytyczny',     re: /^(verycrit|very_?crit|critical_?strike)/i },
    { id: 'DA',  name: 'Dotyk anioła',              re: /^(holytouch|holy|angel)/i },
    { id: 'KL',  name: 'Klątwa',                    re: /^(curse)/i },
    { id: 'OŚ',  name: 'Oślepienie',                re: /^(glare|blind)/i },
    { id: 'OR',  name: 'Ostatni ratunek',           re: /^(lastheal|last_?heal|last_?resort)/i },
    { id: 'KO',  name: 'Krytyczna osłona',          re: /^(critred|crit_?red|critical_?shield)/i },
    { id: 'FO',  name: 'Fasada opieki',             re: /^(facade|fasad|care|guard|protect|dmgred)/i },
    { id: 'PO',  name: 'Płomienne oczyszczenie',    re: /^(cle|flame|purif)/i },
    { id: 'KU',  name: 'Krwawa udręka',             re: /^(blood|anguish|torment|bleed|agony)/i },
    { id: 'PS',  name: 'Przeszywająca skuteczność', re: /^(pun|pierc|penetr)/i },
  ];
  const norm = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l');
  /** kod/nazwa → bonus z listy (albo null) */
  function bonusOf(codeOrName) {
    if (!codeOrName) return null;
    const c = String(codeOrName).trim();
    return BONUSES.find((b) => b.re.test(c)) || BONUSES.find((b) => norm(c).includes(norm(b.name))) || null;
  }
  /** Bonus z opisu (tooltipu) przedmiotu gry — gdy kod nie pasuje do żadnego wzorca. */
  function bonusFromTip(raw) {
    try {
      const f = raw && (raw.getTipContent || raw.getTipData);
      if (typeof f !== 'function') return null;
      let t = f.call(raw);
      if (t && typeof t === 'object') t = JSON.stringify(t);
      const txt = norm(String(t || '').replace(/<[^>]+>/g, ' '));
      return BONUSES.find((b) => txt.includes(norm(b.name))) || null;
    } catch { return null; }
  }
  const seenCodes = new Set();
  function abbr(code, raw) {
    const b = bonusOf(code) || bonusFromTip(raw);
    if (code) seenCodes.add(String(code));
    if (!b) return String(code || '?').slice(0, 3).toUpperCase();
    return (cfg && cfg.abbr && cfg.abbr[b.id]) || b.id;
  }
  MP.legAbbr = (code, raw) => abbr(code, raw);
  MP.legName = (code) => { const b = bonusOf(code); return b ? b.name : String(code); };
  MP.legKey = (code) => { const b = bonusOf(code); return b ? b.id : String(code); };

  defineAddon({
    id: 'jakibon', name: 'Jaki To Bon', icon: 'jakibon', color: ['#ff9a3c', '#d4561c'],
    desc: 'Wyświetla na przedmiotach legendarnych skrót ich bonusu (np. OR, CBK, FO). Od razu widzisz, z jaką legendą masz do czynienia, we własnym ekwipunku i u innych graczy.',
    defaults: { enabled: false, allItems: false, abbr: {} },
    settings: [{ key: 'allItems', type: 'bool', label: 'Pokazuj też na przedmiotach w torbach', hint: 'Domyślnie tylko założone.' }],
    render(box) {
      const tb = el('tbody');
      for (const b of BONUSES) {
        const i = el('input', { class: 'mp-in', value: (cfg.abbr && cfg.abbr[b.id]) || b.id, style: { width: '70px' } });
        i.onchange = () => { cfg.abbr = cfg.abbr || {}; cfg.abbr[b.id] = i.value.trim() || b.id; config.save(); bus.emit('deco'); };
        tb.appendChild(el('tr', null, el('td', null, b.name), el('td', null, i)));
      }
      box.appendChild(el('div', { class: 'mp-card' }, el('h3', null, 'Skróty bonusów legendarnych'),
        el('table', { class: 'mp-table' }, el('thead', null, el('tr', null, el('th', null, 'Bonus'), el('th', null, 'Skrót'))), tb),
        seenCodes.size ? el('div', { class: 'mp-dim', style: { marginTop: '8px', fontSize: '11.5px' } }, 'Kody widziane w grze: ', el('span', { class: 'mp-mono' }, [...seenCodes].join(', '))) : null));
    },
    init(c) {
      cfg = c;
      if (!c._v17) { c._v17 = true; delete c.map; c.abbr = c.abbr || {}; config.save(); }
      itemDeco.add((node, it) => {
        if (!cfg.enabled || !it || !it.legbon) return null;
        const other = /-showeq/.test(String(node.className)) || !!node.closest('.tip-wrapper');
        if (!cfg.allItems && !other && !(it.st > 0)) return null;
        return { cls: 'bon', text: abbr(it.legbon, it.raw), title: MP.legName(it.legbon) };
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
  /**
   * Klucz „takiego samego" przedmiotu: ten sam szablon (tpl) / nazwa + ten sam cel teleportu.
   * Dzięki temu 3 kamienie czerwonego smoka ustawione w to samo miejsce dzielą jeden podpis.
   */
  function keyOf(it) {
    if (!it) return null;
    const raw = it.raw || {};
    const base = raw.tpl || it.tpl || it.name;
    const st = it.stats || {};
    const dest = st.custom_teleport || st.teleport || '';
    return base ? `${base}|${dest}` : null;
  }
  function labelFor(it, id) {
    const k = keyOf(it);
    if (k && cfg.byKey[k]) return cfg.byKey[k].label;
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
  const signedKey = (id) => { const it = game.itemById(id); const k = keyOf(it); return !!(cfg && ((k && cfg.byKey[k]) || cfg.byId[id])); };
  MP.podpis = { labelFor: (it, id) => (cfg && cfg.enabled ? labelFor(it, id) : null), isSigned: (id) => signedKey(id) };

  async function signItem(id) {
    const it = game.itemById(id);
    const k = keyOf(it);
    const cur = (k && cfg.byKey[k] && cfg.byKey[k].label) || cfg.byId[id] || '';
    const same = k ? game.heroItems().filter((x) => keyOf(x) === k).length : 1;
    const towns = ['Ithan', 'Torneg', 'Werbin', 'Eder', 'Karka-han', 'Nithal', 'Tuzmer', 'Thuzal', 'Mythar', 'Port Tuzmer'];
    const isTp = it && (it.stats.teleport || it.stats.custom_teleport || /telepor|kamie[nń]|zw[oó]j/i.test(it.name));
    const head = it ? el('div', { class: 'mp-itemhead' }, it.icon ? el('img', { src: /^data:/.test(it.icon) ? it.icon : game.iconUrl(it.icon), alt: '' }) : null,
      el('div', null, el('b', null, it.name),
        el('div', { class: 'mp-dim', style: { fontSize: '11.5px' } }, (cur ? 'Obecny podpis: ' + cur : 'Bez podpisu') + (same > 1 ? ` · takich samych w EQ: ${same}` : '')))) : null;
    const v = await promptBox({
      title: 'Podpisz przedmiot', head,
      label: same > 1 ? `Podpis trafi na wszystkie ${same} takie same przedmioty (do 14 znaków):` : 'Krótki podpis, widoczny na przedmiocie w ekwipunku (do 14 znaków):',
      value: cur, placeholder: isTp ? 'np. Ithan' : 'np. na e2', maxLength: 14, suggestions: isTp ? towns : [], allowClear: true,
    });
    if (v === null) return;
    delete cfg.byId[id];
    if (k) { if (v) cfg.byKey[k] = { label: v.slice(0, 14), name: it ? it.name : '' }; else delete cfg.byKey[k]; }
    else if (v) cfg.byId[id] = v.slice(0, 14);
    config.save(); bus.emit('deco');
    toast(v ? `Podpisano: ${v}${same > 1 ? ` (${same} szt.)` : ''}` : 'Usunięto podpis', 'ok', 1500);
  }

  defineAddon({
    id: 'podpis', name: 'Podpisownik', icon: 'podpis', color: ['#78bcff', '#4a7fd8'],
    desc: 'Pozwala dodawać własne podpisy do przedmiotów, np. dokąd prowadzi dany kamień teleportacyjny. Podpis nadajesz z menu przedmiotu („Podpisz…”) i od razu widzisz go na wszystkich takich samych przedmiotach.',
    defaults: { enabled: false, byId: {}, byKey: {}, rules: [], autoTeleport: false },
    settings: [{ key: 'autoTeleport', type: 'bool', label: 'Automatycznie podpisuj teleporty nazwą celu', hint: 'Domyślnie wyłączone — podpisy nadajesz sam.' }],
    render(box, c, rerender) {
      const tb = el('tbody');
      c.rules.forEach((r, i) => tb.appendChild(el('tr', null, el('td', null, r.match), el('td', null, r.label), el('td', null, el('button', { class: 'mp-mini', onclick: () => { c.rules.splice(i, 1); config.save(); bus.emit('deco'); rerender(); } }, '×')))));
      const m = el('input', { class: 'mp-in', placeholder: 'nazwa zawiera…', style: { width: '170px' } });
      const l = el('input', { class: 'mp-in', placeholder: 'podpis', style: { width: '110px' } });
      box.appendChild(el('div', { class: 'mp-card' }, el('h3', null, 'Reguły według nazwy'),
        c.rules.length ? el('table', { class: 'mp-table' }, tb) : el('div', { class: 'mp-dim' }, 'Brak reguł.'),
        el('div', { class: 'mp-btns' }, m, l, el('button', { class: 'mp-btn', onclick: () => { if (m.value.trim() && l.value.trim()) { c.rules.push({ match: m.value.trim(), label: l.value.trim().slice(0, 14) }); config.save(); bus.emit('deco'); rerender(); } } }, 'Dodaj'))));
      const keys = Object.entries(c.byKey || {});
      const ids = Object.entries(c.byId);
      const count = (k) => game.heroItems().filter((x) => keyOf(x) === k).length;
      box.appendChild(el('div', { class: 'mp-card' }, el('h3', null, 'Podpisane przedmioty'),
        keys.length || ids.length ? el('table', { class: 'mp-table' }, el('tbody', null,
          keys.map(([k, v]) => el('tr', null, el('td', null, v.name || k.split('|')[0], el('span', { class: 'mp-dim' }, ` · w EQ: ${count(k)}`)), el('td', null, v.label),
            el('td', null, el('button', { class: 'mp-mini', onclick: () => { delete c.byKey[k]; config.save(); bus.emit('deco'); rerender(); } }, '×')))),
          ids.map(([id, lb]) => el('tr', null, el('td', null, game.itemById(id)?.name || el('span', { class: 'mp-dim' }, '#' + id + ' (nie w EQ)')), el('td', null, lb),
            el('td', null, el('button', { class: 'mp-mini', onclick: () => { delete c.byId[id]; config.save(); bus.emit('deco'); rerender(); } }, '×'))))))
          : el('div', { class: 'mp-dim' }, 'Nie masz jeszcze podpisów. Kliknij przedmiot prawym przyciskiem i wybierz „Podpisz…”.')));
    },
    init(c) {
      cfg = c;
      c.byKey = c.byKey || {};
      if (!c._noAutoTp) { c._noAutoTp = true; c.autoTeleport = false; config.save(); }   // automatyczne podpisy teleportów domyślnie wyłączone
      itemDeco.add((node, it, id) => { const lb = cfg.enabled && labelFor(it, id); return lb ? { cls: 'sig', text: lb, title: 'Podpisownik: ' + lb } : null; });
      menus.add('item', (id) => (cfg.enabled ? [{ label: 'Podpisz…', fn: () => signItem(id) }] : []));
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
  let forced = false;
  let busy = false, wanted = null, anchor = null, userEqClick = 0, activeHide = null, lastGrid = null, lastAnchorRect = null;
  const seenItems = new Map();      // dane przedmiotów/szablonów, które przeszły przez grę (id → obiekt, 'tpl:<nr>' → obiekt)

  function hide() {
    hoverId = null; wanted = null; anchor = null;
    document.querySelectorAll('.mp-foreign-tip').forEach((n) => n.classList.remove('mp-foreign-tip'));
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

  /** Szuka danych przedmiotu z okna EQ innego gracza na wiele sposobów. */
  const WAYS = [
    ['store', (iid) => { const I = E().items; return I.getItemById(iid) || I.getItemById(String(iid)) || I.getItemById(iid + '-showeq'); }],
    ['hook', (iid) => seenItems.get(String(iid))],
    ['data', (iid, tpl, n, seen) => seen && seen[String(iid)]],
    ['jq', (iid, tpl, n) => fromJq(n)],
    ['cont', (iid) => fromContainers(iid)],
    ['tplHook', (iid, tpl, n, seen) => tpl && (seenItems.get('tpl:' + tpl) || (seen && seen['tpl:' + tpl]))],
    ['tplApi', (iid, tpl) => fromTplApi(tpl)],
    ['tplCont', (iid, tpl) => tpl && fromContainers(tpl)],
  ];
  function lookupRaw(iid, tpl, n, seen, dbg) {
    for (const [name, f] of WAYS) {
      try { const r = f(iid, tpl, n, seen); if (r && (r.name || r.stat !== undefined)) { if (dbg) dbg.src[name] = (dbg.src[name] || 0) + 1; return r; } } catch {}
    }
    return null;
  }
  /** Dowolny przedmiot z elementu DOM (np. łup): po id, a gdy go nie ma — po szablonie (item-tpl-N). */
  MP.anyLookup = (n, id) => {
    try {
      hookItemFlow();
      const tpl = Number((String(n.className).match(/item-tpl-(\d+)/) || [])[1]) || 0;
      let r = lookupRaw(Number(id), tpl, n);
      // łup: dane przedmiotów w podglądzie łupu gry
      if (!r) { const o = {}; collectItems(E() && E().lootPreview, o); r = o[String(id)] || (tpl && o['tpl:' + tpl]) || null; }
      return r ? game.normItem(r) : null;
    } catch { return null; }
  };
  /** Dla Jaki To Bon: przedmiot z okna „Ekwipunek Postaci" gry (element .item-id-X-showeq). */
  const nodeCache = new Map();
  MP.eqLookup = (n) => {
    const m = String(n.className).match(/item-id-(\d+)-showeq/); if (!m) return null;
    const iid = Number(m[1]);
    const c = nodeCache.get(iid); if (c && now() - c.t < 60000) return c.it;
    hookItemFlow();
    const tpl = Number((String(n.className).match(/item-tpl-(\d+)/) || [])[1]) || 0;
    const r = lookupRaw(iid, tpl, n);
    const it = r ? Object.assign(game.normItem(r), { id: iid }) : null;
    if (it) nodeCache.set(iid, { t: now(), it });
    return it;
  };

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
        w = $$('.showeq-window').find((n) => shown(n) && before.get(n) !== true + '#' + sigOf(n));
        if (w) {
          // okno się pokazało — czekamy chwilę na przedmioty (gracz z pustym EQ nie ma żadnych)
          const tw = now();
          while (!w.querySelector('[class*="-showeq"]') && now() - tw < 600) await sleep(25);
          break;
        }
      }
      if (w) {
        const els = $$('[class*="item-id-"]', w).filter((n) => /item-id-\d+-showeq/.test(String(n.className)));
        const ids = els.map((n) => Number(String(n.className).match(/item-id-(\d+)-showeq/)[1]));
        const tpls = els.map((n) => Number((String(n.className).match(/item-tpl-(\d+)/) || [])[1]) || 0);
        dbg.ids = ids; dbg.tpls = tpls;
        const rects = els.map((n) => n.getBoundingClientRect());
        // pole slotów w oknie gry (wspólny rodzic przedmiotów) — dzięki temu pojedynczy przedmiot stoi na swoim miejscu
        let box = els[0] ? els[0].parentElement : null;
        while (box && box !== w && !els.every((x) => box.contains(x))) box = box.parentElement;
        const br = box ? box.getBoundingClientRect() : null;
        dbg.grid = br ? { x: br.left, y: br.top, w: br.width, h: br.height } : null;
        lastGrid = dbg.grid;
        const lookup = (i) => lookupRaw(ids[i], tpls[i], els[i], seen, dbg);
        let found = els.map((n, i) => lookup(i));
        if (!found.every(Boolean)) { await sleep(120); dbg.src = {}; found = els.map((n, i) => lookup(i)); }
        const gridInfo = dbg.grid;
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
          it.pos = { x: rects[i].left, y: rects[i].top, w: rects[i].width || 32, grid: gridInfo };
          return it;
        });
      } else dbg.noWindow = true;
    } catch (e) { console.warn('[L4Tools] showEq', e); dbg.error = String(e); }
    finally { off(); }
    // zamykanie okna gry w tle — nie każemy czekać na podgląd.
    // Okno gry zostaje ukryte, dopóki NAPRAWDĘ się nie zamknie (wcześniej czasem zostawało na środku ekranu:
    // gdy serwer odpowiadał po czasie albo zamknięcie się nie udało).
    const userOpened = userEqClick >= t0 - 150;
    const release = () => { hideCss.remove(); if (activeHide === hideCss) activeHide = null; };
    if (userOpened) release();
    else keepHiddenUntilClosed(w, hideCss, t0, release);
    MP.pokazEq.lastDebug = dbg;
    return items;
  }

  /** Zamyka okno gry tak, jak zrobiłby to gracz. NIGDY go nie usuwa — gra używa tego okna ponownie. */
  async function closeGameWindow(w) {
    for (const c of $$('.close-button, [class*="close-button"], .close, [class*="close"]', w)) {
      try { c.click(); } catch {}
      for (let i = 0; i < 6; i++) { if (!shown(w)) return true; await sleep(25); }
    }
    // zapas: Escape (gra zamyka nim okna)
    try { for (const t of [w, document]) t.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true })); } catch {}
    for (let i = 0; i < 8; i++) { if (!shown(w)) return true; await sleep(25); }
    return !shown(w);
  }
  /**
   * Trzyma okno podglądu gry niewidoczne, aż się zamknie. Łapie też okno, które pojawi się PO czasie
   * (wolna odpowiedź serwera). Twoje własne „Pokaż ekwipunek" zdejmuje ukrycie od razu.
   */
  function keepHiddenUntilClosed(w, hideCss, t0, release) {
    const until = now() + 8000;
    let closing = false;
    const iv = setInterval(async () => {
      if (userEqClick >= t0 - 150 || !hideCss.isConnected) { clearInterval(iv); release(); return; }
      const win = (w && shown(w)) ? w : $$('.showeq-window').find((n) => shown(n));
      if (!win) {
        // okno zamknięte — chwilę jeszcze czekamy na ewentualne spóźnione otwarcie
        if (now() > until || (w && now() - t0 > 1500)) { clearInterval(iv); release(); }
        return;
      }
      if (closing) return;
      closing = true;
      await closeGameWindow(win);
      closing = false;
      if (now() > until + 7000) { clearInterval(iv); release(); }   // ostateczność
    }, 120);
  }

  /** Szybka droga: dymek gracza w grze sam pokazuje jego EQ — bierzemy przedmioty prosto z niego (bez pytania serwera). */
  function itemsFromTip(id) {
    try {
      if (!anchor || !anchor.isConnected) return null;
      const els = $$('[class*="item-id-"]', anchor).filter((n) => /item-id-\d+/.test(String(n.className)) && !n.closest('.mp-ibadge'));
      if (els.length < 1) return null;
      const ids = els.map((n) => Number(String(n.className).match(/item-id-(\d+)/)[1]));
      const tpls = els.map((n) => Number((String(n.className).match(/item-tpl-(\d+)/) || [])[1]) || 0);
      let box = els[0].parentElement;
      while (box && box !== anchor && !els.every((x) => box.contains(x))) box = box.parentElement;
      const br = box ? box.getBoundingClientRect() : null;
      const grid = br ? { x: br.left, y: br.top, w: br.width, h: br.height } : null;
      const dbg = { id, ids, tpls, src: {}, fromDom: 0, zDymka: true };
      const items = ids.map((iid, i) => {
        const r0 = lookupRaw(iid, tpls[i], els[i], null, dbg);
        let it;
        if (r0) { it = game.normItem(r0); it.id = iid; }
        else { dbg.fromDom++; let img = ''; try { const c = els[i].querySelector('canvas'); if (c) img = c.toDataURL(); } catch {} it = { id: iid, name: '', icon: img, rarity: rarityFromEl(els[i]), legbon: null, stats: {} }; }
        const r = els[i].getBoundingClientRect();
        it.pos = { x: r.left, y: r.top, w: r.width || 32, grid };
        return it;
      });
      if (dbg.fromDom > items.length / 2) return null;   // za mało danych — zwykła droga przez serwer
      MP.pokazEq.lastDebug = dbg;
      return items;
    } catch { return null; }
  }

  async function fetchEq(id) {
    const c = cache[id];
    if (c && now() - c.t < cfg.cacheSec * 1000) return c.items;
    const quick = itemsFromTip(id);
    if (quick && quick.length) { cache[id] = { t: now(), items: quick }; return quick; }
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

  /** Linie tekstu dymka gry (działa też, gdy dymek jest już ukryty — nie używa innerText). */
  function tipLines(root) {
    const BLOCK = /^(DIV|P|LI|UL|TABLE|TR|TD|SECTION|HEADER|H\d)$/;
    const blocks = [...root.querySelectorAll('*')].filter((n) => BLOCK.test(n.tagName) && ![...n.children].some((c) => BLOCK.test(c.tagName)));
    const top = blocks.filter((n) => !blocks.some((o) => o !== n && o.contains(n)));
    let lines = top.map((n) => (n.textContent || '').replace(/\s+/g, ' ').trim());
    if (!lines.filter(Boolean).length) lines = String(root.innerHTML).replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').split('\n');
    return lines.map((x) => x.replace(/\s+/g, ' ').trim()).filter(Boolean);
  }

  function headerEl(id) {
    const p = game.otherById(id);
    let lines = [];
    if (anchor && anchor.isConnected) lines = tipLines(anchor);
    const nickRe = p ? new RegExp('^' + p.nick.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\(', 'i') : null;
    const ni = nickRe ? lines.findIndex((l) => nickRe.test(l)) : -1;
    const before = ni > 0 ? lines.slice(0, ni) : [];
    const after = ni >= 0 ? lines.slice(ni + 1) : [];
    const loot = after.filter((l) => /^loot/i.test(l));
    const rest = after.filter((l) => !/^loot/i.test(l));
    return el('div', { class: 'mp-eqhead2' },
      before.map((l) => el('div', { class: 'mp-eq-rank' }, l)),
      el('div', { class: 'mp-eq-nick' }, ni >= 0 ? lines[ni] : (p ? `${p.nick} (${p.lvl}${p.prof})` : '#' + id)),
      (rest.length ? rest : (p && p.clanName ? [p.clanName] : [])).map((l) => el('div', { class: 'mp-eq-clan' }, l)),
      loot.map((l) => el('div', { class: 'mp-eq-loot' }, l)));
  }

  function place(x, y) {
    if (!tip) return;
    if (anchor && anchor.isConnected && anchor.getBoundingClientRect().width > 0) {
      const r = anchor.getBoundingClientRect();
      lastAnchorRect = r;
      tip.style.minWidth = cfg.compact ? '' : Math.min(260, Math.round(r.width)) + 'px';
      const h = tip.offsetHeight || 200, wd = tip.offsetWidth || r.width;
      tip.style.left = clamp(r.left, 4, innerWidth - wd - 4) + 'px';
      tip.style.top = clamp(r.top, 4, Math.max(4, innerHeight - h - 4)) + 'px';
      return;
    }
    if (anchor && lastAnchorRect) return;   // dymek gry chwilowo zniknął — zostajemy w tym samym miejscu
    tip.style.minWidth = '';
    tip.style.left = clamp(x, 4, innerWidth - (tip.offsetWidth || 260) - 4) + 'px';
    tip.style.top = clamp(y, 4, innerHeight - (tip.offsetHeight || 200) - 4) + 'px';
  }

  /** Siatka w układzie okna gry: pozycje przedmiotów przeliczone na komórki. */
  function layoutGrid(items) {
    const cell = (it) => el('div', { class: 'mp-eqcell ' + it.rarity, title: it.name ? `${it.name}${it.legbon ? ' — ' + MP.legName(it.legbon) : ''}` : '' },
      it.icon ? el('img', { src: /^data:/.test(it.icon) ? it.icon : game.iconUrl(it.icon), alt: '' }) : null,
      it.legbon ? el('div', { class: 'mp-ibadge bon' }, MP.legAbbr(it.legbon, it.raw)) : null);
    if (!items.length) return el('div');
    const S = cfg.compact ? 34 : 36;
    // Układ okna „Ekwipunek Postaci": 3 kolumny × 4 rzędy. Geometrię (rozstaw slotów i przesunięcie siatki)
    // uczymy się z graczy z pełnym EQ i zapamiętujemy — dzięki temu niepełne EQ ma przedmioty na swoich miejscach.
    let geo = store.get('eq:geo', null);
    const withPos = items.filter((i) => i.pos && i.pos.w && i.pos.grid);
    if (withPos.length >= 6) {
      const step = (vals) => {
        const u = [...new Set(vals.map((v) => Math.round(v)))].sort((x, y) => x - y);
        let m = Infinity;
        for (let i = 1; i < u.length; i++) { const d = u[i] - u[i - 1]; if (d >= 10 && d < m) m = d; }
        return isFinite(m) ? m : null;
      };
      const ux = step(withPos.map((i) => i.pos.x)), uy = step(withPos.map((i) => i.pos.y));
      if (ux && uy) {
        const g = withPos[0].pos.grid;
        const minX = Math.min(...withPos.map((i) => i.pos.x)), minY = Math.min(...withPos.map((i) => i.pos.y));
        const cols = Math.max(3, ...withPos.map((i) => Math.round((i.pos.x - minX) / ux) + 1));
        const rows = Math.max(4, ...withPos.map((i) => Math.round((i.pos.y - minY) / uy) + 1));
        geo = { ux, uy, dx: minX - g.x, dy: minY - g.y, cols, rows };
        store.set('eq:geo', geo);
      }
    }
    // zapas przed nauczeniem się układu: slot według typu przedmiotu (cl)
    const SLOT_BY_CL = { 25: [0, 0], 9: [1, 0], 12: [0, 1], 13: [1, 1], 11: [2, 1], 1: [0, 2], 2: [0, 2], 3: [0, 2], 4: [0, 2], 6: [0, 2], 8: [1, 2], 5: [2, 2], 7: [2, 2], 14: [2, 2], 21: [2, 2], 29: [2, 2], 22: [0, 3], 10: [1, 3] };
    const cols = geo ? geo.cols : 3, rows = geo ? geo.rows : 4;
    const box = el('div', { class: 'mp-eqlayout' });
    const taken = new Set();
    const loose = [];
    for (const it of items) {
      let c = null, r = null;
      if (geo && it.pos && it.pos.grid) {
        c = Math.round((it.pos.x - it.pos.grid.x - geo.dx) / geo.ux);
        r = Math.round((it.pos.y - it.pos.grid.y - geo.dy) / geo.uy);
      } else if (SLOT_BY_CL[it.cl]) [c, r] = SLOT_BY_CL[it.cl];
      if (c == null || c < 0 || r < 0 || c >= cols || r >= rows || taken.has(c + ':' + r)) { loose.push(it); continue; }
      taken.add(c + ':' + r);
      const n = cell(it);
      n.style.left = c * S + 'px'; n.style.top = r * S + 'px';
      box.appendChild(n);
    }
    // przedmioty bez rozpoznanego miejsca — na pierwsze wolne pola
    for (const it of loose) {
      let placed = false;
      for (let r = rows - 1; r >= 0 && !placed; r--) for (let c = cols - 1; c >= 0 && !placed; c--) {
        if (taken.has(c + ':' + r)) continue;
        taken.add(c + ':' + r); placed = true;
        const n = cell(it); n.style.left = c * S + 'px'; n.style.top = r * S + 'px'; box.appendChild(n);
      }
    }
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      if (taken.has(c + ':' + r)) continue;
      box.insertBefore(el('div', { class: 'mp-eqcell mp-eqslot', style: { left: c * S + 'px', top: r * S + 'px' } }), box.firstChild);
    }
    box.style.width = cols * S - 2 + 'px';
    box.style.height = rows * S - 2 + 'px';
    return box;
  }

  function summaryEl(items) {
    const sum = {};
    items.forEach((i) => { if (!i.legbon) return; const k = MP.legKey(i.legbon); sum[k] = sum[k] || { n: 0, code: i.legbon, raw: i.raw }; sum[k].n++; });
    const leg = items.filter((i) => i.rarity === 'legendary').length, her = items.filter((i) => i.rarity === 'heroic').length;
    const known = items.every((i) => i.name);
    void her; void leg;
    return el('div', { class: 'mp-eqsum' },
      Object.keys(sum).length
        ? el('div', { class: 'mp-eqbons' }, Object.values(sum).map((x) => el('span', { class: 'mp-chip', title: MP.legName(x.code) }, `${MP.legAbbr(x.code, x.raw)} ×${x.n}`)))
        : el('div', { class: 'mp-dim' }, known ? 'Brak legend' : 'Bonusy: brak danych z gry'));
  }

  let eqBox = null, sumBox = null;
  function build(id) {
    tip.innerHTML = '';
    eqBox = el('div', { class: 'mp-eqmain' }, el('div', { class: 'mp-dim mp-eqload' }, 'Wczytuję ekwipunek…'));
    sumBox = el('div');
    tip.classList.toggle('compact', !!cfg.compact);
    tip.append(headerEl(id), el('div', { class: 'mp-eqbody' }, cfg.compact ? null : outfitEl(id), eqBox), sumBox);
  }
  async function fill(id) {
    const items = await fetchEq(id);
    if (hoverId !== id || items === 'wait' || items === 'stale') return;
    eqBox.innerHTML = '';
    if (items === 'own-window') eqBox.appendChild(el('div', { class: 'mp-dim mp-eqload' }, 'Masz otwarte okno ekwipunku z gry.'));
    else if (!items) eqBox.appendChild(el('div', { class: 'mp-warnc mp-eqload' }, 'Nie udało się pobrać.'));
    else if (!items.length) { eqBox.appendChild(el('div', { class: 'mp-dim mp-eqload' }, 'Brak założonych przedmiotów.')); sumBox.innerHTML = ''; }
    else { eqBox.appendChild(layoutGrid(items)); sumBox.innerHTML = ''; sumBox.appendChild(summaryEl(items)); }
    place();
  }

  function show(id, x, y, force, anc) {
    if (!cfg.enabled && !force) return;
    if (!tip) { tip = el('div', { id: 'mp-eqtip', class: 'mp-glass gamey' }); document.body.appendChild(tip); }
    const same = hoverId === id && !!anchor === !!anc;
    anchor = anc || null;
    document.body.classList.add('mp-eq-on');      // chowa dymek gry (mapa i lista graczy) — nasze okno go zastępuje
    tip.style.display = 'block';
    if (!same) { hoverId = id; build(id); fill(id); }
    place(x, y);
  }

  /**
   * Czy gra nadal pokazuje swój dymek. NIE patrzymy na „visibility” — to my go ukrywamy, gdy pokazujemy nasz podgląd
   * (inaczej po ukryciu uznawaliśmy, że dymek zniknął, i podglądy przeskakiwały w kółko).
   */
  function tipShown(n) {
    if (!n || !n.isConnected) return false;
    const r = n.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return false;
    let i = 0;
    for (let p = n; p && p !== document.body && i < 4; p = p.parentElement, i++) { const cs = getComputedStyle(p); if (cs.display === 'none' || cs.opacity === '0') return false; }
    return true;
  }
  /*
   * Dymek gracza z EQ (gra albo inny dodatek — siatka „dad-eq-grid”): przedmioty nie mają tam numerów, tylko slot
   * (data-st), ramkę rzadkości (t-leg = legenda) i obrazek. Dopisujemy skróty bonusów na legendach i podsumowanie legend.
   * Dane bonusów: z tego, co dodatek już zna (wcześniejszy podgląd tego gracza / przedmioty widziane w grze),
   * a gdy czegoś brakuje — RAZ pobieramy EQ tego gracza w tle (wynik pamiętany przez 5 minut).
   */
  const iconKey = (src) => String(src || '').split('?')[0].replace(/^.*?\/(obrazki|itemy|items?)\//i, '').toLowerCase().split('/').slice(-2).join('/');
  const bgBusy = new Set();
  function knownItems(pid) {
    const c = cache[pid];
    return c && Array.isArray(c.items) && now() - c.t < (cfg.cacheSec || 300) * 1000 ? c.items : null;
  }
  function itemForSlot(pid, st, src) {
    const list = knownItems(pid);
    const k = iconKey(src);
    if (list) {
      const bySt = list.find((it) => Number(it.st || (it.raw && it.raw.st)) === st && it.name);
      if (bySt) return bySt;
      const byIcon = list.find((it) => it.icon && iconKey(game.iconUrl(it.icon)) === k);
      if (byIcon) return byIcon;
    }
    // przedmioty widziane wcześniej w grze — po obrazku
    for (const v of seenItems.values()) {
      if (v && v.icon && iconKey(game.iconUrl(v.icon)) === k && String(v.stat || '').includes('legbon')) { try { return game.normItem(v); } catch {} }
    }
    return null;
  }
  async function bgFetch(pid) {
    if (bgBusy.has(pid) || busy) return;
    bgBusy.add(pid);
    try {
      busy = true;
      const items = await fetchRaw(pid);
      if (Array.isArray(items) && items.length) cache[pid] = { t: now(), items };
    } catch {} finally { busy = false; bgBusy.delete(pid); }
  }
  function augmentTip(t, p) {
    try {
      const grid = t.querySelector('.dad-eq-grid');
      if (!grid) return augmentTipIds(t);
      const slots = $$('.dad-eq-slot', grid).filter((sl) => sl.querySelector('.item'));
      const legs = slots.filter((sl) => sl.querySelector('.highlight.t-leg, [class*="t-leg"]'));
      const pid = p && p.id;
      // szybkie wyjście (wywołujemy to przy każdym ruchu myszy): dopisek już jest i nic nowego się nie dowiemy
      const base = pid + '|' + legs.map((sl) => sl.dataset.st).join(',');
      const cur = t.querySelector(':scope .mp-tipsum');
      if (cur && cur.dataset.base === base && (cur.dataset.full === '1' || bgBusy.has(pid) || now() - Number(cur.dataset.t || 0) < 800)) return;
      const found = legs.map((sl) => ({ sl, it: pid ? itemForSlot(pid, Number(sl.dataset.st), (sl.querySelector('img.icon, img') || {}).src) : null }));
      const missing = found.filter((f) => !f.it || !f.it.legbon).length;
      const sig = pid + '|' + legs.map((sl) => sl.dataset.st).join(',') + '|' + (legs.length - missing);
      const have = t.querySelector(':scope .mp-tipsum');
      if (have && have.dataset.sig === sig) return;
      if (have) have.remove();
      // znaczki na legendach
      for (const f of found) {
        const node = f.sl.querySelector('.item');
        if (!node) continue;
        node.querySelectorAll(':scope > .mp-ibadge.bon').forEach((b) => b.remove());
        if (f.it && f.it.legbon) {
          if (getComputedStyle(node).position === 'static') node.style.position = 'relative';
          node.appendChild(el('div', { class: 'mp-ibadge bon', title: MP.legName(f.it.legbon) }, MP.legAbbr(f.it.legbon, f.it.raw)));
        }
      }
      // podsumowanie: same legendy
      const sum = {};
      found.forEach((f) => { if (!f.it || !f.it.legbon) return; const k = MP.legKey(f.it.legbon); sum[k] = sum[k] || { n: 0, code: f.it.legbon, raw: f.it.raw }; sum[k].n++; });
      let body;
      if (!legs.length) body = el('div', { class: 'mp-dim' }, 'Brak legend');
      else if (Object.keys(sum).length) body = el('div', { class: 'mp-eqbons' }, Object.values(sum).map((x) => el('span', { class: 'mp-chip', title: MP.legName(x.code) }, `${MP.legAbbr(x.code, x.raw)} ×${x.n}`)), missing ? el('span', { class: 'mp-dim' }, ' …') : null);
      else body = el('div', { class: 'mp-dim' }, 'Wczytuję bonusy…');
      const box = el('div', { class: 'mp-tipsum' }, body);
      box.dataset.sig = sig; box.dataset.base = base; box.dataset.full = missing ? '0' : '1'; box.dataset.t = String(now());
      t.querySelector('.content') ? t.querySelector('.content').appendChild(box) : t.appendChild(box);
      // czegoś nie znamy — raz pobieramy EQ gracza w tle, potem dopisujemy od nowa
      if (missing && pid && !bgBusy.has(pid) && !knownItems(pid)) bgFetch(pid).then(() => { if (t.isConnected) augmentTip(t, p); });
    } catch (e) { console.warn('[L4Tools] Pokaż EQ', e); }
  }
  /** Stary rodzaj dymka z przedmiotami z numerami (item-id). */
  function augmentTipIds(t) {
    try {
      const els = $$('[class*="item-id-"]', t).filter((n) => /item-id-\d+/.test(String(n.className)));
      if (!els.length) return;
      const sig = els.map((n) => String(n.className).match(/item-id-(\d+)/)[1]).join(',');
      const have = t.querySelector(':scope .mp-tipsum');
      if (have && have.dataset.sig === sig) return;
      const items = els.map((n) => {
        const iid = Number(String(n.className).match(/item-id-(\d+)/)[1]);
        const tpl = Number((String(n.className).match(/item-tpl-(\d+)/) || [])[1]) || 0;
        const r0 = lookupRaw(iid, tpl, n, null, null);
        if (!r0) return { id: iid, name: '', rarity: rarityFromEl(n), legbon: null };
        const it = game.normItem(r0); it.id = iid; return it;
      });
      if (have) have.remove();
      const box = el('div', { class: 'mp-tipsum' }, summaryEl(items));
      box.dataset.sig = sig;
      t.appendChild(box);
      bus.emit('deco');
    } catch {}
  }
  /** Podsumowanie bonusów także w oknie „Ekwipunek Postaci” z gry (gdy sam je otworzysz). */
  function augmentEqWindows() {
    if (!cfg.enabled || activeHide) return;   // okno otwarte w tle przez nasz podgląd — pomijamy
    for (const w of $$('.showeq-window')) {
      if (!shown(w) || getComputedStyle(w).visibility === 'hidden') continue;
      const els = $$('[class*="item-id-"]', w).filter((n) => /item-id-\d+-showeq/.test(String(n.className)));
      const sig = els.map((n) => String(n.className).match(/item-id-(\d+)/)[1]).join(',');
      const have = w.querySelector('.mp-tipsum');
      if (have && have.dataset.sig === sig) continue;
      const items = els.map((n) => {
        const iid = Number(String(n.className).match(/item-id-(\d+)/)[1]);
        const tpl = Number((String(n.className).match(/item-tpl-(\d+)/) || [])[1]) || 0;
        const r0 = lookupRaw(iid, tpl, n, null, null);
        if (!r0) return { id: iid, name: '', rarity: rarityFromEl(n), legbon: null };
        const it = game.normItem(r0); it.id = iid; return it;
      });
      if (have) have.remove();
      if (!items.length) continue;
      const box = el('div', { class: 'mp-tipsum mp-eqwin-sum' }, summaryEl(items));
      box.dataset.sig = sig;
      const host = w.querySelector('.content, [class*="content"]') || w;
      host.appendChild(box);
    }
  }
  function watchHover() {
    let mx = 0, my = 0, rmx = 0, rmy = 0, shift = false, src = null, tipNode = null, lastMapSeen = 0, graceT = null;
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
          if (n.closest('#mp-eqtip, .mp-glass') || !tipShown(n)) continue;
          const r = n.getBoundingClientRect();
          const dx = Math.max(r.left - mx, 0, mx - r.right), dy = Math.max(r.top - my, 0, my - r.bottom);
          if (Math.hypot(dx, dy) > 90) continue;
          // tylko dymek GRACZA: „Nick (poziom…)" — nie dymek przedmiotu z „Właściciel: Nick"
          // (dymek gracza w grze może już sam zawierać jego EQ — więc przedmioty w środku nie wykluczają dymka)
          if (/t_item/.test(n.getAttribute('data-tip-type') || '')) continue;
          // ten sam dymek z tym samym tekstem — gracz już rozpoznany (bez przeliczania przy każdym ruchu myszy)
          const txt = (n.textContent || '').toLowerCase();
          const memo = tipMemo.get(n);
          if (memo && memo.txt === txt && memo.p && game.otherById(memo.p.id)) p = memo.p;
          else { p = nickOf(txt); tipMemo.set(n, { txt, p }); }
          if (p) { tipNode = n; break; }
        }
      }
      // dymek gry sam pokazuje EQ gracza → nie zasłaniamy go, tylko dopisujemy nasze informacje (bonusy na przedmiotach i podsumowanie)
      if (p && tipNode) {
        // na mapie: zostaje dymek gry (z jego EQ) — dopisujemy tylko bonusy; bez własnego okienka i bez pytania serwera
        if (src === 'map') { src = null; hide(); }
        augmentTip(tipNode, p);
        return;
      }
      // gra potrafi na ułamek sekundy przerysować/odświeżyć swój dymek — chowamy dopiero, gdy dymka nie ma przez 250 ms
      if (p) { lastMapSeen = now(); clearTimeout(graceT); want(p.id, 'map', tipNode); }
      else if (src === 'map') {
        if (now() - lastMapSeen > 250) stop('map');
        else { clearTimeout(graceT); graceT = setTimeout(mapCheck, 260); }
      }
    };

    /** Okienko gracza z innego dodatku przy kursorze: element z tekstem „Nick (poziom…” gracza z mapy. */
    let foreign = null, lastForeignScan = 0;
    const tipMemo = new WeakMap();
    // nowe elementy na stronie (do szukania okienek innych dodatków) — zamiast przeszukiwać cały DOM
    const added = [];
    new MutationObserver((muts) => {
      for (const m of muts) for (const n of m.addedNodes) if (n.nodeType === 1 && !n.closest('#mp-eqtip, .mp-glass, .tip-wrapper')) { added.push(n); if (added.length > 40) added.shift(); }
    }).observe(document.body, { childList: true, subtree: true });
    const reCache = new Map();
    const nickRe = (nick) => { let r = reCache.get(nick); if (!r) { r = new RegExp(nick.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\(\\d'); reCache.set(nick, r); if (reCache.size > 500) reCache.clear(); } return r; };
    const nickOf = (txt) => { if (!txt || !txt.includes('(')) return null; let best = null; for (const o of game.others()) if (o.nick && (!best || o.nick.length > best.nick.length) && txt.includes(o.nick.toLowerCase()) && nickRe(o.nick).test(txt)) best = o; return best; };
    const ours = (n) => !n || n === document.body || n === document.documentElement || n.tagName === 'CANVAS' || n.closest('#mp-eqtip, .mp-glass, #mp-qbar, #mp-launcher, .tip-wrapper');
    function findForeign() {
      if (foreign && foreign.n.isConnected && foreign.n.getBoundingClientRect().width > 0) {
        const r = foreign.n.getBoundingClientRect();
        const dx = Math.max(r.left - mx, 0, mx - r.right), dy = Math.max(r.top - my, 0, my - r.bottom);
        if (Math.hypot(dx, dy) < 140 && r.width >= 120 && r.height >= 80 && nickOf((foreign.n.textContent || '').toLowerCase())) return foreign;
      }
      foreign = null;
      // oszczędnie: najwyżej co 250 ms i tylko nad mapą
      const t = now();
      if (t - lastForeignScan < 250) return null;
      lastForeignScan = t;
      const at = document.elementFromPoint(mx, my);
      if (!at || !(at.tagName === 'CANVAS' || (at.closest && at.closest('.map, .map-overlay')))) return null;
      // okienka innych dodatków: dymki/podglądy (role/data-side z bibliotek UI, klasy tooltip/popover, pływające elementy „ll:”).
      // Szukamy po DOM, bo takie okienka zwykle nie łapią myszki (pointer-events:none) i nie da się ich znaleźć „pod kursorem”.
      let best = null, bestD = 1e9;
      for (let k = added.length - 1; k >= 0; k--) {
        const c = added[k];
        if (!c.isConnected) { added.splice(k, 1); continue; }
        if (ours(c)) continue;
        const r = c.getBoundingClientRect();
        // prawdziwe okienko podglądu (nie podpis nad głową gracza ani okno grupy): co najmniej 120×80
        if (r.width < 120 || r.width > 520 || r.height < 80 || r.height > 700) continue;
        if (c.closest('.party-full-view, .party__list, [class*="party"], .new-chat-window')) continue;
        const d = Math.hypot(Math.max(r.left - mx, 0, mx - r.right), Math.max(r.top - my, 0, my - r.bottom));
        if (d > 220 || d >= bestD) continue;
        const txt = (c.textContent || '').toLowerCase();
        if (!txt.includes('(')) continue;
        const p = nickOf(txt);
        if (!p) continue;
        // cały pojemnik okienka (najwyższy, który nadal jest „okienkiem”, a nie całą stroną)
        let n = c;
        while (n.parentElement && n.parentElement !== document.body) {
          const pr = n.parentElement.getBoundingClientRect();
          if (pr.width > 520 || pr.height > 700 || pr.width < 1) break;
          n = n.parentElement;
        }
        best = { n, p }; bestD = d;
      }
      if (best) { foreign = best; return best; }
      return null;
    }

    /* LISTA GRACZY (w grze i w L4Tools) */
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
      mx = e.clientX; my = e.clientY; rmx = mx; rmy = my; shift = e.shiftKey;
      if (!raf) raf = requestAnimationFrame(() => { raf = 0; mapCheck(); });
    }, true);
    document.addEventListener('mouseleave', () => { stop('map'); stop('list'); });
    // bez obserwowania „style” — gra przesuwa nim podpisy graczy w każdej klatce, co niepotrzebnie obciążało grę
    new MutationObserver(debounce(mapCheck, 40)).observe(document.body, { childList: true, subtree: true });

    /* strażnik: podgląd nie może „zawisnąć" — gdy kursor nie jest już nad graczem, chowamy */
    let lostSince = 0;
    setInterval(() => {
      if (!tip || tip.style.display === 'none' || forced) { lostSince = 0; return; }
      let ok = false;
      if (src === 'list') { const at = document.elementFromPoint(rmx, rmy); ok = !!(at && (listRow(at) || at.closest('#mp-eqtip'))); }
      else if (src === 'map') ok = !!(tipNode && tipShown(tipNode));
      if (ok) { lostSince = 0; return; }
      if (!lostSince) lostSince = now();
      else if (now() - lostSince > 500) { lostSince = 0; src = null; hide(); }
    }, 250);

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
    showForce: (id, x, y) => { forced = true; show(id, x, y, true); setTimeout(() => document.addEventListener('mousedown', () => { forced = false; hide(); }, { once: true, capture: true }), 50); },
    hide,
  };

  defineAddon({
    id: 'pokazeq', name: 'Pokaż EQ', icon: 'pokazeq', color: ['#b48cff', '#7c5cff'],
    desc: 'Po najechaniu kursorem na gracza pokazuje jego postać, pełny ekwipunek ułożony jak w grze i podsumowanie bonusów legendarnych. Nie musisz otwierać żadnych okien.',
    defaults: { enabled: false, mapHover: true, listHover: true, needShift: false, compact: false, cacheSec: 300, tipSelector: '.tip-wrapper' },
    notes: () => [{ type: 'info', text: 'Pierwszy podgląd gracza trwa tyle, ile odpowiedź serwera (jak „Pokaż ekwipunek" w grze). Kolejne przez 5 minut są natychmiastowe.' }],
    settings: [
      { key: 'mapHover', type: 'bool', label: 'Najechanie na gracza na mapie' },
      { key: 'listHover', type: 'bool', label: 'Najechanie na gracza na liście graczy (w grze i w L4Tools)' },
      { key: 'needShift', type: 'bool', label: 'Na mapie tylko z wciśniętym Shift' },
      { key: 'compact', type: 'bool', label: 'Mały podgląd', hint: 'Sam ekwipunek, bez postaci — mniejsze okienko.' },
      { adv: true, key: 'cacheSec', type: 'number', label: 'Pamiętaj wynik przez (s)', min: 10, max: 1800 },
      { adv: true, key: 'tipSelector', type: 'text', label: 'Selektor dymka gracza w grze', hint: 'Domyślnie .tip-wrapper.normal-tip' },
    ],
    init(c) {
      cfg = c;
      if (!c._v12) { c._v12 = true; c.needShift = false; c.tipSelector = '.tip-wrapper.normal-tip'; }
      if (!c._v16) { c._v16 = true; c.cacheSec = 300; }
      if (!c._v102d) { c._v102d = true; c.compact = false; }   // jak okno „Ekwipunek Postaci” z gry: postać + EQ
      if (!c._v102e) { c._v102e = true; c.tipSelector = '.tip-wrapper'; }   // każdy dymek gracza w grze (także nowy z EQ)
      config.save();
      hookItemFlow();
      watchHover();
      setInterval(augmentEqWindows, 500);
    },
    onToggle(on) { if (!on) hide(); },
  });
})();
