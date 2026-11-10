// ==UserScript==
// @name         laddonz — legalne dodatki (NI)
// @namespace    https://github.com/L4tuch/laddonz
// @version      1.9.0
// @description  Panel dodatków do Margonem (nowy interfejs): Dobijarka, Bratan, Kto tu jest?, Kto złapie, Let's Cook Together i inne. Jedna akcja = jedno naciśnięcie, automaty domyślnie wyłączone.
// @author       L4tuch
// @match        https://*.margonem.pl/*
// @match        https://*.margonem.com/*
// @exclude      https://www.margonem.pl/*
// @exclude      https://forum.margonem.pl/*
// @exclude      https://www.margonem.com/*
// @exclude      https://forum.margonem.com/*
// @run-at       document-idle
// @grant        none
// @noframes
// @updateURL    https://raw.githubusercontent.com/L4tuch/laddonz/main/dist/laddonz.user.js
// @downloadURL  https://raw.githubusercontent.com/L4tuch/laddonz/main/dist/laddonz.user.js
// @supportURL   https://github.com/L4tuch/laddonz/issues
// ==/UserScript==

(function () {
'use strict';
// ═══ src/core/util.js ═══
/* ───────────────────────── util.js ─────────────────────────
 * Drobne narzędzia wspólne dla całego panelu.
 */
const W = window;
const MP = (W.__MargoPanel = W.__MargoPanel || {});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const now = () => Date.now();
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const rnd = (a, b) => a + Math.random() * (b - a);

function el(tag, attrs, ...kids) {
  const n = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') n.className = v;
      else if (k === 'style' && typeof v === 'object') { for (const [sk, sv] of Object.entries(v)) { if (sv == null) continue; if (sk.startsWith('--')) n.style.setProperty(sk, sv); else n.style[sk] = sv; } }
      else if (k === 'html') n.innerHTML = v;
      else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v === true ? '' : v);
    }
  }
  for (const k of kids.flat()) {
    if (k == null || k === false) continue;
    n.appendChild(typeof k === 'string' || typeof k === 'number' ? document.createTextNode(String(k)) : k);
  }
  return n;
}

function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** Czy użytkownik właśnie pisze (czat, pole tekstowe) — wtedy NIE reagujemy na skróty. */
function isTyping() {
  const a = document.activeElement;
  if (!a) return false;
  const tag = (a.tagName || '').toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || a.isContentEditable;
}

function isVisible(node) {
  if (!node || !node.isConnected) return false;
  const r = node.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return false;
  const cs = getComputedStyle(node);
  return cs.visibility !== 'hidden' && cs.display !== 'none' && cs.opacity !== '0';
}

/** Prosta szyna zdarzeń. */
const bus = {
  map: new Map(),
  on(ev, fn) { if (!this.map.has(ev)) this.map.set(ev, new Set()); this.map.get(ev).add(fn); return () => this.off(ev, fn); },
  off(ev, fn) { this.map.get(ev)?.delete(fn); },
  emit(ev, ...a) {
    for (const fn of this.map.get(ev) || []) {
      try { fn(...a); } catch (e) { console.warn('[laddonz] błąd w obsłudze', ev, e); }
    }
  },
};

MP.util = { sleep, now, $, $$, el, clamp, rnd, debounce, esc, isTyping, isVisible, bus };

// ═══ src/core/storage.js ═══
/* ───────────────────────── storage.js ─────────────────────────
 * Konfiguracja trzymana w localStorage gry (@grant none).
 * Klucz: mp:cfg:<świat>:<postać>  (albo mp:cfg:global gdy wyłączysz osobne ustawienia na postać).
 */
const store = {
  PREFIX: 'mp:',
  get(key, def) {
    try {
      const v = localStorage.getItem(this.PREFIX + key);
      return v == null ? def : JSON.parse(v);
    } catch { return def; }
  },
  set(key, val) {
    try { localStorage.setItem(this.PREFIX + key, JSON.stringify(val)); } catch (e) { console.warn('[laddonz] zapis nieudany', e); }
  },
  del(key) { try { localStorage.removeItem(this.PREFIX + key); } catch {} },
};

const config = {
  data: null,
  key: 'cfg:global',
  defaults: {
    global: {
      perCharacter: true,   // osobne ustawienia dla każdej postaci
      dryRun: false,        // tryb próbny: nic nie wysyłamy do serwera, tylko logujemy
      minInterval: 300,     // minimalny odstęp (ms) między KAŻDYM żądaniem wysłanym przez panel
      panelKey: 'F8',       // skrót otwierający panel
      launcher: { x: 16, y: 120 },
      panelPos: null,
      accent: '#7c5cff',
      glass: 0.55,          // przezroczystość tła panelu
      menuSelector: '.popup-menu\n.menu-wrapper\n[class*="popup-menu"]\n[class*="context-menu"]', // menu prawego przycisku gry (zapas)
    },
    commands: {},           // nadpisania szablonów komend (patrz net.js)
    addons: {},
  },

  worldName() {
    const h = location.hostname.split('.')[0];
    return h || 'world';
  },

  load(charName) {
    const g = store.get('cfg:global', null);
    const perChar = g?.global?.perCharacter !== false;
    this.key = perChar && charName ? `cfg:${this.worldName()}:${charName}` : 'cfg:global';
    const raw = store.get(this.key, null) || g || {};
    this.data = deepMerge(structuredClone(this.defaults), raw);
    return this.data;
  },

  save() {
    if (!this.data) return;
    store.set(this.key, this.data);
    if (this.key !== 'cfg:global') {
      // zapamiętaj tylko przełącznik perCharacter globalnie
      const g = store.get('cfg:global', {}) || {};
      g.global = Object.assign({}, g.global, { perCharacter: this.data.global.perCharacter });
      store.set('cfg:global', g);
    }
  },

  addon(id, defaults) {
    const a = (this.data.addons[id] = deepMerge(structuredClone(defaults || {}), this.data.addons[id] || {}));
    return a;
  },

  export() { return JSON.stringify(this.data, null, 2); },
  import(json) {
    const obj = JSON.parse(json);
    if (!obj || typeof obj !== 'object' || !obj.addons) throw new Error('To nie wygląda na plik konfiguracji laddonz.');
    this.data = deepMerge(structuredClone(this.defaults), obj);
    this.save();
  },
  reset() { store.del(this.key); },
};

function deepMerge(base, over) {
  if (Array.isArray(over)) return over.slice();
  if (!over || typeof over !== 'object') return over === undefined ? base : over;
  const out = base && typeof base === 'object' && !Array.isArray(base) ? base : {};
  for (const [k, v] of Object.entries(over)) {
    out[k] = v && typeof v === 'object' && !Array.isArray(v) ? deepMerge(out[k] && typeof out[k] === 'object' ? out[k] : {}, v) : (Array.isArray(v) ? v.slice() : v);
  }
  return out;
}

MP.store = store;
MP.config = config;

// ═══ src/core/game.js ═══
/* ───────────────────────── game.js ─────────────────────────
 * ADAPTER GRY (nowy interfejs). To JEDYNE miejsce, które dotyka wnętrzności gry
 * (window.Engine, window._g). Jeśli Garmory coś zmieni, poprawiasz tylko ten plik.
 *
 * Każda funkcja jest „defensywna": przy braku danych zwraca pustą wartość, nigdy nie rzuca.
 * Zakładka „Diagnostyka" w panelu pokazuje, które z tych punktów zaczepienia działają.
 */
const E = () => W.Engine;

const PROF_NAMES = { w: 'Wojownik', p: 'Paladyn', b: 'Tancerz ostrzy', m: 'Mag', t: 'Tropiciel', h: 'Łowca' };

// Kody relacji w NI (pole d.relation u innych graczy) — gra używa liczb:
//   1 = brak, 2 = przyjaciel, 3 = wróg, 4 = klan, 5 = sojusz klanu, 6 = wróg klanu, 7 = sojusz frakcji, 8 = wróg frakcji.
// Kody tekstowe zostawione na wypadek starszych wersji.
const REL = {
  friend: ['2', 'fr'],
  clan: ['4', 'cl'],
  ally: ['5', '7', 'cl-fr', 'fr-cl', 'clfr', 'ally'],
  enemy: ['3', '6', '8', 'en', 'cl-en', 'en-cl'],
};

function parseStats(item) {
  if (!item) return {};
  // łączymy oba źródła: tekst „stat" i _cachedStats (u szablonów potrafią się różnić)
  const out = {};
  const s = item.stat !== undefined ? item.stat : item.stats;
  if (s && typeof s === 'object') Object.assign(out, s);
  else String(s || '').split(';').forEach((p) => {
    if (!p) return;
    const i = p.indexOf('=');
    if (i < 0) out[p] = true; else out[p.slice(0, i)] = p.slice(i + 1);
  });
  if (item._cachedStats && typeof item._cachedStats === 'object') {
    for (const [k, v] of Object.entries(item._cachedStats)) if (out[k] === undefined || out[k] === '') out[k] = v;
  }
  return out;
}

/** Bonus legendarny: ze statystyk albo z metody przedmiotu gry (getLegbonStat). */
function legbonOf(it, st) {
  let v = st.legbon;
  try { if (!v && typeof it.issetLegbonStat === 'function' && it.issetLegbonStat()) v = it.getLegbonStat(); } catch {}
  if (v && typeof v === 'object') v = v.name || v.type || v[0] || Object.values(v)[0];
  if (!v && String(st.rarity) === 'legendary') {
    // brak kodu w statystykach — nazwa bonusu z opisu przedmiotu (tooltip gry)
    try {
      const f = it.getTipContent || it.getTipData;
      if (typeof f === 'function') {
        let t = f.call(it); if (t && typeof t === 'object') t = JSON.stringify(t);
        const txt = String(t || '').replace(/<[^>]+>/g, ' ');
        const m = txt.match(/(Cios bardzo krytyczny|Dotyk anioła|Klątwa|Oślepienie|Ostatni ratunek|Krytyczna osłona|Fasada opieki|Płomienne oczyszczenie|Krwawa udręka|Przeszywająca skuteczność)/i);
        if (m) v = m[1];
      }
    } catch {}
  }
  return v ? String(v).split(/[,|]/)[0].trim() : null;
}

function normItem(it) {
  if (!it) return null;
  const st = parseStats(it);
  const expires = st.expires != null ? Number(st.expires) : null;
  return {
    id: Number(it.id),
    name: it.name || '',
    cl: Number(it.cl) || 0,
    tpl: Number(it.tpl) || 0,
    icon: it.icon || '',
    loc: it.loc || '',
    st: Number(it.st) || 0,           // 0 = w torbie, >0 = założony slot
    x: Number(it.x), y: Number(it.y),
    stats: st,
    rarity: String(st.rarity || (st.legendary ? 'legendary' : st.heroic ? 'heroic' : st.unique ? 'unique' : 'common')),
    legbon: legbonOf(it, st),
    expires,
    expired: (expires != null && expires > 0 && expires * 1000 <= now()) || st.expired === true || st.expired === '1',
    raw: it,
  };
}

function normOther(o, heroClan) {
  const d = (o && (o.d || o)) || {};
  const clanId = Number(d.clan && typeof d.clan === 'object' ? d.clan.id : d.clan) || 0;
  let rel = d.relation;
  try { if ((rel == null || rel === '') && o && typeof o.getRelation === 'function') rel = o.getRelation(); } catch {}
  rel = String(rel ?? '');
  const isClan = REL.clan.includes(rel) || (heroClan && clanId && clanId === heroClan);
  return {
    id: Number(d.id),
    nick: d.nick || d.name || '?',
    lvl: Number(d.lvl) || 0,
    prof: d.prof || '',
    x: Number(d.x) || 0,
    y: Number(d.y) || 0,
    clanId,
    clanName: (d.clan && d.clan.name) || d.clan_name || '',
    relation: rel,
    isClan: !!isClan,
    isFriend: REL.friend.includes(rel),
    isAlly: REL.ally.includes(rel),
    isEnemyTagged: REL.enemy.includes(rel),
    raw: o,
  };
}

const game = {
  PROF_NAMES,
  REL,
  parseStats,
  normItem,

  ready() {
    try { return !!(E() && E().hero && E().hero.d && E().hero.d.id && typeof W._g === 'function'); } catch { return false; }
  },

  hero() {
    try {
      const d = E().hero.d;
      return {
        id: Number(d.id), nick: d.nick, lvl: Number(d.lvl), x: Number(d.x), y: Number(d.y), prof: d.prof,
        clanId: Number(d.clan && typeof d.clan === 'object' ? d.clan.id : d.clan) || 0,
      };
    } catch { return null; }
  },

  mapInfo() {
    try {
      const m = E().map.d;
      return { id: Number(m.id), name: m.name || '', pvp: Number(m.pvp) };
    } catch { return { id: 0, name: '', pvp: 0 }; }
  },

  /** Lista innych graczy na mapie (tylko gracze, bez NPC). */
  others() {
    try {
      const o = E().others;
      let src = null;
      if (typeof o.check === 'function') src = o.check();
      else if (typeof o.getDrawableList === 'function') src = o.getDrawableList();
      else src = o.list || o.others || o.d || {};
      const h = this.hero();
      const arr = Array.isArray(src) ? src : Object.values(src || {});
      return arr.map((x) => normOther(x, h && h.clanId)).filter((p) => p.id && p.id !== (h && h.id));
    } catch { return []; }
  },

  otherById(id) { return this.others().find((p) => p.id === Number(id)) || null; },
  otherByNick(nick) {
    const n = String(nick || '').toLowerCase();
    return this.others().find((p) => p.nick.toLowerCase() === n) || null;
  },

  dist(a, b) { return Math.hypot((a.x || 0) - (b.x || 0), (a.y || 0) - (b.y || 0)); },

  /** Wszystkie przedmioty bohatera (torby + założone). */
  heroItems() {
    try {
      const it = E().items;
      let arr = [];
      if (typeof it.fetchLocationItems === 'function') arr = it.fetchLocationItems('g') || [];
      else if (typeof it.getItems === 'function') arr = Object.values(it.getItems() || {});
      else arr = Object.values(it.items || it.d || {});
      return arr.map(normItem).filter(Boolean);
    } catch { return []; }
  },

  itemById(id) {
    id = Number(id);
    try {
      const it = E().items;
      const raw = (typeof it.getItemById === 'function' && it.getItemById(id)) || null;
      if (raw) return normItem(raw);
    } catch {}
    return this.heroItems().find((i) => i.id === id) || null;
  },

  equipped() { return this.heroItems().filter((i) => i.st > 0 && i.loc === 'g'); },
  bag() { return this.heroItems().filter((i) => i.st === 0); },

  /**
   * Wolne miejsca w torbach. Najpierw pytamy grę (funkcje typu getFreeSlots…), potem liczymy sami:
   * pojemność założonych toreb (statystyka „bag") minus przedmioty w torbach. null = nie wiadomo.
   */
  freeBagSlots() {
    const tryFns = (o) => {
      if (!o) return null;
      for (const n of ['getFreeSlots', 'getFreeSlotsAmount', 'getEmptySlots', 'countFreeSlots', 'getFreeBagSlots', 'freeSlots']) {
        try { if (typeof o[n] === 'function') { const v = Number(o[n]()); if (!isNaN(v)) return v; } } catch {}
      }
      return null;
    };
    try {
      for (const k of ['heroEquipment', 'bags', 'items', 'hero']) { const v = tryFns(E()[k]); if (v != null) return v; }
    } catch {}
    const all = this.heroItems();
    const cap = all.filter((i) => i.st > 0 && i.stats.bag != null).reduce((a, i) => a + (parseInt(i.stats.bag, 10) || 0), 0);
    if (!cap) return null;
    const used = all.filter((i) => i.st === 0 && (i.loc === 'g' || !i.loc)).length;
    return Math.max(0, cap - used);
  },

  /** Członkowie grupy (id). Uzupełniane też z odpowiedzi serwera (net.js → partyCache). */
  partyMembers() {
    try {
      const p = E().party;
      if (p) {
        // brak grupy według gry → pusto (nie ufamy zapamiętanym członkom po rozwiązaniu grupy)
        if (typeof p.isParty === 'function' && !p.isParty()) { game._partyCache = []; return []; }
        // okno grupy w grze: elementy członków mają klasę other-party-id-<id> (sprawdzone diagnostyką)
        const domIds = $$('[class*="other-party-id-"]').map((n) => Number((String(n.className).match(/other-party-id-(\d+)/) || [])[1])).filter(Boolean);
        if (typeof p.getMembers === 'function') {
          const m = p.getMembers();
          const list = m instanceof Map ? [...m.keys()] : Array.isArray(m) ? m : Object.keys(m || {});
          const ids = list.map((x) => Number(x && typeof x === 'object' ? (x.id || (x.d && x.d.id)) : x));
          // gdy gra trzyma jeszcze nieaktualnych członków, a okno grupy ich nie pokazuje — ufamy oknu
          if (ids.length && domIds.length && !ids.every((id) => domIds.includes(id))) return [...new Set(domIds)];
          if (ids.length) return ids.filter(Boolean);
        }
        if (domIds.length) return [...new Set(domIds)];
        const m = p.members || (p.d && p.d.members);
        if (m) return Object.keys(m).map(Number).filter(Boolean);
      }
    } catch {}
    return game._partyCache.slice();
  },
  _partyCache: [],

  inBattle() {
    try {
      const b = E().battle;
      if (b) {
        // UWAGA: w NI „show" to funkcja (pokazująca okno), a nie flaga — nie wolno jej sprawdzać jako wartości.
        // walka trwa = okno walki widoczne i walka jeszcze się nie skończyła
        // (po zakończeniu okno walki zostaje otwarte, a „po walce" ma działać od razu)
        if (typeof b.isBattleShow === 'function') {
          if (!b.isBattleShow()) return false;
          if (typeof b.getEndBattle === 'function' && b.getEndBattle()) return false;
          if (typeof b.getEndBattleForMe === 'function' && b.getEndBattleForMe()) return false;
          if (b.endBattleForMe === true) return false;
          return true;
        }
        if (typeof b.getShow === 'function') return !!b.getShow();
        if (typeof b.isShow === 'function') return !!b.isShow();
        if (typeof b.show === 'boolean') return b.show;
        if (typeof b.isBattle === 'boolean') return b.isBattle;
      }
    } catch {}
    const w = document.querySelector('.battle-controller, .battle-window');
    return !!(w && isVisible(w));
  },

  /** Obiekt gracza z gry (NI: Engine.others.getById). */
  otherRaw(id) {
    try {
      const o = E().others;
      if (typeof o.getById === 'function') { const r = o.getById(Number(id)) || o.getById(String(id)); if (r) return r; }
      const src = typeof o.check === 'function' ? o.check() : {};
      return src[id] || Object.values(src).find((x) => Number((x.d || x).id) === Number(id)) || null;
    } catch { return null; }
  },

  /** Ścieżka do ikon przedmiotów. */
  iconUrl(icon) {
    if (!icon) return '';
    if (/^(https?:|data:)/.test(icon)) return icon;
    const base = (W.CFG && (W.CFG.a_ipath || W.CFG.r_ipath || W.CFG.ipath)) || 'https://micc.garmory-cdn.cloud/obrazki/itemy/';
    return base.replace(/\/?$/, '/') + icon.replace(/^\//, '');
  },

  /** Wyciąga id przedmiotu z elementu DOM (NI: klasa item-id-123 albo data-id). */
  itemIdFromEl(node) {
    if (!node) return null;
    const m = (node.className && String(node.className).match(/item-id-(\d+)/)) || null;
    if (m) return Number(m[1]);
    const d = node.getAttribute && (node.getAttribute('data-id') || node.getAttribute('data-item-id'));
    return d ? Number(d) : null;
  },

  /** Element itemu dla id (pierwszy znaleziony). */
  itemEls() {
    return $$('.item[class*="item-id-"], [data-item-id]');
  },
};

MP.game = game;

// ═══ src/core/keys.js ═══
/* ───────────────────────── keys.js ─────────────────────────
 * Skróty klawiszowe. Zasada legalności: JEDNO naciśnięcie = JEDNA akcja.
 * Przytrzymanie klawisza (auto-repeat) jest ignorowane, a skróty nie działają podczas pisania na czacie.
 */
function comboFromEvent(e) {
  const k = e.key;
  if (!k || ['Control', 'Shift', 'Alt', 'Meta'].includes(k)) return '';
  let key = k.length === 1 ? k.toUpperCase() : k;
  if (key === ' ') key = 'Space';
  const mods = [];
  if (e.ctrlKey) mods.push('Ctrl');
  if (e.altKey) mods.push('Alt');
  if (e.shiftKey && k.length !== 1) mods.push('Shift');
  if (e.shiftKey && k.length === 1) mods.push('Shift');
  return [...mods, key].join('+');
}

const keys = {
  binds: [],
  capturing: null,

  /** bind({ id, label, get: () => 'X', fn, when?: () => bool }) */
  bind(b) { this.binds.push(b); },

  conflicts() {
    const seen = {};
    const out = [];
    for (const b of this.binds) {
      const k = b.get();
      if (!k || (b.when && !b.when())) continue;
      if (seen[k]) out.push([seen[k], b.label, k]); else seen[k] = b.label;
    }
    return out;
  },

  start() {
    document.addEventListener('keydown', (e) => {
      if (this.capturing) {
        e.preventDefault(); e.stopPropagation();
        if (e.key === 'Escape') { this.capturing(null); this.capturing = null; return; }
        if (e.key === 'Backspace' || e.key === 'Delete') { this.capturing(''); this.capturing = null; return; }
        const c = comboFromEvent(e);
        if (!c) return;
        this.capturing(c); this.capturing = null;
        return;
      }
      if (e.repeat || isTyping()) return;
      const c = comboFromEvent(e);
      if (!c) return;
      for (const b of this.binds) {
        if (b.get() !== c) continue;
        if (b.when && !b.when()) continue;
        e.preventDefault(); e.stopPropagation();
        try { b.fn(e); } catch (err) { console.warn('[laddonz] skrót', b.label, err); }
        return;
      }
    }, true);
  },

  /** Czeka na naciśnięcie klawisza (do ustawiania skrótu w panelu). */
  capture() { return new Promise((res) => { this.capturing = res; }); },
};

/* ───────── Powiadomienia (toasty) — wygląd ustawia dodatek Hey WakeUP! ───────── */
function toast(msg, type = 'info', ms = 3200) {
  // Najpierw komunikat samej gry (żółty tekst na dole) — wygląda dokładnie jak w grze,
  // a Hey WakeUP! zmienia jego wygląd stylami. Własny zapasowy tylko, gdy gra nie ma funkcji message().
  try { if (typeof W.message === 'function' && !(config.data && config.data.global.ownToasts)) { W.message(String(msg)); return; } } catch {}
  let host = document.getElementById('mp-toasts');
  if (!host) { host = el('div', { id: 'mp-toasts' }); document.body.appendChild(host); }
  const t = el('div', { class: `mp-toast mp-toast-${type}` }, msg);
  host.appendChild(t);
  while (host.children.length > 4) host.firstChild.remove();
  requestAnimationFrame(() => t.classList.add('in'));
  setTimeout(() => { t.classList.remove('in'); setTimeout(() => t.remove(), 300); }, ms);
}

MP.keys = keys;
MP.toast = toast;

// ═══ src/core/net.js ═══
/* ───────────────────────── net.js ─────────────────────────
 * Wszystko, co panel wysyła do serwera, przechodzi przez TEN plik:
 *   • kolejka z minimalnym odstępem (nie spamujemy serwera),
 *   • „bezpieczniki" (guards) — np. Bratan blokuje ataki na klan,
 *   • tryb próbny (dry run) — loguje zamiast wysyłać,
 *   • blokada akcji niszczących (usuwanie / ulepszanie), dopóki komenda nie zostanie
 *     ZWERYFIKOWANA przez Ciebie podsłuchem w zakładce Diagnostyka,
 *   • podsłuch (sniffer) komend, które wysyła sama gra — do nauczenia panelu prawdziwych komend.
 */

// Szablony komend. {id}, {item}, {ingredients} są podmieniane.
// verified:false + destructive:true => panel ODMÓWI wysłania, dopóki nie podsłuchasz komendy w grze.
const DEFAULT_COMMANDS = {
  attackPlayer: { t: 'fight&a=attack&id={id}', destructive: false, label: 'Atak na gracza', how: 'Zaatakuj ręcznie dowolnego gracza.' },
  fastFight:    { t: 'fight&a=f', destructive: false, label: 'Szybka walka (f)', how: 'W walce kliknij „Szybka walka".' },
  partyInvite:  { t: 'party&a=inv&id={id}', destructive: false, label: 'Zaproszenie do grupy', how: 'Zaproś ręcznie kogoś do grupy.' },
  partyDisband: { t: 'party&a=disband', destructive: false, label: 'Rozwiązanie grupy', how: 'Rozwiąż grupę przyciskiem w oknie grupy.' },
  useItem:      { t: 'moveitem&st=1&id={id}', destructive: false, label: 'Użycie przedmiotu', how: 'Użyj (2× klik) dowolnej mikstury.' },
  eqSet:        { t: '', destructive: false, label: 'Zmiana zestawu', how: 'Przełącz ręcznie zestaw ekwipunku.' },
  otherEq:      { t: '', destructive: false, label: 'Podgląd EQ gracza', how: 'Kliknij u gracza „Pokaż ekwipunek".' },
  friendAdd:    { t: '', destructive: false, label: 'Dodanie do znajomych', how: 'Dodaj ręcznie kogoś do znajomych.' },
  // potwierdzone w grze (raport z okna rzemiosła): podgląd → ulepszenie → gra zadaje pytanie → odpowiedź „Tak" wysyła sama gra.
  // NIE dopisujemy odpowiedzi z góry (answer…=1) — serwer traktuje to jako błąd i wyrzuca z gry.
  enhancePreview: { t: 'enhancement&action=progress_preview&item={item}&ingredients={ingredients}', verified: true, destructive: false, label: 'Podgląd ulepszenia', how: 'Włóż przedmiot i składnik w oknie ulepszania.' },
  enhance:      { t: 'enhancement&action=progress&item={item}&ingredients={ingredients}', verified: true, destructive: true, label: 'Ulepszenie przedmiotu', how: 'Ulepsz ręcznie przedmiot jednym składnikiem.' },
};

const net = {
  origG: null,
  guards: [],
  queue: [],
  busy: false,
  lastSent: 0,
  log: [],            // ostatnie akcje panelu
  sniff: [],          // ostatnie komendy wysłane przez GRĘ
  sniffing: true,
  stats: { gameCalls: 0, ourCalls: 0, blocked: 0, responses: 0 },
  _ours: false,

  cmd(name) {
    const base = DEFAULT_COMMANDS[name] || { t: '', destructive: true };
    const over = (config.data.commands || {})[name] || {};
    return Object.assign({ verified: false }, base, over);
  },

  /** Powrót do komendy wbudowanej (kasuje własną/nauczoną). */
  resetCmd(name) {
    if (config.data.commands) delete config.data.commands[name];
    config.save();
    bus.emit('commands:changed');
  },

  setCmd(name, template, verified = true) {
    config.data.commands[name] = { t: template, verified };
    config.save();
    bus.emit('commands:changed');
  },

  build(name, params = {}) {
    const c = this.cmd(name);
    if (!c.t) return { error: `Komenda „${c.label || name}" nie jest jeszcze ustawiona. Wejdź w Diagnostyka → Podsłuch i ${c.how?.toLowerCase() || 'wykonaj akcję ręcznie'}` };
    if (c.destructive && !c.verified) return { error: `Komenda „${c.label}" jest zablokowana do czasu weryfikacji (Diagnostyka).` };
    let t = c.t;
    for (const [k, v] of Object.entries(params)) t = t.split(`{${k}}`).join(encodeURIComponent(String(v)).replace(/%2C/g, ','));
    if (/\{\w+\}/.test(t)) return { error: `Brak parametru w komendzie: ${t}` };
    return { task: t, cmd: c };
  },

  /** Zarejestruj bezpiecznik: fn(task) => null | { block:true, reason } */
  addGuard(fn) { this.guards.push(fn); },

  checkGuards(task) {
    for (const g of this.guards) {
      try {
        const r = g(task);
        if (r && r.block) return r;
      } catch (e) { console.warn('[laddonz] guard error', e); }
    }
    return null;
  },

  pushLog(entry) {
    this.log.unshift(Object.assign({ t: now() }, entry));
    if (this.log.length > 200) this.log.length = 200;
    bus.emit('log');
  },

  /**
   * Podpięcie pod wysyłanie komend gry: window._g (sprawdzone diagnostyką — gra wysyła nim m.in. atak).
   * Bezpieczniki (Bratan) działają na wszystkim, co przez nie przechodzi — także na ręcznym ataku.
   */
  install() {
    if (typeof W._g !== 'function') return false;
    if (!this.origG) this.origG = W._g.__mpOrig || W._g;
    this.wrapTaskFn(W, '_g', 'window._g');
    this.hookResponses();
    this.installed = true;
    return true;
  },
  installed: false,
  transport: null,     // { obj, name, orig, label } — droga, którą gra wysyła komendy
  _depth: 0,
  _lastSniff: { task: '', t: 0 },

  /**
   * Samouczenie ulepszania: gdy SAM ulepszysz przedmiot w oknie rzemiosła, panel patrzy, które przedmioty
   * zniknęły z torby po wysłanej komendzie. Jeśli komenda zawierała ulepszany przedmiot i dokładnie te zużyte —
   * zapamiętuje ją jako szablon. Wszystko, co gra wysłała przy otwartym oknie rzemiosła, trafia też do
   * learnLog (raport „Kopiuj raport" w Ulepszarce), gdyby gra robiła to inaczej.
   */
  learnLog: [],
  recent: [],          // ostatnie komendy gry (wszystkie) — do raportu, z informacją czy okno rzemiosła było otwarte
  craftOpen() {
    try {
      const c = W.Engine && W.Engine.crafting;
      if (c && typeof c.isOpen === 'function' && c.isOpen()) return true;
    } catch {}
    try {
      return $$('[class*="window"]').some((w) => isVisible(w) && /rzemios|ulepsza|crafting|enhanc/i.test(((w.querySelector('[class*="header"], [class*="title"]') || {}).textContent || '') + ' ' + w.className));
    } catch { return false; }
  },
  autoLearn(t, args) {
    try { this.recent.unshift({ t: new Date().toISOString().slice(11, 23), task: t.slice(0, 160), craft: this.craftOpen() }); if (this.recent.length > 60) this.recent.length = 60; } catch {}
    try {
      const head = t.split('&')[0];
      const craft = this.craftOpen() || /enhanc|upgrad|ulepsz|craft/i.test(head);
      if (!craft) return;
      const bagIds = () => new Set(game.heroItems().map((i) => i.id));
      const before = bagIds();
      const rec = { t: now(), task: t, extra: args && args.length > 1 ? args.slice(1).map((x) => { try { return typeof x === 'function' ? 'fn' : JSON.stringify(x).slice(0, 200); } catch { return String(x); } }) : undefined };
      this.learnLog.unshift(rec); if (this.learnLog.length > 30) this.learnLog.length = 30;
      setTimeout(() => {
        const after = bagIds();
        const gone = [...before].filter((id) => !after.has(id));
        rec.gone = gone;
        bus.emit('learnlog');
        if (!gone.length) return;
        // parametry komendy: lista/pojedyncze id zużytych → {ingredients}, istniejący przedmiot → {item}
        let item = 0, ing = 0;
        const tpl = t.replace(/=([0-9,]+)(?=&|$)/g, (m, v) => {
          const ids = v.split(',').filter(Boolean).map(Number);
          if (ids.length && ids.every((id) => gone.includes(id))) { ing++; return '={ingredients}'; }
          if (ids.length === 1 && after.has(ids[0]) && !item) { item++; return '={item}'; }
          return m;
        });
        rec.tpl = tpl;
        if (/answer\d+=/.test(tpl)) return;   // to odpowiedź na pytanie gry — nie zapamiętujemy (komenda bez odpowiedzi jest wbudowana)
        if (item !== 1 || ing !== 1 || tpl === this.cmd('enhance').t) return;   // ta sama co wbudowana → nic do zmiany
        this.setCmd('enhance', tpl, true);
        this.pushLog({ kind: 'info', src: 'Ulepszarka', msg: 'Nauczono komendy ulepszania: ' + tpl });
        toast('Ulepszarka: gra ulepsza teraz inaczej — zapamiętałam nowy sposób', 'ok');
        bus.emit('cmd:learned', 'enhance');
      }, 1800);
    } catch {}
  },

  isTask(x) { return typeof x === 'string' && /^[a-z_0-9]+&[a-z_0-9]+=/i.test(x); },

  wrapTaskFn(obj, name, label) {
    const orig = obj[name];
    if (typeof orig !== 'function' || orig.__mpTask) return;
    const self = this;
    const w = function (...args) {
      const t = self.isTask(args[0]) ? args[0] : null;
      if (!t) return orig.apply(this, args);
      if (!self._ours) {
        if (self._depth === 0) {
          if (!(self._lastSniff.task === t && now() - self._lastSniff.t < 80)) {
            self._lastSniff = { task: t, t: now() };
            self.stats.gameCalls++;
            if (self.sniffing) {
              self.sniff.unshift({ t: now(), task: t, via: label });
              if (self.sniff.length > 40) self.sniff.length = 40;
              bus.emit('sniff');
            }
            self.autoLearn(t, args);
          }
        }
        const g = self.checkGuards(t);
        if (g) {
          self.stats.blocked++;
          self.pushLog({ kind: 'block', task: t, msg: g.reason, src: g.src || 'bezpiecznik' });
          toast(g.reason, 'bad');
          return;
        }
      }
      self._depth++;
      try { return orig.apply(this, args); } finally { self._depth--; }
    };
    for (const k of Object.keys(orig)) { try { w[k] = orig[k]; } catch {} }
    w.__mpTask = true; w.__mpOrig = orig;
    try { obj[name] = w; } catch {}
  },

  /** Wysyła komendę tą samą drogą, której używa gra. */
  rawSend(task, cb) {
    this._ours = true;
    try {
      if (this.origG) return this.origG.call(W, task, cb);
      throw new Error('Nie znaleziono funkcji wysyłającej komendy gry');
    } finally { this._ours = false; }
  },

  /**
   * Wyślij komendę przez kolejkę.
   * opts: { src: 'Napad', onResponse(data), urgent: bool }
   */
  send(name, params = {}, opts = {}) {
    const b = this.build(name, params);
    if (b.error) {
      this.pushLog({ kind: 'error', task: name, msg: b.error, src: opts.src });
      toast(b.error, 'warn');
      return Promise.resolve({ ok: false, error: b.error });
    }
    return this.sendRaw(b.task, opts);
  },

  sendRaw(task, opts = {}) {
    return new Promise((resolve) => {
      const job = { task, opts, resolve };
      if (opts.urgent) this.queue.unshift(job); else this.queue.push(job);
      this.pump();
    });
  },

  clearQueue(src) {
    this.queue = this.queue.filter((j) => { if (!src || j.opts.src === src) { j.resolve({ ok: false, error: 'anulowano' }); return false; } return true; });
  },

  async pump() {
    if (this.busy) return;
    this.busy = true;
    try {
      while (this.queue.length) {
        const gap = Math.max(150, Number(config.data.global.minInterval) || 300);
        const wait = this.lastSent + gap - now();
        if (wait > 0) await sleep(wait);
        const job = this.queue.shift();
        if (!job) break;
        this.lastSent = now();
        const { task, opts } = job;

        if (!this.installed && !this.install()) {
          this.pushLog({ kind: 'error', task, msg: 'Nie znaleziono funkcji wysyłającej komendy gry', src: opts.src });
          job.resolve({ ok: false, error: 'no transport' });
          continue;
        }
        const g = this.checkGuards(task);
        if (g) {
          this.stats.blocked++;
          this.pushLog({ kind: 'block', task, msg: g.reason, src: g.src || opts.src });
          toast(g.reason, 'bad');
          job.resolve({ ok: false, blocked: true, error: g.reason });
          continue;
        }
        if (config.data.global.dryRun) {
          this.pushLog({ kind: 'dry', task, msg: 'Tryb próbny — nie wysłano', src: opts.src });
          job.resolve({ ok: true, dry: true });
          continue;
        }
        this.stats.ourCalls++;
        this.pushLog({ kind: 'send', task, src: opts.src });
        let done = false;
        const finish = (data) => { if (done) return; done = true; try { opts.onResponse && opts.onResponse(data || {}); } catch {} job.resolve({ ok: true, data }); };
        try {
          this.rawSend(task, (data) => finish(data));
        } catch (e) {
          this.pushLog({ kind: 'error', task, msg: String(e), src: opts.src });
          done = true;
          job.resolve({ ok: false, error: String(e) });
        }
        // jeśli gra nie wywoła callbacka, po 1.5 s uznajemy żądanie za wysłane
        setTimeout(() => finish(this._lastData), 1500);
      }
    } finally { this.busy = false; }
  },

  _lastData: null,

  /** Podsłuch odpowiedzi serwera — kilka strategii, bo nie wiemy która metoda istnieje w danej wersji NI. */
  hookResponses() {
    const c = E() && E().communication;
    const self = this;
    const tryWrap = (obj, name) => {
      if (!obj || typeof obj[name] !== 'function' || obj[name].__mp) return false;
      const orig = obj[name];
      obj[name] = function (...args) {
        const data = args.find((a) => a && typeof a === 'object');
        if (data) self.onData(data);
        return orig.apply(this, args);
      };
      obj[name].__mp = true;
      self.respHook = name;
      return true;
    };
    if (c) {
      if (tryWrap(c, 'parseJSON')) return;
      if (tryWrap(c, 'successData')) return;
      if (tryWrap(c, 'dispatchData')) return;
    }
    this.respHook = null;
  },
  respHook: null,

  onData(data) {
    this.stats.responses++;
    this._lastData = data;
    try {
      if (data.party && data.party.members) game._partyCache = Object.keys(data.party.members).map(Number);
      else if (data.party === null || (data.party && data.party.disband)) game._partyCache = [];
      if (data.f) {
        if (data.f.init || data.f.init === 0) battleWatch.set(true);
        if (data.f.endBattle || data.f.close || data.f.battleEnd) battleWatch.set(false);
      }
    } catch {}
    bus.emit('data', data);
  },
};

/** Zdarzenia walki: battle:start / battle:end (z danych serwera + zapasowy odczyt stanu co 400 ms). */
const battleWatch = {
  state: false,
  set(v) {
    if (v === this.state) return;
    this.state = v;
    bus.emit(v ? 'battle:start' : 'battle:end');
  },
  start() {
    setInterval(() => { if (game.ready()) this.set(game.inBattle()); }, 150);
    // natychmiastowe wykrycie końca walki: podpinamy się pod funkcje gry, które ją kończą
    const hook = () => {
      const b = E() && E().battle;
      if (!b) return;
      for (const n of ['endBattle', 'endBattleForMe', 'setEndBattle', 'setEndBattleForMe']) {
        const f = b[n];
        if (typeof f !== 'function' || f.__mp) continue;
        const self = this;
        b[n] = function (...a) {
          const r = f.apply(this, a);
          try { if (!/^set/.test(n) || a[0]) self.set(false); } catch {}
          return r;
        };
        b[n].__mp = true;
      }
    };
    hook(); setInterval(hook, 3000);
  },
};

/** Zdarzenie zmiany mapy. */
const mapWatch = {
  id: null,
  start() {
    setInterval(() => {
      const m = game.mapInfo();
      if (m.id && m.id !== this.id) { const prev = this.id; this.id = m.id; if (prev != null) bus.emit('map:change', m); }
    }, 1000);
  },
};

/** Zamienia podsłuchaną komendę na szablon (id przedmiotów/graczy → {id} itd.). */
function templatize(name, task) {
  const itemIds = new Set(game.heroItems().map((i) => String(i.id)));
  const otherIds = new Set(game.others().map((p) => String(p.id)));
  let t = task;
  if (name === 'fastFight' || name === 'partyDisband') return t;
  if (name === 'eqSet') {
    // ostatnia liczba w komendzie to numer zestawu
    const all = [...t.matchAll(/=(\d+)(?=&|$)/g)];
    if (all.length) { const m = all[all.length - 1]; t = t.slice(0, m.index) + '={id}' + t.slice(m.index + m[0].length); }
    return t;
  }
  if (name === 'enhance') {
    // lista składników „1,2,3" → {ingredients}; pojedynczy id przedmiotu → {item}
    t = t.replace(/=((?:\d+,)+\d+)(?=&|$)/g, '={ingredients}');
    let used = false;
    t = t.replace(/=(\d+)(?=&|$)/g, (m, id) => {
      if (!used && itemIds.has(id)) { used = true; return '={item}'; }
      if (itemIds.has(id)) return '={ingredients}';
      return m;
    });
    return t;
  }
  const nicks = game.others().map((p) => p.nick).filter(Boolean);
  t = t.replace(/=([^&]+)(?=&|$)/g, (m, v) => {
    let dv = v; try { dv = decodeURIComponent(v); } catch {}
    return nicks.some((n) => n.toLowerCase() === dv.toLowerCase()) ? '={nick}' : m;
  });
  return t.replace(/=(-?\d+)(?=&|$)/g, (m, id) => (itemIds.has(id) || otherIds.has(id) || /^\d{4,}$/.test(id) ? '={id}' : m));
}

MP.net = net;
MP.battleWatch = battleWatch;
MP.templatize = templatize;
MP.DEFAULT_COMMANDS = DEFAULT_COMMANDS;

// ═══ src/core/icons.js ═══
/* ───────────────────────── icons.js ─────────────────────────
 * Własne ikonki SVG (rysowane ręcznie, bez zewnętrznych plików).
 * Każda ikonka: viewBox 0 0 24 24, kolor = currentColor.
 */
const ICON_PATHS = {
  // dodatki
  napad: '<path d="M4 20l7-7"/><path d="M14.5 3.5l6 6-8.5 8.5-6-6z"/><path d="M3 17l4 4"/><path d="M16 6l2 2"/>',
  wakeup: '<path d="M6 16V11a6 6 0 1112 0v5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 004 0"/><path d="M3 7.5c.6-1.6 1.6-3 3-4"/><path d="M21 7.5c-.6-1.6-1.6-3-3-4"/>',
  bratan: '<path d="M12 3l7.5 3v5.5c0 4.6-3.2 8.3-7.5 9.5-4.3-1.2-7.5-4.9-7.5-9.5V6z"/><path d="M8.5 12.5l2.3 2.3 4.7-5"/>',
  ktotu: '<circle cx="9" cy="8" r="3.3"/><path d="M3 20c.4-3.6 2.8-5.6 6-5.6s5.6 2 6 5.6"/><circle cx="17.5" cy="15.5" r="2.6"/><path d="M19.4 17.4L22 20"/>',
  ktozlapie: '<path d="M7 4h10l-1 6.5a4 4 0 01-8 0z"/><path d="M12 14.5V18"/><path d="M8.5 20.5h7"/><path d="M17 5.5h2.5a2 2 0 010 4H16.6"/><path d="M7 5.5H4.5a2 2 0 000 4h2.9"/>',
  cook: '<path d="M5 11h14v3a7 7 0 01-14 0z"/><path d="M3 11h18"/><path d="M9 7.5c0-1.5 1-1.5 1-3"/><path d="M12.5 7.5c0-1.5 1-1.5 1-3"/><path d="M16 7.5c0-1.5 1-1.5 1-3"/>',
  podpis: '<path d="M4 20h5l10.5-10.5a2.1 2.1 0 00-3-3L6 17v3"/><path d="M14.5 8.5l3 3"/><path d="M13 20h7"/>',
  pokazeq: '<path d="M7 7V5.5A2.5 2.5 0 019.5 3h5A2.5 2.5 0 0117 5.5V7"/><rect x="3.5" y="7" width="17" height="13" rx="2.5"/><circle cx="12" cy="13.5" r="2.4"/><path d="M3.5 12h6.1M14.4 12h6.1"/>',
  jakibon: '<path d="M12 3l2.6 5.5 6 .8-4.4 4.1 1.1 5.9L12 16.4l-5.3 2.9 1.1-5.9-4.4-4.1 6-.8z"/><path d="M10 11.5h4"/>',
  przypom: '<rect x="3.5" y="9" width="17" height="11.5" rx="2"/><path d="M2.5 9h19V6.5h-19z"/><path d="M12 6.5v14"/><path d="M12 6.5C10.5 3 7 3 7 5s3 1.5 5 1.5z"/><path d="M12 6.5C13.5 3 17 3 17 5s-3 1.5-5 1.5z"/>',
  taxi: '<path d="M4 16v-3.5L6 8h12l2 4.5V16"/><path d="M3 16h18v2.5H3z"/><circle cx="7.5" cy="16" r="1.8"/><circle cx="16.5" cy="16" r="1.8"/><path d="M9.5 5h5v3h-5z"/>',
  autof: '<path d="M13 2.5L5 13.5h6l-1 8 8-11h-6z"/>',
  szybka: '<path d="M8 12.5V5.5a1.5 1.5 0 013 0V11"/><path d="M11 10V4a1.5 1.5 0 013 0v6.5"/><path d="M14 10.5V6a1.5 1.5 0 013 0v7.5c0 4-2.5 7-6 7-2.6 0-4.3-1.3-5.6-3.5L3.7 14a1.5 1.5 0 012.6-1.5l1.7 2.3"/>',
  ulepszarka: '<path d="M3 21l8.5-8.5"/><path d="M13.5 4.5l6 6"/><path d="M11 7l6 6-2 2-6-6z"/><path d="M19 3l.6 1.4L21 5l-1.4.6L19 7l-.6-1.4L17 5l1.4-.6z"/><path d="M5 4l.4 1 1 .4-1 .4L5 7l-.4-1.2-1-.4 1-.4z"/>',
  minichat: '<path d="M4 5h16v10.5H9l-5 4z"/><path d="M14 10.5h3.5M14 10.5v-3.5"/><path d="M8 8.5l2.5 2.5"/>',
  // interfejs
  logo: '<path d="M12 2.5l8.5 5v9L12 21.5l-8.5-5v-9z"/><path d="M10 7.8v8.4h5" stroke-width="2.3"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
  diag: '<path d="M3 12h4l2.5-6 5 12 2.5-6H21"/>',
  log: '<path d="M5 5h14M5 10h14M5 15h9M5 20h6"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M21.5 12h-3M5.5 12h-3M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1M18.7 18.7l-2.1-2.1M7.4 7.4L5.3 5.3"/>',
  grid: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
  warn: '<path d="M12 3.5l9.5 16.5h-19z"/><path d="M12 10v4.5M12 17.2v.3"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 018 0v3"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M17 6l3 3M15 8l2 2"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  pin: '<path d="M9 3h6l-1 6 3 3v2H7v-2l3-3z"/><path d="M12 14v7"/>',
  drag: '<circle cx="9" cy="6" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="18" r="1"/>',
};

function icon(name, size = 20) {
  const p = ICON_PATHS[name] || ICON_PATHS.logo;
  const s = el('span', { class: 'mp-ico', style: { width: size + 'px', height: size + 'px' } });
  s.innerHTML = `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
  return s;
}

MP.icon = icon;

// ═══ src/core/styles.js ═══
/* ───────────────────────── styles.js ─────────────────────────
 * Wygląd panelu: ciemne, rozmyte „szkło". Kolor akcentu i przezroczystość ustawiasz w zakładce Ogólne.
 * Wszystkie klasy mają prefiks mp- żeby nie gryzły się z grą.
 */
const CSS = `
:root{--mp-bg:16,17,28;--mp-accent:#7c5cff;--mp-glass:.55;--mp-fg:#eef0ff;--mp-dim:#a6abc8;--mp-line:rgba(255,255,255,.10);--mp-ok:#3ddc97;--mp-warn:#ffb547;--mp-bad:#ff5d7a}
.mp-glass{background:rgba(var(--mp-bg),var(--mp-glass));-webkit-backdrop-filter:blur(18px) saturate(160%);backdrop-filter:blur(18px) saturate(160%);border:1px solid rgba(255,255,255,.12);box-shadow:0 20px 60px rgba(0,0,0,.45),inset 0 1px 0 rgba(255,255,255,.08);color:var(--mp-fg);font:13px/1.45 "Segoe UI",system-ui,-apple-system,Roboto,sans-serif}
.mp-glass *{box-sizing:border-box}
.mp-ico{display:inline-flex;align-items:center;justify-content:center;flex:none}
.mp-ico svg{display:block}

/* przycisk startowy */
#mp-launcher{position:fixed;z-index:2147483000;width:46px;height:46px;border-radius:15px;display:flex;align-items:center;justify-content:center;cursor:pointer;user-select:none;color:#fff;transition:transform .15s}
#mp-launcher:hover{transform:scale(1.07)}
#mp-launcher .mp-ico{color:var(--mp-accent);filter:drop-shadow(0 0 8px var(--mp-accent))}

/* panel */
#mp-panel{position:fixed;z-index:2147483001;width:860px;max-width:96vw;height:580px;max-height:92vh;border-radius:20px;display:flex;flex-direction:column;overflow:hidden;animation:mpIn .18s ease-out}
@keyframes mpIn{from{opacity:0;transform:translateY(8px) scale(.98)}to{opacity:1;transform:none}}
.mp-head{display:flex;align-items:center;gap:10px;padding:12px 14px;border-bottom:1px solid var(--mp-line);cursor:move;user-select:none}
.mp-head .mp-title{font-weight:700;font-size:15px;letter-spacing:.2px}
.mp-head .mp-sub{color:var(--mp-dim);font-size:12px}
.mp-head .mp-sp{flex:1}
.mp-tabs{display:flex;gap:4px}
.mp-tab{all:unset;cursor:pointer;display:flex;align-items:center;gap:6px;padding:6px 10px;border-radius:10px;color:var(--mp-dim);font-size:12.5px}
.mp-tab:hover{background:rgba(255,255,255,.06);color:var(--mp-fg)}
.mp-tab.on{background:color-mix(in srgb,var(--mp-accent) 28%,transparent);color:#fff}
.mp-x{all:unset;cursor:pointer;width:30px;height:30px;border-radius:9px;display:flex;align-items:center;justify-content:center;color:var(--mp-dim)}
.mp-x:hover{background:rgba(255,93,122,.18);color:#fff}
.mp-body{flex:1;display:flex;min-height:0}
.mp-side{width:250px;border-right:1px solid var(--mp-line);display:flex;flex-direction:column;min-height:0}
.mp-search{margin:10px;display:flex;align-items:center;gap:6px;padding:7px 10px;border-radius:11px;background:rgba(255,255,255,.06);color:var(--mp-dim)}
.mp-search input{all:unset;flex:1;color:var(--mp-fg);font-size:12.5px}
.mp-list{overflow-y:auto;overflow-x:hidden;padding:0 6px 10px 8px;margin:0 2px 8px 0;flex:1;overscroll-behavior:contain}
.mp-row{display:flex;align-items:center;gap:10px;padding:7px 8px;border-radius:12px;cursor:pointer;margin-bottom:2px}
.mp-row:hover{background:rgba(255,255,255,.05)}
.mp-row.sel{background:rgba(255,255,255,.09);box-shadow:inset 0 0 0 1px rgba(255,255,255,.08)}
.mp-row .nm{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:600;font-size:12.8px}
.mp-row.off .nm{color:var(--mp-dim);font-weight:500}
.mp-tile{width:32px;height:32px;border-radius:10px;display:flex;align-items:center;justify-content:center;color:#fff;flex:none;box-shadow:inset 0 1px 0 rgba(255,255,255,.25),0 4px 12px rgba(0,0,0,.25)}
.mp-row.off .mp-tile{filter:grayscale(.85) brightness(.75)}
.mp-main{flex:1;overflow-y:auto;overflow-x:hidden;padding:18px 18px 18px 22px;min-width:0;margin:6px 4px 6px 0;overscroll-behavior:contain}
.mp-h{display:flex;align-items:center;gap:14px;margin-bottom:6px}
.mp-h .mp-tile{width:46px;height:46px;border-radius:14px}
.mp-h h2{margin:0;font-size:18px}
.mp-desc{color:var(--mp-dim);margin:2px 0 14px}
.mp-badge{display:inline-flex;align-items:center;gap:4px;font-size:10.5px;font-weight:700;letter-spacing:.4px;padding:2px 7px;border-radius:999px;text-transform:uppercase}
.mp-badge.auto{background:rgba(255,181,71,.16);color:var(--mp-warn)}
.mp-badge.destr{background:rgba(255,93,122,.16);color:var(--mp-bad)}
.mp-badge.ok{background:rgba(61,220,151,.14);color:var(--mp-ok)}
.mp-badge.lock{background:rgba(255,255,255,.08);color:var(--mp-dim)}
.mp-card{background:rgba(255,255,255,.04);border:1px solid var(--mp-line);border-radius:14px;padding:12px 14px;margin-bottom:12px}
.mp-card h3{margin:0 0 8px;font-size:12px;text-transform:uppercase;letter-spacing:.8px;color:var(--mp-dim)}
.mp-field{display:flex;align-items:center;gap:12px;padding:7px 0;border-bottom:1px dashed rgba(255,255,255,.06)}
.mp-field:last-child{border-bottom:0}
.mp-field .lb{flex:1;min-width:0}
.mp-field .lb small{display:block;color:var(--mp-dim);font-size:11.5px;margin-top:1px}
.mp-field.warn .lb{color:#ffd9a0}
.mp-in{all:unset;box-sizing:border-box;background:rgba(0,0,0,.28);border:1px solid rgba(255,255,255,.12);border-radius:9px;padding:6px 9px;color:var(--mp-fg);font-size:12.5px;min-width:70px}
.mp-in:focus{border-color:var(--mp-accent)}
select.mp-in{appearance:auto;cursor:pointer}
select.mp-in option{background:#1a1b2b}
textarea.mp-in{width:100%;min-height:90px;font-family:Consolas,monospace;font-size:12px;white-space:pre}
.mp-in.num{width:84px;text-align:right}
.mp-in.txt{width:220px}
.mp-color{width:38px;height:28px;border:0;border-radius:8px;background:none;cursor:pointer;padding:0}
.mp-key{all:unset;cursor:pointer;min-width:84px;text-align:center;padding:6px 10px;border-radius:9px;background:rgba(0,0,0,.28);border:1px solid rgba(255,255,255,.14);font-family:Consolas,monospace;font-size:12px}
.mp-key.cap{border-color:var(--mp-accent);color:#fff;box-shadow:0 0 0 3px color-mix(in srgb,var(--mp-accent) 30%,transparent)}
.mp-key.empty{color:var(--mp-dim)}
.mp-sw{position:relative;width:38px;height:22px;flex:none;cursor:pointer}
.mp-sw input{opacity:0;width:0;height:0;position:absolute}
.mp-sw span{position:absolute;inset:0;border-radius:999px;background:rgba(255,255,255,.14);transition:.18s}
.mp-sw span:before{content:"";position:absolute;width:16px;height:16px;left:3px;top:3px;border-radius:50%;background:#fff;transition:.18s;box-shadow:0 1px 3px rgba(0,0,0,.4)}
.mp-sw input:checked+span{background:var(--mp-accent)}
.mp-sw input:checked+span:before{transform:translateX(16px)}
.mp-sw.small{width:32px;height:18px}.mp-sw.small span:before{width:12px;height:12px}.mp-sw.small input:checked+span:before{transform:translateX(14px)}
.mp-btn{all:unset;cursor:pointer;display:inline-flex;align-items:center;gap:6px;padding:7px 12px;border-radius:10px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.1);font-size:12.5px;font-weight:600;color:var(--mp-fg)}
.mp-btn:hover{background:rgba(255,255,255,.14)}
.mp-btn.on{border-color:var(--mp-accent);color:#fff;background:color-mix(in srgb,var(--mp-accent) 25%,transparent)}
.mp-btn.pri{background:var(--mp-accent);border-color:transparent;color:#fff}
.mp-btn.pri:hover{filter:brightness(1.1)}
.mp-btn.bad{background:rgba(255,93,122,.2);border-color:rgba(255,93,122,.4)}
.mp-btn[disabled]{opacity:.45;pointer-events:none}
.mp-btns{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}
.mp-upslot{padding:10px}
.mp-rar{display:inline-block;font-size:10.5px;padding:0 6px;border-radius:6px;margin-left:4px;background:rgba(255,255,255,.1)}
.mp-rar.unique{background:#c9a21a33;color:#ffd75e}.mp-rar.heroic{background:#2f7bff33;color:#7fb2ff}.mp-rar.legendary{background:#ff7a1a33;color:#ffa45e}.mp-rar.upgraded{background:#c94cff33;color:#e19bff}.mp-rar.common{color:#ddd}
.mp-uphead{display:flex;align-items:center;gap:10px}
.mp-updrop{width:44px;height:44px;flex:none;border-radius:9px;border:1.5px dashed rgba(255,255,255,.35);display:flex;align-items:center;justify-content:center;cursor:pointer;color:var(--mp-accent);background:rgba(255,255,255,.04);transition:.15s}
.mp-updrop:hover{border-color:var(--mp-accent);background:rgba(255,255,255,.09)}
.mp-updrop.has{border-style:solid;border-color:rgba(255,255,255,.18)}
.mp-updrop img{max-width:36px;max-height:36px;image-rendering:pixelated}
.mp-uplab{font-size:11px;text-transform:uppercase;letter-spacing:.06em;opacity:.6;margin:10px 0 5px}
.mp-upchip{all:unset;cursor:pointer;font-size:12px;padding:3px 10px;border-radius:999px;border:1px solid rgba(255,255,255,.18);color:inherit;opacity:.75}
.mp-upchip:hover{opacity:1}
.mp-upchip.taken{opacity:.3;text-decoration:line-through;cursor:not-allowed}
.mp-upchip.on{background:var(--mp-accent);border-color:var(--mp-accent);color:#fff;opacity:1}
.mp-up-picking [class*="item-id-"]{cursor:crosshair!important;outline:1px dashed var(--mp-accent)}
.mp-chips{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.mp-chip{display:inline-flex;align-items:center;gap:6px;padding:3px 4px 3px 9px;border-radius:999px;background:rgba(255,255,255,.08);font-size:12px}
.mp-chip button{all:unset;cursor:pointer;width:18px;height:18px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:var(--mp-dim)}
.mp-chip button:hover{background:rgba(255,93,122,.3);color:#fff}
.mp-note{border-radius:12px;padding:10px 12px;margin-bottom:12px;display:flex;gap:10px;align-items:flex-start;font-size:12.5px}
.mp-note.warn{background:rgba(255,181,71,.10);border:1px solid rgba(255,181,71,.3);color:#ffe2b3}
.mp-note.bad{background:rgba(255,93,122,.10);border:1px solid rgba(255,93,122,.3);color:#ffd0d9}
.mp-note.info{background:rgba(124,92,255,.10);border:1px solid rgba(124,92,255,.3);color:#ddd5ff}
.mp-table{width:100%;border-collapse:collapse;font-size:12px}
.mp-table th{text-align:left;color:var(--mp-dim);font-weight:600;padding:5px 6px;border-bottom:1px solid var(--mp-line)}
.mp-table td{padding:5px 6px;border-bottom:1px solid rgba(255,255,255,.05);vertical-align:middle}
.mp-mono{font-family:Consolas,monospace;font-size:11.5px;word-break:break-all}
.mp-dim{color:var(--mp-dim)}
.mp-okc{color:var(--mp-ok)}.mp-badc{color:var(--mp-bad)}.mp-warnc{color:var(--mp-warn)}

/* motywy */
.mp-themes{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:8px;margin-top:4px}
.mp-theme{cursor:pointer;border-radius:12px;padding:8px;border:1px solid rgba(255,255,255,.1);display:flex;flex-direction:column;gap:6px}
.mp-theme:hover{border-color:rgba(255,255,255,.3)}
.mp-theme.on{box-shadow:0 0 0 2px var(--t-accent);border-color:transparent}
.mp-theme .sw{height:26px;border-radius:8px;display:flex;align-items:center;justify-content:flex-end;padding:0 6px}
.mp-theme .sw i{width:12px;height:12px;border-radius:50%;background:var(--t-accent);box-shadow:0 0 8px var(--t-accent)}
.mp-theme .nm{font-size:12px;font-weight:600}

/* Hey WakeUP! — podglądy stylów */
.mp-wk-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px}
.mp-wk-prev{cursor:pointer;border-radius:12px;border:1px solid rgba(255,255,255,.1);overflow:hidden;background:rgba(0,0,0,.2)}
.mp-wk-prev:hover{border-color:rgba(255,255,255,.3)}
.mp-wk-prev.on{border-color:var(--mp-accent);box-shadow:0 0 0 2px color-mix(in srgb,var(--mp-accent) 45%,transparent)}
.mp-wk-stage{height:62px;display:flex;align-items:center;justify-content:center;background:repeating-linear-gradient(45deg,#4a3f52 0 10px,#43394b 10px 20px);overflow:hidden;padding:0 4px}
.mp-wk-msg{white-space:nowrap;transform:scale(.62);transform-origin:center}
.mp-wk-msg.gra{color:#ffe500;font:700 24px/1.3 Arial,sans-serif;text-shadow:2px 0 0 #000,-2px 0 0 #000,0 2px 0 #000,0 -2px 0 #000,1px 1px 0 #000,-1px -1px 0 #000,1px -1px 0 #000,-1px 1px 0 #000}
.mp-wk-name{padding:5px 8px;font-size:12px;font-weight:600;text-align:center}

.mp-target{position:fixed;z-index:2147482995;display:flex;align-items:center;gap:7px;padding:5px 11px;border-radius:999px;cursor:pointer;font-size:12.5px;border:1px solid rgba(255,70,90,.6)!important;box-shadow:0 0 14px rgba(255,70,90,.35)!important;color:#fff}
.mp-target .mp-ico{color:#ff6b7f}

/* pasek skrótów — minimalistyczny */
#mp-qbar{position:fixed;z-index:2147482998;display:flex;flex-direction:column;align-items:center;gap:1px;padding:4px 3px;border-radius:12px;width:30px;background:rgba(10,11,18,.38)!important;-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);border:1px solid rgba(255,255,255,.07)!important;box-shadow:none!important;opacity:.75;transition:opacity .15s}
#mp-qbar:hover{opacity:1}
.mp-qhandle{width:100%;display:flex;justify-content:center;color:rgba(255,255,255,.3);cursor:move;padding:0 0 2px}
.mp-qhandle:hover{color:#fff}
.mp-qtile{position:relative;width:24px;height:24px;display:flex;align-items:center;justify-content:center;border-radius:7px;cursor:pointer;color:rgba(255,255,255,.88);transition:background .12s,color .12s}
.mp-qtile:hover{background:rgba(255,255,255,.12);color:#fff}
.mp-qtile.off{color:rgba(255,255,255,.28)}
.mp-qtile.sel{background:color-mix(in srgb,var(--mp-accent) 35%,transparent);color:#fff}
.mp-qdot{position:absolute;left:-2px;top:50%;width:3px;height:12px;margin-top:-6px;border-radius:2px;background:var(--mp-accent)}
.mp-qtile:hover::after{content:attr(data-name);position:absolute;right:calc(100% + 8px);top:50%;transform:translateY(-50%);white-space:nowrap;padding:3px 8px;border-radius:7px;background:rgba(10,11,18,.9);border:1px solid rgba(255,255,255,.1);font:500 11.5px/1.3 "Segoe UI",system-ui,sans-serif;color:#fff;pointer-events:none}
.mp-qmore{margin-top:2px;border-top:1px solid rgba(255,255,255,.08);border-radius:0;color:rgba(255,255,255,.5)}
#mp-qpop{position:fixed;z-index:2147482999;width:360px;max-height:78vh;border-radius:16px;display:flex;flex-direction:column;overflow:hidden;animation:mpIn .14s ease-out}
#mp-qpop .mp-head{cursor:default;padding:9px 10px;gap:8px}
.mp-qbody{overflow-y:auto;overflow-x:hidden;padding:10px 12px 12px;margin:0 3px 4px 0;overscroll-behavior:contain}
.mp-qbody .mp-card{padding:9px 11px}
.mp-qbody .mp-field{gap:8px}
.mp-qbody .mp-in.txt{width:150px}
.mp-qbody select.mp-in{max-width:175px}
.mp-qbody .mp-field .lb{min-width:0}

/* pływające okna */
.mp-win{position:fixed;z-index:2147482990;border-radius:16px;min-width:260px;display:flex;flex-direction:column;overflow:hidden}
.mp-win .mp-head{padding:9px 10px}
.mp-win .mp-wbody{padding:10px 12px;overflow:auto;max-height:60vh}

/* menu kontekstowe */
/* menu w stylu menu gry: ciemne tło, tytuł, zielone przyciski */
#mp-ctx{position:fixed;z-index:2147483100;min-width:180px;padding:4px;background:#2b2b2b;border:2px solid #5d5d5d;border-radius:4px;box-shadow:0 0 0 1px #000,0 6px 18px rgba(0,0,0,.6);font:12px/1.3 Arial,sans-serif;color:#eee;display:flex;flex-direction:column;gap:2px}
.mp-ctx-title{padding:6px 10px 7px;text-align:center;font-weight:700;font-size:12.5px;color:#fff;background:linear-gradient(#3a3a3a,#2a2a2a);border-bottom:1px solid #555;margin:-4px -4px 3px}
.mp-ctx-item{all:unset;display:block;box-sizing:border-box;text-align:center;padding:5px 12px;cursor:pointer;color:#fff;font:12px Arial,sans-serif;background:linear-gradient(#335e2a,#264a1f);border:1px solid #4f7e40;border-radius:2px;text-shadow:0 1px 1px #000}
.mp-ctx-item:hover{background:linear-gradient(#447a38,#2f5d27);border-color:#79b263}

/* powiadomienia — domyślnie jak komunikaty gry: żółty tekst na dole ekranu; Hey WakeUP! zmienia zmienne */
#mp-toasts{position:fixed;left:50%;bottom:var(--mp-toast-bottom,140px);transform:translateX(-50%);z-index:2147483200;display:flex;flex-direction:column-reverse;gap:2px;align-items:center;pointer-events:none;max-width:70vw}
.mp-toast{padding:var(--mp-toast-pad,1px 8px);border-radius:6px;background:var(--mp-toast-bg,transparent);color:var(--mp-toast-fg,#ffe066);font:var(--mp-toast-weight,700) var(--mp-toast-size,14px)/1.35 var(--mp-toast-font,Arial,"Segoe UI",sans-serif);border:var(--mp-toast-border,0 solid transparent);text-shadow:var(--mp-toast-shadow,0 0 3px #000,1px 1px 1px #000,-1px -1px 1px #000);opacity:0;transform:translateY(6px);transition:.25s;text-align:center}
.mp-toast.in{opacity:1;transform:none}
.mp-toast-warn{color:var(--mp-toast-warn,#ffb547)}.mp-toast-bad{color:var(--mp-toast-bad,#ff6b6b)}.mp-toast-ok{color:var(--mp-toast-ok,var(--mp-toast-fg,#ffe066))}

/* przewijanie i suwaki w stylu panelu */
.mp-glass ::-webkit-scrollbar,.mp-glass::-webkit-scrollbar{width:8px;height:8px}
.mp-glass ::-webkit-scrollbar-track,.mp-glass::-webkit-scrollbar-track{background:transparent;margin:10px 0}
.mp-glass ::-webkit-scrollbar-thumb,.mp-glass::-webkit-scrollbar-thumb{background:rgba(255,255,255,.16);border-radius:8px;border:2px solid transparent;background-clip:padding-box}
.mp-glass ::-webkit-scrollbar-thumb:hover{background-color:color-mix(in srgb,var(--mp-accent) 70%,transparent)}
.mp-glass ::-webkit-scrollbar-corner{background:transparent}
.mp-glass *{scrollbar-width:thin;scrollbar-color:rgba(255,255,255,.18) transparent}
.mp-range{-webkit-appearance:none;appearance:none;width:150px;height:22px;background:transparent;cursor:pointer;margin:0 6px;padding:0}
.mp-range::-webkit-slider-runnable-track{height:5px;border-radius:999px;background:linear-gradient(90deg,var(--mp-accent) var(--p,50%),rgba(255,255,255,.14) var(--p,50%))}
.mp-range::-webkit-slider-thumb{-webkit-appearance:none;width:16px;height:16px;margin-top:-5.5px;border-radius:50%;background:#fff;border:3px solid var(--mp-accent);box-shadow:0 2px 6px rgba(0,0,0,.4)}
.mp-range::-moz-range-track{height:5px;border-radius:999px;background:rgba(255,255,255,.14)}
.mp-range::-moz-range-progress{height:5px;border-radius:999px;background:var(--mp-accent)}
.mp-range::-moz-range-thumb{width:12px;height:12px;border-radius:50%;background:#fff;border:3px solid var(--mp-accent)}

/* okno do wpisywania (Podpisownik itd.) */
.mp-input-big{all:unset;box-sizing:border-box;width:100%;padding:10px 12px;border-radius:11px;background:rgba(0,0,0,.3);border:1px solid rgba(255,255,255,.14);color:var(--mp-fg);font-size:14px}
.mp-input-big:focus{border-color:var(--mp-accent);box-shadow:0 0 0 3px color-mix(in srgb,var(--mp-accent) 25%,transparent)}
.mp-sugg{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}
.mp-sugg button{all:unset;cursor:pointer;padding:4px 10px;border-radius:999px;background:rgba(255,255,255,.07);font-size:12px}
.mp-sugg button:hover{background:color-mix(in srgb,var(--mp-accent) 40%,transparent)}
.mp-itemhead{display:flex;align-items:center;gap:10px;margin-bottom:12px}
.mp-itemhead img{width:32px;height:32px;image-rendering:pixelated}

/* nakładki na przedmioty */
.mp-ibadge{position:absolute;pointer-events:none;z-index:5;font:700 9px/1 "Segoe UI",system-ui,sans-serif;padding:2px 3px;border-radius:4px;background:rgba(10,10,18,.82);color:#ffd36b;border:1px solid rgba(255,211,107,.45);text-shadow:0 1px 1px #000;white-space:nowrap}
.mp-ibadge.bon{top:-2px;right:-2px}
.mp-ibadge.sig{bottom:-3px;left:50%;transform:translateX(-50%);max-width:60px;overflow:hidden;text-overflow:ellipsis;color:#bfe3ff;border-color:rgba(120,190,255,.5)}
.mp-ibadge.chance.zero{color:#ff8b8b;border-color:rgba(255,93,122,.5)}
.mp-ibadge.chance{bottom:-14px;left:50%;transform:translateX(-50%);color:#9dffcf;border-color:rgba(61,220,151,.5);font-size:10px}
.mp-ibadge.queued{top:-3px;left:-3px;color:#fff;background:var(--mp-accent);border-color:rgba(0,0,0,.5);padding:1px;border-radius:50%;line-height:0}
.mp-ibadge.queued .mp-ico{display:block}

/* Pokaż EQ */
#mp-eqtip{position:fixed;z-index:2147483150;border-radius:14px;padding:10px;width:290px;pointer-events:none}
/* styl jak dymek gry: ciemne tło, szara ramka, wyśrodkowany nagłówek */
#mp-eqtip.gamey{background:rgba(12,12,12,.93)!important;-webkit-backdrop-filter:none;backdrop-filter:none;border:2px solid #5d5d5d!important;border-radius:3px;box-shadow:0 0 0 1px #000,0 4px 14px rgba(0,0,0,.6)!important;padding:6px 8px;font:12px/1.35 Arial,sans-serif;color:#e8e8e8;width:auto;min-width:200px}
#mp-eqtip.gamey .mp-eqhead{display:none}
.mp-eq-on .tip-wrapper:not(.mp-glass){clip-path:inset(0 0 100% 0)!important;background:transparent!important;border-color:transparent!important;box-shadow:none!important}
.mp-eq-on .tip-wrapper:not(.mp-glass) *{visibility:hidden!important}
#mp-eqtip .mp-clone{text-align:center;position:static!important;left:auto!important;top:auto!important;right:auto!important;bottom:auto!important;transform:none!important;border:0!important;box-shadow:none!important;background:transparent!important;margin:0 0 4px!important;padding:0!important;display:block!important;visibility:visible!important;opacity:1!important;clip-path:none!important;max-width:none!important;width:auto!important;pointer-events:none!important}
#mp-eqtip.gamey{max-width:360px;height:auto!important;max-height:92vh;overflow:hidden}
/* izolacja od stylów gry (gra ma własne klasy o podobnych nazwach) */
#mp-eqtip div{position:static;float:none;height:auto;min-height:0;background-image:none;transform:none}
#mp-eqtip .mp-eqlayout{position:relative!important}
#mp-eqtip .mp-eqlayout .mp-eqcell{position:absolute!important;height:34px!important}
#mp-eqtip .mp-ibadge{position:absolute!important;height:auto!important}
#mp-eqtip .mp-eqoutfit{background-repeat:no-repeat}
#mp-eqtip .mp-clone *{max-width:100%!important;position:static!important}
#mp-eqtip .mp-eqhead2{text-align:center;margin-bottom:4px;line-height:1.35}
#mp-eqtip .mp-eqhead2 .mp-eq-rank{color:#ff9a2e}
#mp-eqtip .mp-eqhead2 .mp-eq-loot{text-align:right;color:#f2c94c;font-size:11px}
#mp-eqtip .mp-eqhead2 .mp-eq-nick{border:1px solid #444;padding:1px 8px;font-weight:700}
#mp-eqtip .mp-eqhead2 .mp-eq-clan{color:#d9c27a;margin-top:2px}
#mp-eqtip .mp-eqbody{display:flex;align-items:center;justify-content:center;gap:10px;border-top:1px solid #3c3c3c;padding-top:6px}
#mp-eqtip .mp-eqoutfit{flex:none;background-repeat:no-repeat;image-rendering:pixelated}
#mp-eqtip .mp-eqmain{min-width:120px;display:flex;justify-content:center}
#mp-eqtip .mp-eqload{padding:18px 6px;text-align:center}
#mp-eqtip .mp-eqbons{margin-top:4px;display:flex;flex-wrap:wrap;gap:4px;justify-content:center}
#mp-eqtip.gamey .mp-eqgrid{grid-template-columns:repeat(6,36px);gap:3px;margin:2px 0 4px;justify-content:center}
#mp-eqtip.gamey .mp-eqcell{width:36px;height:36px;border-radius:2px;background:rgba(255,255,255,.04);border:1px solid #3c3c3c}
#mp-eqtip.gamey .mp-eqcell.legendary{border-color:#ff8a1c}
#mp-eqtip.gamey .mp-eqcell.heroic{border-color:#3fa2ff}
#mp-eqtip.gamey .mp-eqcell.unique{border-color:#e6c84a}
#mp-eqtip .mp-eqlayout{position:relative;margin:4px auto 6px}
#mp-eqtip .mp-eqlayout .mp-eqcell{position:absolute;width:34px;height:34px}
#mp-eqtip .mp-eqcell.mp-eqslot{background:rgba(255,255,255,.025)!important;border:1px dashed rgba(255,255,255,.07)!important;box-shadow:none!important}
#mp-eqtip.gamey .mp-eqsum{text-align:center;border-top:1px solid #3c3c3c;padding-top:3px}
#mp-eqtip.gamey .mp-chip{background:transparent;border:1px solid #444;border-radius:3px;font-size:11px}
.mp-eqgrid{display:grid;grid-template-columns:repeat(6,40px);gap:5px;margin:6px 0}
.mp-eqcell{width:40px;height:40px;border-radius:8px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.08);position:relative;display:flex;align-items:center;justify-content:center}
.mp-eqcell img{max-width:32px;max-height:32px;image-rendering:pixelated}
.mp-eqcell.legendary{border-color:#ff9a3c;box-shadow:inset 0 0 8px rgba(255,154,60,.45)}
.mp-eqcell.heroic{border-color:#3fa2ff}
.mp-eqcell.unique{border-color:#ffd84a}
.mp-eqcell.artefact{border-color:#ff4fd8}
.mp-eqcell .mp-ibadge{font-size:8px}

/* Kto tu jest */
.mp-plist{display:flex;flex-direction:column;gap:3px;min-width:330px}
.mp-prow{display:flex;align-items:center;gap:8px;padding:5px 7px;border-radius:9px;background:rgba(255,255,255,.03)}
.mp-prow:hover{background:rgba(255,255,255,.08)}
.mp-prow .n{flex:1;font-weight:600;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mp-prow .tag{font-size:10px;padding:1px 6px;border-radius:999px;background:rgba(255,255,255,.08);color:var(--mp-dim)}
.mp-prow .tag.cl{background:rgba(61,220,151,.15);color:var(--mp-ok)}
.mp-prow .tag.fr{background:rgba(63,162,255,.15);color:#8cc8ff}
.mp-prow .tag.al{background:rgba(124,92,255,.18);color:#c9bbff}
.mp-prow .tag.en{background:rgba(255,93,122,.15);color:var(--mp-bad)}
.mp-prow{cursor:pointer}
.mp-prow.open{background:color-mix(in srgb,var(--mp-accent) 22%,transparent)}
.mp-plist.mini{min-width:0}
.mp-plist.mini .mp-prow{padding:3px 6px;gap:6px}
.mp-pcard{margin:-1px 0 4px;padding:8px 9px;border-radius:0 0 10px 10px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.07);border-top:0}
.mp-pinfo{display:flex;flex-wrap:wrap;gap:4px 10px;font-size:11.5px;color:var(--mp-dim)}
.mp-pinfo .tag{font-size:10px;padding:1px 6px;border-radius:999px}
.mp-pinfo .tag.cl{background:rgba(61,220,151,.15);color:var(--mp-ok)}.mp-pinfo .tag.fr{background:rgba(63,162,255,.15);color:#8cc8ff}.mp-pinfo .tag.al{background:rgba(124,92,255,.18);color:#c9bbff}.mp-pinfo .tag.en{background:rgba(255,93,122,.15);color:var(--mp-bad)}
.mp-mini{all:unset;cursor:pointer;padding:3px 7px;border-radius:7px;background:rgba(255,255,255,.08);font-size:11px}
.mp-mini:hover{background:var(--mp-accent)}
.mp-filters{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:8px}
.mp-filters .mp-in{width:100%}
.mp-profs{display:flex;gap:4px;flex-wrap:wrap;grid-column:1/-1}
.mp-pf{all:unset;cursor:pointer;padding:3px 8px;border-radius:7px;background:rgba(255,255,255,.06);font-size:11.5px;color:var(--mp-dim)}
.mp-pf.on{background:color-mix(in srgb,var(--mp-accent) 40%,transparent);color:#fff}

/* potwierdzenia */
.mp-modal-bg{position:fixed;inset:0;z-index:2147483300;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center}
.mp-modal{border-radius:18px;padding:18px 20px;width:440px;max-width:94vw;max-height:84vh;display:flex;flex-direction:column}
.mp-modal h3{margin:0 0 8px;font-size:16px}
.mp-modal .mp-wbody{overflow:auto;margin:6px 0 12px}
`;

function injectCSS() {
  if (document.getElementById('mp-css')) return;
  const s = el('style', { id: 'mp-css' });
  s.textContent = CSS;
  document.head.appendChild(s);
}

MP.injectCSS = injectCSS;

// ═══ src/core/addons.js ═══
/* ───────────────────────── addons.js ─────────────────────────
 * Rejestr dodatków + pomocnicze okna (pływające okno, potwierdzenie).
 *
 * Definicja dodatku:
 *   defineAddon({
 *     id, name, icon, color: ['#a','#b'], desc,
 *     risk: 'safe' | 'auto' | 'destructive',
 *     defaults: { enabled, ... },
 *     settings: [ { key, type, label, hint, ... } ],   // typy: bool, number, text, color, select, key, list, textarea, custom
 *     keys:     [ { key: 'keyX', label: 'Opis', fn: () => {} } ],
 *     init(cfg), onToggle(on, cfg), render(container, cfg)
 *   })
 */
const addons = {
  list: [],
  byId: {},
  define(def) {
    def.risk = def.risk || 'safe';
    this.list.push(def);
    this.byId[def.id] = def;
    return def;
  },
  cfg(id) { return config.data.addons[id]; },
  on(id) { return !!(config.data.addons[id] && config.data.addons[id].enabled); },

  ORDER: ['napad', 'wakeup', 'bratan', 'ktotu', 'ktozlapie', 'cook', 'podpis', 'pokazeq', 'jakibon', 'taxi', 'autof', 'szybka', 'ulepszarka', 'minichat'],

  initAll() {
    this.list.sort((a, b) => this.ORDER.indexOf(a.id) - this.ORDER.indexOf(b.id));
    for (const a of this.list) {
      const cfg = config.addon(a.id, Object.assign({ enabled: false }, a.defaults));
      for (const k of a.keys || []) {
        keys.bind({ label: `${a.name}: ${k.label}`, get: () => (cfg.enabled ? cfg[k.key] || '' : ''), fn: k.fn });
      }
      try { a.init && a.init(cfg); } catch (e) { console.warn('[laddonz] init', a.id, e); }
      if (cfg.enabled) { try { a.onToggle && a.onToggle(true, cfg); } catch (e) { console.warn(e); } }
    }
    config.save();
  },

  setEnabled(id, on) {
    const a = this.byId[id];
    const cfg = this.cfg(id);
    cfg.enabled = !!on;
    config.save();
    try { a.onToggle && a.onToggle(!!on, cfg); } catch (e) { console.warn(e); }
    bus.emit('addon:toggle', id, on);
  },
};

const defineAddon = (d) => addons.define(d);

/* ───────── pływające, przeciągalne okno ───────── */
function floatWin({ id, title, iconName, color, x = 80, y = 120, width, onClose }) {
  const saved = store.get('win:' + id, null);
  let w = document.getElementById('mp-win-' + id);
  if (w) { w.style.display = 'flex'; return { win: w, body: w.querySelector('.mp-wbody'), existed: true }; }
  const body = el('div', { class: 'mp-wbody' });
  const close = el('button', { class: 'mp-x', title: 'Zamknij', onclick: () => { w.style.display = 'none'; onClose && onClose(); } }, icon('close', 16));
  const head = el('div', { class: 'mp-head' },
    el('div', { class: 'mp-tile', style: { width: '26px', height: '26px', borderRadius: '8px', background: grad(color) } }, icon(iconName, 15)),
    el('div', { class: 'mp-title', style: { fontSize: '13px' } }, title),
    el('div', { class: 'mp-sp' }), close);
  w = el('div', { id: 'mp-win-' + id, class: 'mp-win mp-glass', style: { left: (saved ? saved.x : x) + 'px', top: (saved ? saved.y : y) + 'px', width: width ? width + 'px' : null } }, head, body);
  document.body.appendChild(w);
  makeDraggable(w, head, (p) => store.set('win:' + id, p));
  return { win: w, body, existed: false, head };
}

function makeDraggable(node, handle, onEnd) {
  let sx, sy, ox, oy, drag = false, moved = false;
  handle.addEventListener('mousedown', (e) => {
    if (e.button !== 0 || e.target.closest('button,input,select,textarea')) return;
    drag = true; moved = false; sx = e.clientX; sy = e.clientY;
    const r = node.getBoundingClientRect(); ox = r.left; oy = r.top;
    e.preventDefault();
  });
  document.addEventListener('mousemove', (e) => {
    if (!drag) return;
    const dx = e.clientX - sx, dy = e.clientY - sy;
    if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
    node.style.left = clamp(ox + dx, 0, innerWidth - 40) + 'px';
    node.style.top = clamp(oy + dy, 0, innerHeight - 30) + 'px';
    node.style.right = 'auto'; node.style.bottom = 'auto';
  });
  document.addEventListener('mouseup', () => {
    if (!drag) return;
    drag = false;
    if (moved && onEnd) onEnd({ x: parseInt(node.style.left, 10), y: parseInt(node.style.top, 10) });
  });
  return () => moved;
}

/* ───────── okno potwierdzenia ───────── */
function confirmBox({ title, html, items, okText = 'Potwierdź', danger = false, countdown = 0 }) {
  return new Promise((resolve) => {
    const body = el('div', { class: 'mp-wbody' });
    if (html) body.appendChild(el('div', { html }));
    if (items && items.length) body.appendChild(el('ul', { style: { margin: '8px 0 0', paddingLeft: '18px' } }, items.map((t) => el('li', null, t))));
    const ok = el('button', { class: 'mp-btn ' + (danger ? 'bad' : 'pri') }, okText);
    const cancel = el('button', { class: 'mp-btn' }, 'Anuluj');
    const bg = el('div', { class: 'mp-modal-bg' }, el('div', { class: 'mp-modal mp-glass' }, el('h3', null, title), body, el('div', { class: 'mp-btns', style: { justifyContent: 'flex-end' } }, cancel, ok)));
    const done = (v) => { bg.remove(); resolve(v); };
    cancel.onclick = () => done(false);
    bg.addEventListener('mousedown', (e) => { if (e.target === bg) done(false); });
    ok.onclick = () => done(true);
    if (countdown > 0) {
      let n = countdown; ok.disabled = true; ok.textContent = `${okText} (${n})`;
      const iv = setInterval(() => { n--; if (n <= 0) { clearInterval(iv); ok.disabled = false; ok.textContent = okText; } else ok.textContent = `${okText} (${n})`; }, 1000);
    }
    document.body.appendChild(bg);
  });
}

/* ───────── ładne okno do wpisania tekstu (zamiast prompt()) ───────── */
function promptBox({ title, label, value = '', placeholder = '', suggestions = [], head = null, maxLength = 40, okText = 'Zapisz', allowClear = false }) {
  return new Promise((resolve) => {
    const inp = el('input', { class: 'mp-input-big', value, placeholder, maxlength: maxLength });
    const ok = el('button', { class: 'mp-btn pri' }, okText);
    const cancel = el('button', { class: 'mp-btn' }, 'Anuluj');
    const clear = allowClear && value ? el('button', { class: 'mp-btn bad', style: { marginRight: 'auto' } }, 'Usuń') : null;
    const sugg = suggestions.length ? el('div', { class: 'mp-sugg' }, suggestions.map((s) => el('button', { onclick: () => { inp.value = s; inp.focus(); } }, s))) : null;
    const bg = el('div', { class: 'mp-modal-bg' }, el('div', { class: 'mp-modal mp-glass', style: { width: '380px' } },
      el('h3', null, title), head, label ? el('div', { class: 'mp-dim', style: { margin: '0 0 6px' } }, label) : null, inp, sugg,
      el('div', { class: 'mp-btns', style: { justifyContent: 'flex-end', marginTop: '14px' } }, clear, cancel, ok)));
    const done = (v) => { bg.remove(); resolve(v); };
    ok.onclick = () => done(inp.value.trim());
    cancel.onclick = () => done(null);
    if (clear) clear.onclick = () => done('');
    bg.addEventListener('mousedown', (e) => { if (e.target === bg) done(null); });
    inp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') done(inp.value.trim()); if (e.key === 'Escape') done(null); });
    document.body.appendChild(bg);
    setTimeout(() => { inp.focus(); inp.select(); }, 30);
  });
}

function grad(c) {
  const [a, b] = Array.isArray(c) ? c : [c || '#7c5cff', c || '#5b8cff'];
  return `linear-gradient(135deg, ${a}, ${b})`;
}

MP.addons = addons;
MP.defineAddon = defineAddon;
MP.floatWin = floatWin;
MP.confirmBox = confirmBox;
MP.promptBox = promptBox;

// ═══ src/core/menus.js ═══
/* ───────────────────────── menus.js ─────────────────────────
 * Dodawanie własnych opcji do menu prawego przycisku myszy w grze:
 *   • na graczu:      „Dobij"
 *   • na przedmiocie: „Użyj po walce", „Podpisz…", „Cel ulepszania"
 *
 * Jak to działa: owijamy funkcję gry, która pokazuje menu (Engine.interface.showPopupMenu)
 * i dopisujemy pozycje. Żeby wiedzieć KOGO/CO kliknięto, zapamiętujemy ostatni cel kliknięcia.
 * Jeśli w Twojej wersji gry hak nie zadziała (Diagnostyka pokaże), zapasowo działa:
 *   Alt + prawy przycisk na przedmiocie → własne menu panelu.
 */
const menus = {
  providers: { player: [], item: [] },
  last: null,            // { type, id, t }
  hooked: false,
  otherHooked: false,

  add(type, fn) { this.providers[type].push(fn); },

  entriesFor(type, id) {
    const out = [];
    for (const p of this.providers[type]) {
      try { (p(id) || []).forEach((e) => e && out.push(e)); } catch (e) { console.warn(e); }
    }
    return out;
  },

  setLast(type, id) { this.last = { type, id: Number(id), t: now() }; },

  start() {
    // 1) prawy klik na przedmiocie w DOM (gra może otwierać menu już na mousedown — łapiemy oba)
    document.addEventListener('mousedown', (e) => {
      if (e.button !== 2) return;
      const it = e.target.closest && e.target.closest('.item[class*="item-id-"], [data-item-id]');
      const id = it && game.itemIdFromEl(it);
      if (id) { this.setLast('item', id); return; }
      const p = this.playerUnderTip(e.clientX, e.clientY);
      if (p) this.setLast('player', p.id);
    }, true);
    document.addEventListener('contextmenu', (e) => {
      if (this.silent) return;
      const it = e.target.closest && e.target.closest('.item[class*="item-id-"], [data-item-id]');
      if (it) {
        const id = game.itemIdFromEl(it);
        if (id) {
          this.setLast('item', id);
          // Alt + prawy klik = zawsze własne menu panelu (zapas, gdy hak menu gry nie działa)
          if (e.altKey) {
            const entries = this.entriesFor('item', id);
            if (entries.length) { e.preventDefault(); e.stopPropagation(); this.showOwn(e.clientX, e.clientY, entries, game.itemById(id)?.name); }
          }
        }
      }
    }, true);

    // 2) próba założenia haków (gra ładuje się asynchronicznie — ponawiamy)
    let n = 0;
    const tick = setInterval(() => {
      this.hookPopup();
      if (++n > 40) clearInterval(tick);
    }, 1500);
    this.hookOthers();
    setInterval(() => this.hookOthers(), 300);
    // gra buduje menu innego gracza tą funkcją — dostaje obiekt gracza
    const hookCreate = () => {
      try {
        const O = E().others;
        if (!O || typeof O.createOtherContextMenu !== 'function' || O.createOtherContextMenu.__mp) return;
        const f = O.createOtherContextMenu, self = this;
        O.createOtherContextMenu = function (...a) {
          try { for (const x of a) { const id = x && (x.d ? x.d.id : (typeof x === 'number' || /^\d+$/.test(x) ? x : null)); if (id) { self.setLast('player', id); break; } } } catch {}
          return f.apply(this, a);
        };
        O.createOtherContextMenu.__mp = true;
      } catch {}
    };
    hookCreate(); setInterval(hookCreate, 3000);
    this.domFallback();
  },

  /** Owijamy każdą funkcję Engine.interface z „menu"/„popup" w nazwie, która dostaje tablicę pozycji. */
  hookPopup() {
    const I = E() && E().interface;
    if (!I) return;
    const self = this;
    const names = new Set();
    for (let o = I; o && o !== Object.prototype; o = Object.getPrototypeOf(o)) Object.getOwnPropertyNames(o).forEach((n) => names.add(n));
    // NI: Engine.interface.showPopupMenu([[tekst, funkcja], …], …) — sprawdzone diagnostyką
    const list = names.has('showPopupMenu') ? ['showPopupMenu'] : [...names].filter((n) => /^show.*(menu|popup)/i.test(n));
    for (const n of list) {
      let f; try { f = I[n]; } catch { continue; }
      if (typeof f !== 'function' || f.__mpMenu) continue;
      const w = function (...args) {
        try {
          const menu = args.find((a) => Array.isArray(a) && a.length && a.every((m) => Array.isArray(m) || (m && typeof m === 'object')));
          // tryb „przechwycenia": panel prosi grę o menu przedmiotu, żeby wybrać z niego opcję (np. „Użyj") — menu się nie pokazuje
          if (menu && self.capturing) { const r = self.capturing; self.capturing = null; r(menu); return; }
          if (menu) self.inject(menu, args);
        } catch (e) { console.warn('[laddonz] menu', e); }
        return f.apply(this, args);
      };
      w.__mpMenu = true;
      try { I[n] = w; this.hooked = true; this.hookName = n; } catch {}
    }
  },

  inject(menu, args = []) {
    // 1) nick w argumentach menu (tytuł menu to nick gracza) — najpewniejsze
    let tgt = this.playerFromArgs(args);
    // 2) ostatni cel kliknięcia (hak gracza / dymek pod kursorem)
    if (!tgt && this.last && now() - this.last.t < 1500) tgt = this.last;
    if (!tgt) tgt = this.guessPlayerFromMenu(menu);
    if (!tgt) return;
    const add = this.entriesFor(tgt.type, tgt.id);
    add.forEach((x) => menu.push(this.toGameEntry(menu, x)));
    if (add.length) this.lastInject = now();
  },
  lastInject: 0,
  capturing: null,

  /** Etykieta i akcja pozycji menu gry (format [tekst, fn] albo obiekt). */
  entryParts(m) {
    if (Array.isArray(m)) return { label: String(m[0] || ''), fn: m.find((x) => typeof x === 'function') };
    if (m && typeof m === 'object') {
      const label = m.text || m.label || m.name || m.txt || '';
      const fn = ['callback', 'fn', 'action', 'onclick', 'click'].map((k) => m[k]).find((x) => typeof x === 'function');
      return { label: String(label), fn };
    }
    return { label: '', fn: null };
  },

  /** To samo dla gracza na mapie: menu gracza (jak prawy klik na nim) → opcja, bez pokazywania menu. */
  async choosePlayerOption(id, re) {
    const raw = game.otherRaw(id);
    if (!raw || !this.hooked) return false;
    const fn = ['oncontextmenu', 'createMenu'].map((n) => raw[n]).find((f) => typeof f === 'function');
    if (!fn) return false;
    const got = new Promise((res) => { this.capturing = res; setTimeout(() => { if (this.capturing === res) { this.capturing = null; res(null); } }, 400); });
    const ev = { clientX: 0, clientY: 0, pageX: 0, pageY: 0, button: 2, preventDefault() {}, stopPropagation() {}, stopImmediatePropagation() {}, target: document.body };
    try { fn.call(raw, ev); } catch { this.capturing = null; return false; }
    const menu = await got;
    if (!menu) return false;
    for (const m of menu) {
      const { label, fn: f } = this.entryParts(m);
      if (f && re.test(label.trim())) { f(); return true; }
    }
    return false;
  },

  /**
   * Wybiera opcję z menu przedmiotu tak, jak zrobiłby to gracz (prawy klik → opcja), bez pokazywania menu.
   * Zwraca true, jeśli opcja została wywołana.
   */
  async chooseItemOption(node, re) {
    if (!node || !this.hooked) return false;
    const got = new Promise((res) => { this.capturing = res; setTimeout(() => { if (this.capturing === res) { this.capturing = null; res(null); } }, 400); });
    const r = node.getBoundingClientRect();
    const opt = { bubbles: true, cancelable: true, view: W, button: 2, buttons: 2, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
    this.silent = true;
    try {
      node.dispatchEvent(new MouseEvent('mousedown', opt));
      node.dispatchEvent(new MouseEvent('mouseup', opt));
      node.dispatchEvent(new MouseEvent('contextmenu', opt));
    } finally { this.silent = false; }
    const menu = await got;
    if (!menu) return false;
    for (const m of menu) {
      const { label, fn } = this.entryParts(m);
      if (fn && re.test(label.trim())) { fn(); return true; }
    }
    return false;
  },

  playerFromArgs(args) {
    const strs = [];
    const walk = (v, d) => {
      if (d > 2 || v == null) return;
      if (typeof v === 'string') strs.push(v.toLowerCase());
      else if (typeof v === 'object' && !Array.isArray(v) && !(v instanceof Node)) {
        if (v.d && v.d.id && v.d.nick) { strs.push('#id:' + v.d.id); return; }
        for (const k of ['title', 'name', 'nick', 'header', 'txt', 'text']) if (typeof v[k] === 'string') strs.push(v[k].toLowerCase());
      }
    };
    args.filter((a) => !Array.isArray(a)).forEach((a) => walk(a, 0));
    for (const s of strs) {
      if (s.startsWith('#id:')) return { type: 'player', id: Number(s.slice(4)) };
      const t = s.replace(/<[^>]+>/g, '').trim();
      const p = game.others().find((o) => o.nick && o.nick.toLowerCase() === t);
      if (p) return { type: 'player', id: p.id };
    }
    return null;
  },

  /** Prawy klik na mapie: gracz z dymka gry tuż przy kursorze. */
  playerUnderTip(x, y) {
    for (const n of $$('.tip-wrapper')) {
      if (n.closest('#mp-eqtip') || !isVisible(n)) continue;
      const r = n.getBoundingClientRect();
      const dx = Math.max(r.left - x, 0, x - r.right), dy = Math.max(r.top - y, 0, y - r.bottom);
      if (Math.hypot(dx, dy) > 90) continue;
      const txt = (n.textContent || '').toLowerCase();
      const p = game.others().filter((o) => o.nick && txt.includes(o.nick.toLowerCase())).sort((a, b) => b.nick.length - a.nick.length)[0];
      if (p) return p;
    }
    return null;
  },

  /**
   * Zapas: gdy gra rysuje menu w DOM bez funkcji, którą da się owinąć — dopisujemy pozycje do gotowego menu.
   * Gracz rozpoznawany po nicku w treści menu.
   */
  domFallback() {
    let armed = 0;
    const arm = () => { armed = now(); };
    document.addEventListener('contextmenu', arm, true);
    document.addEventListener('mousedown', (e) => { if (e.button === 2) arm(); }, true);
    new MutationObserver(debounce(() => {
      if (!armed || now() - armed > 1500 || now() - this.lastInject < 1500) return;
      const sel = (config.data.global.menuSelector || '').split('\n').map((x) => x.trim()).filter(Boolean).join(',');
      if (!sel) return;
      const m = $$(sel).filter((n) => isVisible(n) && !n.closest('#mp-ctx') && !n.dataset.mpDone).pop();
      if (!m) return;
      const txt = (m.textContent || '').toLowerCase();
      const p = game.others().find((o) => o.nick && txt.includes(o.nick.toLowerCase()));
      if (!p) return;
      const entries = this.entriesFor('player', p.id);
      if (!entries.length) return;
      m.dataset.mpDone = '1';
      const items = Array.from(m.children).filter((c) => (c.textContent || '').trim());
      const tpl = items[items.length - 1];
      for (const x of entries) {
        let n;
        if (tpl) { n = tpl.cloneNode(true); n.removeAttribute('id'); n.textContent = x.label; }
        else n = el('div', { style: { padding: '3px 8px', cursor: 'pointer' } }, x.label);
        n.addEventListener('click', (ev) => { ev.stopPropagation(); m.style.display = 'none'; x.fn(); }, true);
        m.appendChild(n);
      }
      armed = 0;
    }, 30)).observe(document.body, { childList: true, subtree: true });
  },

  /** Format pozycji menu w grze: najczęściej [tekst, funkcja]; obsługujemy też obiekty. */
  toGameEntry(menu, x) {
    const sample = menu.find(Boolean);
    if (sample && !Array.isArray(sample) && typeof sample === 'object') {
      const o = {};
      const tk = ['text', 'label', 'name', 'txt'].find((k) => k in sample) || 'text';
      const fk = ['callback', 'fn', 'action', 'onclick', 'click'].find((k) => k in sample) || 'callback';
      o[tk] = x.label; o[fk] = x.fn;
      return o;
    }
    return [x.label, x.fn];
  },

  /** Gdy nie znamy celu: jeśli któraś pozycja menu zawiera nick gracza z mapy — to on. */
  guessPlayerFromMenu(menu) {
    const labels = menu.map((m) => (Array.isArray(m) ? m[0] : m && (m.text || m.label || m.name)) || '').map(String);
    const txt = labels.join(' | ').toLowerCase();
    const p = game.others().find((o) => o.nick && txt.includes(o.nick.toLowerCase()));
    return p ? { type: 'player', id: p.id } : null;
  },

  /**
   * W NI metody gracza (oncontextmenu, createMenu, onhover…) są przypięte do KAŻDEGO gracza osobno,
   * więc owijamy je na każdym obiekcie gracza (nowi gracze dochodzą — sprawdzamy co sekundę).
   */
  hookOthers() {
    try {
      const o = E().others;
      const src = typeof o.check === 'function' ? o.check() : {};
      const arr = Array.isArray(src) ? src : Object.values(src || {});
      for (const raw of arr) this.wrapOther(raw);
      // gdyby metody jednak były w prototypie
      const proto = arr[0] && Object.getPrototypeOf(arr[0]);
      if (proto && !proto.__mpMenu) { proto.__mpMenu = true; this.wrapOther(proto, true); }
    } catch {}
  },

  wrapOther(raw, isProto) {
    if (!raw || raw.__mpWrapped) return;
    raw.__mpWrapped = true;
    const self = this;
    const names = isProto ? Object.getOwnPropertyNames(raw) : Object.keys(raw);
    for (const name of names) {
      const isMenu = /^(oncontextmenu|createMenu|createBasicMenu)$/i.test(name);
      const isHover = /^(onhover|onmousemove|tip|tipUpdate)$/i.test(name);
      if (!isMenu && !isHover) continue;
      let f; try { f = raw[name]; } catch { continue; }
      if (typeof f !== 'function' || f.__mp) continue;
      const w = function (...a) {
        try {
          const d = this && this.d ? this.d : raw.d;
          const id = d && Number(d.id);
          if (id) {
            if (isMenu) self.setLast('player', id);
            if (isHover && !(self.hover && self.hover.id === id && now() - self.hover.t < 250)) {
              self.hover = { id, t: now() };
              bus.emit('player:hover', id);
            }
          }
        } catch {}
        return f.apply(this, a);
      };
      w.__mp = true;
      try { raw[name] = w; } catch {}
      if (isMenu) this.otherHooked = true;
      if (isHover) this.hoverHooked = true;
    }
  },

  /** Własne, szklane menu panelu. */
  showOwn(x, y, entries, title) {
    $('#mp-ctx')?.remove();
    const m = el('div', { id: 'mp-ctx' },
      title ? el('div', { class: 'mp-ctx-title' }, title) : null,
      entries.map((e) => el('button', { class: 'mp-ctx-item', onclick: () => { m.remove(); e.fn(); } }, e.label)));
    m.style.left = '-9999px'; m.style.top = '0px';
    document.body.appendChild(m);
    // zawsze w całości na ekranie (np. ikona grupy w prawym górnym rogu)
    const w = m.offsetWidth, h = m.offsetHeight;
    m.style.left = clamp(x + w > innerWidth - 6 ? x - w : x, 6, innerWidth - w - 6) + 'px';
    m.style.top = clamp(y + h > innerHeight - 6 ? y - h : y, 6, innerHeight - h - 6) + 'px';
    const close = (ev) => { if (!m.contains(ev.target)) { m.remove(); document.removeEventListener('mousedown', close, true); } };
    setTimeout(() => document.addEventListener('mousedown', close, true), 0);
  },
};

MP.menus = menus;

// ═══ src/core/ui.js ═══
/* ───────────────────────── ui.js ─────────────────────────
 * Panel konfiguracyjny: przycisk startowy + okno z zakładkami
 *   Dodatki · Diagnostyka · Log · Ogólne
 */
const ui = {
  panel: null,
  tab: 'addons',
  sel: null,
  filter: '',

  start() {
    this.applyTheme();
    this.fixWheel();
    this.launcher();
    keys.bind({ label: 'Panel: otwórz/zamknij', get: () => config.data.global.panelKey || '', fn: () => this.toggle() });
    bus.on('log', debounce(() => { if (this.panel && this.tab === 'log') this.renderMain(); }, 300));
    bus.on('sniff', debounce(() => { if (this.panel && this.tab === 'diag') this.renderMain(); }, 300));
  },

  /**
   * Gra przechwytuje kółko myszy (zoom mapy), więc w naszych oknach przewijamy ręcznie
   * i nie przepuszczamy zdarzenia do gry.
   */
  fixWheel() {
    window.addEventListener('wheel', (e) => {
      const root = e.target && e.target.closest && e.target.closest('.mp-glass');
      if (!root) return;
      let n = e.target;
      while (n && n !== root.parentNode) {
        if (n.nodeType === 1) {
          const cs = getComputedStyle(n);
          if (/(auto|scroll)/.test(cs.overflowY) && n.scrollHeight > n.clientHeight + 1) break;
        }
        n = n.parentNode;
      }
      e.stopImmediatePropagation();
      if (n && n !== root.parentNode && n.nodeType === 1) {
        e.preventDefault();
        n.scrollTop += e.deltaMode === 1 ? e.deltaY * 32 : e.deltaY;
      }
    }, { capture: true, passive: false });
  },

  THEMES: {
    fiolet:   { name: 'Fiolet (domyślny)', accent: '#7c5cff', bg: '16,17,28' },
    ocean:    { name: 'Ocean',             accent: '#3fa2ff', bg: '10,20,34' },
    szmaragd: { name: 'Szmaragd',          accent: '#2ecc8f', bg: '10,26,22' },
    rubin:    { name: 'Rubin',             accent: '#ff4d6d', bg: '30,12,18' },
    bursztyn: { name: 'Bursztyn',          accent: '#ffb020', bg: '28,20,8' },
    roz:      { name: 'Róż',               accent: '#ff6ec7', bg: '28,12,26' },
    grafit:   { name: 'Grafit',            accent: '#a3adbd', bg: '18,18,20' },
    noc:      { name: 'Północ',            accent: '#6d8bff', bg: '6,8,16' },
  },

  applyTheme() {
    const g = config.data.global;
    const t = this.THEMES[g.theme] || this.THEMES.fiolet;
    g.accent = t.accent;
    document.documentElement.style.setProperty('--mp-bg', t.bg);
    document.documentElement.style.setProperty('--mp-accent', t.accent);
    document.documentElement.style.setProperty('--mp-glass', String(g.glass ?? 0.55));
  },

  launcher() {
    const p = config.data.global.launcher || { x: 16, y: 120 };
    const b = el('div', { id: 'mp-launcher', class: 'mp-glass', title: `laddonz (${config.data.global.panelKey || 'brak skrótu'})`, style: { left: p.x + 'px', top: p.y + 'px' } }, icon('logo', 24));
    document.body.appendChild(b);
    const moved = makeDraggable(b, b, (pos) => { config.data.global.launcher = pos; config.save(); });
    b.addEventListener('click', () => { if (!moved()) this.toggle(); });
  },

  toggle() { if (this.panel) this.close(); else this.open(); },
  close() { this.panel?.remove(); this.panel = null; },

  open(addonId) {
    if (addonId) { this.sel = addonId; this.tab = 'addons'; }
    if (this.panel) { this.renderAll(); return; }
    const pos = config.data.global.panelPos;
    this.panel = el('div', { id: 'mp-panel', class: 'mp-glass', style: pos ? { left: pos.x + 'px', top: pos.y + 'px' } : { left: '50%', top: '50%', transform: 'translate(-50%,-50%)' } });
    document.body.appendChild(this.panel);
    this.renderAll();
  },

  renderAll() {
    const P = this.panel;
    P.innerHTML = '';
    const tabs = [['addons', 'grid', 'Dodatki'], ['diag', 'diag', 'Diagnostyka'], ['log', 'log', 'Log'], ['general', 'gear', 'Ogólne']];
    const head = el('div', { class: 'mp-head' },
      el('div', { class: 'mp-tile', style: { background: grad([config.data.global.accent, '#3fa2ff']) } }, icon('logo', 18)),
      el('div', null, el('div', { class: 'mp-title' }, 'laddonz'), el('div', { class: 'mp-sub' }, this.subtitle())),
      el('div', { class: 'mp-sp' }),
      el('div', { class: 'mp-tabs' }, tabs.map(([id, ic, lb]) => el('button', { class: 'mp-tab' + (this.tab === id ? ' on' : ''), onclick: () => { this.tab = id; this.renderAll(); } }, icon(ic, 15), lb))),
      el('button', { class: 'mp-x', title: 'Zamknij', onclick: () => this.close() }, icon('close', 18)));
    makeDraggable(P, head, (p) => { config.data.global.panelPos = p; config.save(); P.style.transform = 'none'; });
    head.addEventListener('mousedown', () => {
      if (P.style.transform && P.style.transform !== 'none') {
        const r = P.getBoundingClientRect(); P.style.transform = 'none'; P.style.left = r.left + 'px'; P.style.top = r.top + 'px';
      }
    }, true);
    const body = el('div', { class: 'mp-body' });
    if (this.tab === 'addons') body.appendChild(this.side());
    this.main = el('div', { class: 'mp-main' });
    body.appendChild(this.main);
    P.append(head, body);
    this.renderMain();
  },

  subtitle() {
    const h = game.hero();
    const g = config.data.global;
    const parts = [`v${MP.version}`, h ? `${h.nick} (${h.lvl})` : 'gra nie wykryta'];
    if (g.dryRun) parts.push('TRYB PRÓBNY');
    return parts.join(' · ');
  },

  side() {
    const list = el('div', { class: 'mp-list' });
    const draw = () => {
      list.innerHTML = '';
      const f = this.filter.toLowerCase();
      for (const a of addons.list) {
        if (f && !(a.name + ' ' + a.desc).toLowerCase().includes(f)) continue;
        const cfg = addons.cfg(a.id);
        const sw = switchEl(cfg.enabled, (v) => this.toggleAddon(a, v, sw), true);
        const row = el('div', { class: 'mp-row' + (this.sel === a.id ? ' sel' : '') + (cfg.enabled ? '' : ' off'), onclick: (e) => { if (e.target.closest('.mp-sw')) return; this.sel = a.id; draw(); this.renderMain(); } },
          el('div', { class: 'mp-tile', style: { background: grad(a.color) } }, icon(a.icon, 18)),
          el('div', { class: 'nm' }, a.name),
          a.risk === 'auto' ? el('span', { class: 'mp-badge auto', title: 'Zawiera automatyzację' }, 'A') : null,
          a.risk === 'destructive' ? el('span', { class: 'mp-badge destr', title: 'Może usuwać/zużywać przedmioty' }, '!') : null,
          sw);
        list.appendChild(row);
      }
    };
    if (!this.sel) this.sel = addons.list[0]?.id;
    draw();
    this._drawSide = draw;
    const inp = el('input', { placeholder: 'Szukaj dodatku…', value: this.filter, oninput: (e) => { this.filter = e.target.value; draw(); } });
    return el('div', { class: 'mp-side' }, el('label', { class: 'mp-search' }, icon('search', 15), inp), list);
  },

  async toggleAddon(a, v, sw) {
    const resetSw = () => { if (sw && sw.querySelector) sw.querySelector('input').checked = !v; };
    if (v && a.risk === 'destructive' && !addons.cfg(a.id)._ack) {
      const ok = await confirmBox({
        title: `Włączyć „${a.name}"?`, danger: true, okText: 'Rozumiem, włącz', countdown: 3,
        html: 'Ten dodatek może <b>usuwać lub zużywać przedmioty</b>. Komendy niszczące są zablokowane, dopóki nie zweryfikujesz ich w zakładce <b>Diagnostyka</b>, a przed każdą operacją zobaczysz listę przedmiotów do potwierdzenia.',
      });
      if (!ok) { resetSw(); return false; }
      addons.cfg(a.id)._ack = true;
    }
    addons.setEnabled(a.id, v);
    if (this.panel) { this._drawSide && this._drawSide(); if (this.sel === a.id && this.tab === 'addons') this.renderMain(); }
    bus.emit('quickbar');
    return true;
  },

  renderMain() {
    if (!this.main) return;
    const st = this.main.scrollTop;
    this.main.innerHTML = '';
    if (this.tab === 'addons') this.renderAddon();
    else if (this.tab === 'diag') this.renderDiag();
    else if (this.tab === 'log') this.renderLog();
    else this.renderGeneral();
    this.main.scrollTop = st;
  },

  /* ───── zakładka: dodatek ───── */
  renderAddon(M = this.main, id = this.sel, rerender = () => this.renderMain(), compact = false) {
    const a = addons.byId[id];
    if (!a) return;
    const cfg = addons.cfg(a.id);
    if (!compact) {
      M.appendChild(el('div', { class: 'mp-h' },
        el('div', { class: 'mp-tile', style: { background: grad(a.color) } }, icon(a.icon, 26)),
        el('div', { style: { flex: 1 } },
          el('h2', null, a.name, ' ',
            a.risk === 'auto' ? el('span', { class: 'mp-badge auto' }, icon('warn', 11), 'automat') : null,
            a.risk === 'destructive' ? el('span', { class: 'mp-badge destr' }, icon('warn', 11), 'usuwa/zużywa') : null),
          el('div', { class: 'mp-dim' }, cfg.enabled ? 'Włączony' : 'Wyłączony')),
        cfg.enabled ? el('button', { class: 'mp-btn' + (quickbar.isPinned(a.id) ? ' on' : ''), title: 'Ikonka na pasku skrótów po prawej', onclick: () => { const on = quickbar.togglePin(a.id); toast(`${a.name}: ${on ? 'dodano do skrótów' : 'usunięto ze skrótów'}`); rerender(); } },
          icon('pin', 14), quickbar.isPinned(a.id) ? 'W skrótach' : 'Dodaj do skrótów') : null,
        switchEl(cfg.enabled, (v) => this.toggleAddon(a, v, M.querySelector('.mp-h .mp-sw')))));
      M.appendChild(el('p', { class: 'mp-desc' }, a.desc));
    }
    if (a.notes) a.notes(cfg).forEach((n) => n && M.appendChild(note(n.type, n.text)));
    let renderBox = null;
    if (a.render && a.renderFirst) { renderBox = el('div'); M.appendChild(renderBox); }
    if (a.settings && a.settings.length) {
      const groups = {};
      for (const s of a.settings) (groups[s.group || 'Ustawienia'] = groups[s.group || 'Ustawienia'] || []).push(s);
      for (const [g, arr] of Object.entries(groups)) {
        const card = el('div', { class: 'mp-card' }, el('h3', null, g));
        arr.forEach((s) => { if (!s.show || s.show(cfg)) card.appendChild(field(s, cfg, () => { config.save(); a.onChange && a.onChange(s.key, cfg); if (s.rerender) rerender(); })); });
        M.appendChild(card);
      }
    }
    if (a.render) {
      const box = renderBox || el('div');
      if (!renderBox) M.appendChild(box);
      try { a.render(box, cfg, rerender); } catch (e) { box.appendChild(note('bad', 'Błąd widoku: ' + e.message)); }
    }
  },

  /* ───── zakładka: diagnostyka ───── */
  renderDiag() {
    const M = this.main;
    const ok = (b) => el('span', { class: b ? 'mp-okc' : 'mp-badc' }, b ? '✔' : '✘');
    const E0 = W.Engine;
    const checks = [
      ['Obiekt gry Engine', !!E0],
      ['Funkcja wysyłania _g', typeof W._g === 'function'],
      ['Wysyłanie komend (window._g)', !!net.origG],
      ['Komendy gry przechwycone (naciśnij X na graczu)', net.stats.gameCalls > 0],
      ['Bohater (Engine.hero)', !!game.hero()],
      ['Lista graczy (Engine.others)', !!(E0 && E0.others)],
      ['Przedmioty (Engine.items)', game.heroItems().length > 0],
      ['Odpowiedzi serwera (hak: ' + (net.respHook || 'brak') + ')', !!net.respHook],
      ['Menu prawego przycisku (' + (menus.hookName || 'brak funkcji') + ')', menus.hooked],
      ['Najechanie na gracza (prototyp Other)', !!menus.hoverHooked],
      ['Cel menu na graczu (prototyp Other)', menus.otherHooked],
    ];
    M.appendChild(el('div', { class: 'mp-card' }, el('h3', null, 'Punkty zaczepienia'),
      el('table', { class: 'mp-table' }, el('tbody', null, checks.map(([n, b]) => el('tr', null, el('td', null, n), el('td', { style: { width: '30px' } }, ok(b))))))),
    );
    M.appendChild(el('div', { class: 'mp-card' }, el('h3', null, 'Statystyki'),
      el('div', { class: 'mp-dim' }, `Komendy gry: ${net.stats.gameCalls} · komendy panelu: ${net.stats.ourCalls} · zablokowane: ${net.stats.blocked} · odpowiedzi: ${net.stats.responses} · graczy na mapie: ${game.others().length} · przedmiotów: ${game.heroItems().length}`)));

    // szablony komend
    M.appendChild(note('info', 'Komendy oznaczone „do ustawienia" panel zna dopiero, gdy podejrzy je w grze. Wykonaj daną akcję RĘCZNIE w grze, a potem w sekcji „Podsłuch" przypisz ją do właściwej komendy. Komendy usuwania i ulepszania pozostają zablokowane, dopóki tego nie zrobisz — tak żeby panel nigdy nie wysłał czegoś, czego nie widziałeś na własne oczy.'));
    const cmdCard = el('div', { class: 'mp-card' }, el('h3', null, 'Komendy'));
    const tb = el('tbody');
    for (const name of Object.keys(DEFAULT_COMMANDS)) {
      const c = net.cmd(name);
      const status = !c.t ? el('span', { class: 'mp-badge lock' }, 'do ustawienia')
        : c.verified ? el('span', { class: 'mp-badge ok' }, 'zweryfikowana')
        : c.destructive ? el('span', { class: 'mp-badge destr' }, 'zablokowana') : el('span', { class: 'mp-badge auto' }, 'domyślna');
      const inp = el('input', { class: 'mp-in mp-mono', style: { width: '100%' }, value: c.t || '', placeholder: '(pusta)' });
      const save = el('button', { class: 'mp-mini', onclick: () => { net.setCmd(name, inp.value.trim(), !!inp.value.trim()); toast('Zapisano komendę: ' + c.label, 'ok'); this.renderMain(); } }, 'Zapisz');
      tb.appendChild(el('tr', null,
        el('td', { style: { width: '150px' } }, el('b', null, c.label), el('div', { class: 'mp-dim', style: { fontSize: '11px' } }, c.how)),
        el('td', null, inp), el('td', { style: { width: '110px' } }, status), el('td', { style: { width: '60px' } }, save)));
    }
    cmdCard.appendChild(el('table', { class: 'mp-table' }, el('thead', null, el('tr', null, el('th', null, 'Akcja'), el('th', null, 'Szablon'), el('th', null, 'Status'), el('th'))), tb));
    M.appendChild(cmdCard);

    // podsłuch
    const sn = el('div', { class: 'mp-card' }, el('h3', null, 'Podsłuch — ostatnie komendy wysłane przez grę'));
    sn.appendChild(el('div', { class: 'mp-field' }, el('div', { class: 'lb' }, 'Nasłuch włączony', el('small', null, 'Zapamiętuje tylko 40 ostatnich komend, nic nigdzie nie wysyła.')),
      switchEl(net.sniffing, (v) => { net.sniffing = v; })));
    if (!net.sniff.length) sn.appendChild(el('div', { class: 'mp-dim', style: { padding: '8px 0' } }, 'Brak — wykonaj jakąś akcję w grze.'));
    const sb = el('tbody');
    net.sniff.slice(0, 25).forEach((s) => {
      const sel = el('select', { class: 'mp-in' }, el('option', { value: '' }, 'Przypisz do…'), Object.keys(DEFAULT_COMMANDS).map((n) => el('option', { value: n }, DEFAULT_COMMANDS[n].label)));
      sel.onchange = async () => {
        const name = sel.value; if (!name) return;
        const tpl = templatize(name, s.task);
        const yes = await confirmBox({ title: 'Przypisać komendę?', okText: 'Zapisz', html: `<div>Akcja: <b>${esc(DEFAULT_COMMANDS[name].label)}</b></div><div style="margin-top:8px">Podsłuchane:</div><div class="mp-mono">${esc(s.task)}</div><div style="margin-top:8px">Szablon (zmienne w nawiasach):</div><div class="mp-mono mp-okc">${esc(tpl)}</div><div class="mp-dim" style="margin-top:8px">Jeśli szablon jest zły, popraw go ręcznie w tabeli „Komendy".</div>` });
        if (yes) { net.setCmd(name, tpl, true); toast('Komenda zweryfikowana', 'ok'); this.renderMain(); } else sel.value = '';
      };
      sb.appendChild(el('tr', null, el('td', { class: 'mp-dim', style: { width: '62px' } }, new Date(s.t).toLocaleTimeString()), el('td', { class: 'mp-mono' }, s.task, el('div', { class: 'mp-dim' }, s.via || '')), el('td', { style: { width: '160px' } }, sel)));
    });
    sn.appendChild(el('table', { class: 'mp-table' }, sb));
    M.appendChild(sn);
  },

  /* ───── zakładka: log ───── */
  renderLog() {
    const M = this.main;
    M.appendChild(note('info', 'Wszystko, co panel wysłał albo zablokował. Jeśli coś działa nie tak, tu zobaczysz dlaczego.'));
    const kinds = { send: ['wysłano', 'mp-okc'], dry: ['próba', 'mp-warnc'], block: ['zablokowano', 'mp-badc'], error: ['błąd', 'mp-badc'], info: ['info', 'mp-dim'] };
    const tb = el('tbody', null, net.log.slice(0, 120).map((l) => el('tr', null,
      el('td', { class: 'mp-dim', style: { width: '62px' } }, new Date(l.t).toLocaleTimeString()),
      el('td', { style: { width: '90px' } }, el('span', { class: kinds[l.kind]?.[1] }, kinds[l.kind]?.[0] || l.kind)),
      el('td', { style: { width: '110px' } }, l.src || ''),
      el('td', { class: 'mp-mono' }, l.task || ''),
      el('td', null, l.msg || ''))));
    M.appendChild(el('div', { class: 'mp-card' }, el('h3', null, 'Ostatnie akcje'), net.log.length ? el('table', { class: 'mp-table' }, tb) : el('div', { class: 'mp-dim' }, 'Pusto.')));
    M.appendChild(el('div', { class: 'mp-btns' }, el('button', { class: 'mp-btn', onclick: () => { net.log.length = 0; this.renderMain(); } }, 'Wyczyść log')));
  },

  /* ───── zakładka: ogólne ───── */
  renderGeneral() {
    const g = config.data.global;
    const M = this.main;
    const save = () => { config.save(); this.applyTheme(); };
    const S = [
      { key: 'dryRun', type: 'bool', label: 'Tryb próbny', hint: 'Panel NIC nie wysyła do gry, tylko zapisuje w logu co by zrobił. Idealne na pierwsze uruchomienie.' },
      { key: 'minInterval', type: 'number', label: 'Minimalny odstęp między komendami panelu (ms)', min: 150, max: 5000, hint: 'Dotyczy wszystkich dodatków naraz. Nie schodź poniżej 250 ms.' },
      { key: 'panelKey', type: 'key', label: 'Skrót otwierający panel' },
      { key: 'perCharacter', type: 'bool', label: 'Osobne ustawienia dla każdej postaci', hint: 'Zmiana zadziała po odświeżeniu gry.' },
      { key: 'theme', type: 'custom', render: (obj, onSave) => el('div', { class: 'mp-field', style: { flexDirection: 'column', alignItems: 'stretch' } },
        el('div', { class: 'lb' }, 'Motyw okien'),
        el('div', { class: 'mp-themes' }, Object.entries(this.THEMES).map(([k, t]) => el('div', {
          class: 'mp-theme' + ((obj.theme || 'fiolet') === k ? ' on' : ''), style: { '--t-accent': t.accent, background: `rgba(${t.bg},.85)` },
          onclick: () => { obj.theme = k; onSave(); this.renderAll(); quickbar.draw(); },
        }, el('div', { class: 'sw', style: { background: `linear-gradient(135deg, ${t.accent}55, rgba(${t.bg},1))` } }, el('i')), el('div', { class: 'nm' }, t.name))))) },
      { key: 'glass', type: 'range', label: 'Przezroczystość tła', min: 0.2, max: 0.95, step: 0.05 },
      { key: 'menuSelector', type: 'textarea', label: 'Selektor menu prawego przycisku w grze', hint: 'Zapas, gdy opcje (np. „Dobij") nie pojawiają się w menu gracza.' },
    ];
    const card = el('div', { class: 'mp-card' }, el('h3', null, 'Ogólne'));
    S.forEach((s) => card.appendChild(field(s, g, () => { save(); if (s.key === 'dryRun') this.renderAll(); })));
    M.appendChild(card);

    // pasek skrótów
    const q = (g.quickbar = g.quickbar || { show: true, pinned: [], pos: null });
    if (!Array.isArray(q.pinned)) q.pinned = [];
    const qc = el('div', { class: 'mp-card' }, el('h3', null, 'Pasek skrótów (po prawej)'),
      el('div', { class: 'mp-field' }, el('div', { class: 'lb' }, 'Pokazuj pasek skrótów', el('small', null, 'Na pasku są dodatki dodane przyciskiem „Dodaj do skrótów". Lewy klik na ikonce = ustawienia, prawy klik = włącz/wyłącz.')), switchEl(q.show, (v) => { q.show = v; config.save(); quickbar.draw(); })),
      el('div', { class: 'mp-dim', style: { margin: '8px 0 4px', fontSize: '11.5px' } }, 'W skrótach (kliknij, żeby dodać/usunąć):'),
      el('div', { class: 'mp-chips' }, addons.list.map((a) => {
        const b = el('button', { class: 'mp-pf' + (quickbar.isPinned(a.id) ? ' on' : '') }, a.name);
        b.onclick = () => { quickbar.togglePin(a.id); b.classList.toggle('on'); };
        return b;
      })),
      el('div', { class: 'mp-btns' }, el('button', { class: 'mp-btn', onclick: () => { q.pos = null; config.save(); quickbar.place(); } }, 'Przywróć położenie paska')));
    M.appendChild(qc);

    const conf = keys.conflicts();
    if (conf.length) M.appendChild(note('warn', 'Konflikt skrótów: ' + conf.map(([a, b, k]) => `${k}: „${a}" i „${b}"`).join('; ')));

    const ta = el('textarea', { class: 'mp-in', placeholder: 'Wklej tutaj konfigurację do zaimportowania…' });
    M.appendChild(el('div', { class: 'mp-card' }, el('h3', null, 'Kopia ustawień'),
      el('div', { class: 'mp-dim', style: { marginBottom: '8px' } }, 'Zapisane w przeglądarce dla: ' + config.key),
      ta,
      el('div', { class: 'mp-btns' },
        el('button', { class: 'mp-btn', onclick: () => { ta.value = config.export(); ta.select(); try { navigator.clipboard.writeText(ta.value); toast('Skopiowano do schowka', 'ok'); } catch {} } }, 'Eksportuj'),
        el('button', { class: 'mp-btn', onclick: () => { try { config.import(ta.value); toast('Zaimportowano — odśwież grę', 'ok'); } catch (e) { toast(e.message, 'bad'); } } }, 'Importuj'),
        el('button', { class: 'mp-btn bad', onclick: async () => { if (await confirmBox({ title: 'Przywrócić domyślne?', danger: true, html: 'Wszystkie ustawienia tej postaci zostaną skasowane.' })) { config.reset(); toast('Ustawienia skasowane — odśwież grę', 'ok'); } } }, 'Przywróć domyślne'))));
    M.appendChild(el('div', { class: 'mp-dim', style: { fontSize: '11.5px' } }, `laddonz v${MP.version}. Kod otwarty — sprawdź, co robi każdy dodatek, zanim go włączysz.`));
  },
};

/* ───── elementy formularza ───── */
function switchEl(on, onChange, small) {
  const inp = el('input', { type: 'checkbox' });
  inp.checked = !!on;
  inp.addEventListener('change', () => onChange(inp.checked));
  return el('label', { class: 'mp-sw' + (small ? ' small' : '') }, inp, el('span'));
}

function note(type, text) {
  return el('div', { class: 'mp-note ' + type }, icon(type === 'info' ? 'diag' : 'warn', 16), el('div', { html: text }));
}

function field(s, obj, onSave) {
  const v = obj[s.key];
  const set = (nv) => { obj[s.key] = nv; onSave(); };
  let ctrl;
  switch (s.type) {
    case 'bool':
      ctrl = switchEl(v, async (nv) => {
        if (nv && s.confirm) {
          const ok = await confirmBox({ title: s.label, html: s.confirm, okText: 'Włącz', countdown: s.countdown || 0, danger: !!s.danger });
          if (!ok) { ctrl.querySelector('input').checked = false; return; }
        }
        set(nv);
      });
      break;
    case 'number':
      ctrl = el('input', { class: 'mp-in num', type: 'number', value: v, min: s.min, max: s.max, step: s.step || 1 });
      ctrl.addEventListener('change', () => { let n = Number(ctrl.value); if (s.min != null) n = Math.max(s.min, n); if (s.max != null) n = Math.min(s.max, n); ctrl.value = n; set(n); });
      break;
    case 'range': {
      const out = el('span', { class: 'mp-dim', style: { width: '36px', textAlign: 'right' } }, String(v));
      const r = el('input', { class: 'mp-range', type: 'range', min: s.min, max: s.max, step: s.step || 1, value: v });
      const paint = () => r.style.setProperty('--p', ((r.value - s.min) / (s.max - s.min)) * 100 + '%');
      paint();
      r.addEventListener('input', () => { paint(); out.textContent = r.value; obj[s.key] = Number(r.value); if (s.live) s.live(Number(r.value)); });
      r.addEventListener('change', () => set(Number(r.value)));
      ctrl = el('span', { style: { display: 'flex', alignItems: 'center', gap: '8px' } }, r, out);
      break;
    }
    case 'text':
      ctrl = el('input', { class: 'mp-in txt', value: v ?? '', placeholder: s.placeholder || '' });
      ctrl.addEventListener('change', () => set(ctrl.value));
      break;
    case 'textarea':
      ctrl = el('textarea', { class: 'mp-in', placeholder: s.placeholder || '' });
      ctrl.value = v ?? '';
      ctrl.addEventListener('change', () => set(ctrl.value));
      break;
    case 'color':
      ctrl = el('input', { class: 'mp-color', type: 'color', value: v || '#ffffff' });
      ctrl.addEventListener('input', () => { obj[s.key] = ctrl.value; if (s.live) s.live(ctrl.value); });
      ctrl.addEventListener('change', () => set(ctrl.value));
      break;
    case 'select':
      ctrl = el('select', { class: 'mp-in' }, (typeof s.options === 'function' ? s.options() : s.options).map(([val, lb]) => { const o = el('option', { value: val }, lb); if (String(val) === String(v)) o.selected = true; return o; }));
      ctrl.addEventListener('change', () => set(isNaN(Number(ctrl.value)) || ctrl.value === '' ? ctrl.value : Number(ctrl.value)));
      break;
    case 'key': {
      const b = el('button', { class: 'mp-key' + (v ? '' : ' empty') }, v || 'brak');
      b.onclick = async () => {
        b.classList.add('cap'); b.textContent = 'naciśnij…';
        const k = await keys.capture();
        b.classList.remove('cap');
        if (k === null) { b.textContent = obj[s.key] || 'brak'; return; }
        b.textContent = k || 'brak'; b.classList.toggle('empty', !k);
        set(k);
      };
      ctrl = el('span', { style: { display: 'flex', gap: '6px', alignItems: 'center' } }, b, el('span', { class: 'mp-dim', style: { fontSize: '11px' } }, 'Del = usuń'));
      break;
    }
    case 'list': {
      const arr = Array.isArray(v) ? v : [];
      const chips = el('div', { class: 'mp-chips' });
      const draw = () => {
        chips.innerHTML = '';
        arr.forEach((x, i) => chips.appendChild(el('span', { class: 'mp-chip' }, x, el('button', { title: 'Usuń', onclick: () => { arr.splice(i, 1); obj[s.key] = arr; onSave(); draw(); } }, '×'))));
        const inp = el('input', { class: 'mp-in', placeholder: s.placeholder || 'dodaj i Enter', style: { width: '140px' } });
        inp.addEventListener('keydown', (e) => {
          if (e.key !== 'Enter') return;
          const val = inp.value.trim(); if (!val) return;
          if (!arr.some((a) => a.toLowerCase() === val.toLowerCase())) arr.push(val);
          obj[s.key] = arr; onSave(); draw();
          chips.querySelector('input')?.focus();
        });
        chips.appendChild(inp);
      };
      draw();
      return el('div', { class: 'mp-field', style: { flexDirection: 'column', alignItems: 'stretch' } }, el('div', { class: 'lb' }, s.label, s.hint ? el('small', null, s.hint) : null), chips);
    }
    case 'custom':
      return s.render(obj, onSave);
    default:
      ctrl = el('span', null, String(v));
  }
  if (s.type === 'textarea') return el('div', { class: 'mp-field', style: { flexDirection: 'column', alignItems: 'stretch' } }, el('div', { class: 'lb' }, s.label, s.hint ? el('small', null, s.hint) : null), ctrl);
  return el('div', { class: 'mp-field' + (s.auto ? ' warn' : '') }, el('div', { class: 'lb' }, s.label, s.auto ? ' ' : null, s.auto ? el('span', { class: 'mp-badge auto' }, 'automat') : null, s.hint ? el('small', null, s.hint) : null), ctrl);
}

MP.ui = ui;
MP.field = field;
MP.note = note;

// ═══ src/core/quickbar.js ═══
/* ───────────────────────── quickbar.js ─────────────────────────
 * Pasek skrótów dodatków (domyślnie po prawej, przy ramce obok ekwipunku).
 *   • lewy klik  → szybkie okno ustawień tego dodatku
 *   • prawy klik → włącz / wyłącz dodatek
 * Pasek przeciągasz za uchwyt u góry. Które dodatki są na pasku — zakładka Ogólne.
 */
const quickbar = {
  bar: null,
  pop: null,
  popId: null,

  start() {
    bus.on('quickbar', () => this.draw());
    bus.on('addon:toggle', () => this.draw());
    this.draw();
    // gra potrafi przebudować interfejs (zmiana rozdzielczości) — pilnujemy, żeby pasek był w ekranie
    window.addEventListener('resize', debounce(() => this.place(), 200));
    // okno szybkich ustawień zostaje otwarte, dopóki sam go nie zamkniesz (X albo ponowny klik w ikonkę)
  },

  /** Na pasku są tylko dodatki dodane do skrótów (przycisk „Dodaj do skrótów" przy włączonym dodatku). */
  pinned() { const q = config.data.global.quickbar || {}; return Array.isArray(q.pinned) ? q.pinned : (q.pinned = []); },
  isPinned(id) { return this.pinned().includes(id); },
  togglePin(id) {
    const p = this.pinned();
    const i = p.indexOf(id);
    if (i >= 0) p.splice(i, 1); else p.push(id);
    config.save();
    this.draw();
    bus.emit('quickbar:pins');
    return i < 0;
  },
  enabledList() {
    const order = this.pinned();
    return addons.list.filter((a) => order.includes(a.id));
  },

  defaultPos() {
    return { x: innerWidth - 40, y: Math.round(innerHeight * 0.3) };
  },

  place() {
    if (!this.bar) return;
    const p = (config.data.global.quickbar || {}).pos || this.defaultPos();
    const h = this.bar.offsetHeight || 200;
    this.bar.style.left = clamp(p.x, 0, innerWidth - 34) + 'px';
    this.bar.style.top = clamp(p.y, 0, Math.max(0, innerHeight - h - 4)) + 'px';
  },

  draw() {
    const q = (config.data.global.quickbar = config.data.global.quickbar || { show: true, pinned: [], pos: null });
    if (!Array.isArray(q.pinned)) q.pinned = [];
    if (!q.show || !q.pinned.length) { this.bar && this.bar.remove(); this.bar = null; return; }
    if (!this.bar) {
      this.bar = el('div', { id: 'mp-qbar', class: 'mp-glass' });
      document.body.appendChild(this.bar);
      this.place();
    }
    this.bar.innerHTML = '';
    const handle = el('div', { class: 'mp-qhandle', title: 'Przeciągnij, żeby przesunąć pasek' }, icon('drag', 12));
    this.bar.appendChild(handle);
    makeDraggable(this.bar, handle, (pos) => { q.pos = pos; config.save(); });
    for (const a of this.enabledList()) {
      const on = addons.on(a.id);
      const t = el('div', { class: 'mp-qtile' + (on ? '' : ' off') + (this.popId === a.id ? ' sel' : ''), 'data-name': `${a.name} — ${on ? 'włączony' : 'wyłączony'}` },
        icon(a.icon, 15),
        on ? el('span', { class: 'mp-qdot' }) : null);
      t.addEventListener('click', (e) => { e.stopPropagation(); this.openPop(a.id, t); });
      t.addEventListener('contextmenu', async (e) => {
        e.preventDefault(); e.stopPropagation();
        const v = !addons.on(a.id);
        const ok = await ui.toggleAddon(a, v, null);
        if (ok !== false) toast(`${a.name}: ${v ? 'włączony' : 'wyłączony'}`);
        if (this.popId === a.id) this.openPop(a.id, null, true);
      });
      this.bar.appendChild(t);
    }
    this.bar.appendChild(el('div', { class: 'mp-qtile mp-qmore', 'data-name': 'Pełny panel laddonz', onclick: () => ui.toggle() }, icon('logo', 15)));
    this.place();
  },

  openPop(id, anchor, refresh) {
    if (!refresh && this.popId === id && this.pop) { this.closePop(); return; }
    const a = addons.byId[id];
    const cfg = addons.cfg(id);
    this.popId = id;
    if (!this.pop) {
      this.pop = el('div', { id: 'mp-qpop', class: 'mp-glass' });
      document.body.appendChild(this.pop);
    }
    const P = this.pop;
    const st = P.querySelector('.mp-qbody')?.scrollTop || 0;
    P.innerHTML = '';
    const sw = switchEl(cfg.enabled, async (v) => { const ok = await ui.toggleAddon(a, v, sw); if (ok !== false) this.openPop(id, null, true); });
    const head = el('div', { class: 'mp-head' },
      el('div', { class: 'mp-tile', style: { width: '30px', height: '30px', borderRadius: '9px', background: grad(a.color) } }, icon(a.icon, 17)),
      el('div', { style: { flex: 1, minWidth: 0 } }, el('div', { class: 'mp-title', style: { fontSize: '14px' } }, a.name), el('div', { class: 'mp-sub' }, cfg.enabled ? 'włączony' : 'wyłączony')),
      sw,
      el('button', { class: 'mp-x', title: 'Usuń ze skrótów', onclick: () => { this.togglePin(id); this.closePop(); toast(`${a.name}: usunięto ze skrótów`); } }, icon('pin', 15)),
      el('button', { class: 'mp-x', title: 'Otwórz w pełnym panelu', onclick: () => { this.closePop(); ui.open(id); } }, icon('grid', 15)),
      el('button', { class: 'mp-x', title: 'Zamknij', onclick: () => this.closePop() }, icon('close', 16)));
    const body = el('div', { class: 'mp-qbody' });
    P.append(head, body);
    ui.renderAddon(body, id, () => this.openPop(id, null, true), true);
    body.scrollTop = st;
    // pozycja: obok paska, po stronie, gdzie jest miejsce
    if (this.bar) {
      const r = this.bar.getBoundingClientRect();
      const w = 360;
      const left = r.left > w + 20 ? r.left - w - 8 : r.right + 8;
      P.style.left = left + 'px';
      // okno zawsze mieści się w ekranie: przesuwamy je w górę, gdy jest wysokie
      const want = clamp(anchor ? anchor.getBoundingClientRect().top - 20 : (parseFloat(P.style.top) || r.top), 8, innerHeight - 200);
      const h = Math.min(P.scrollHeight, innerHeight * 0.78);
      P.style.top = Math.max(8, Math.min(want, innerHeight - h - 8)) + 'px';
    }
    this.draw();
  },

  closePop() { this.pop && this.pop.remove(); this.pop = null; this.popId = null; this.draw(); },
};

MP.quickbar = quickbar;

// ═══ src/addons/_shared.js ═══
/* Wspólne pomocniki dla dodatków. */
const nickIn = (list, nick) => Array.isArray(list) && list.some((n) => String(n).toLowerCase() === String(nick || '').toLowerCase());

/** Czy gracz jest „swój" (klan / znajomy / sojusznik / ręczna lista Bratana). */
function isFriendly(p) {
  if (!p) return false;
  const b = addons.cfg('bratan') || {};
  if (p.isClan || p.isFriend || p.isAlly) return true;
  if (nickIn(b.nicks, p.nick)) return true;
  return false;
}

function relTag(p) {
  if (p.isClan) return ['cl', 'klan'];
  if (p.isAlly) return ['al', 'sojusz'];
  if (p.isFriend) return ['fr', 'znajomy'];
  if (p.isEnemyTagged) return ['en', 'wróg'];
  return ['', '—'];
}

/** Parsuje z odpowiedzi serwera informację o ochronie: zwraca liczbę sekund albo null. */
function parseProtection(data) {
  let s;
  try { s = JSON.stringify(data || {}); } catch { return null; }
  if (!/ochron|protect/i.test(s)) return null;
  const m = s.match(/ochron[^"]{0,80}?(\d+)\s*(min|m\b|sek|s\b)/i) || s.match(/(\d+)\s*(min|sek|s)\b[^"]{0,40}ochron/i);
  if (!m) return 3;
  const n = Number(m[1]);
  return /min|^m$/i.test(m[2]) ? n * 60 : n;
}

// ═══ src/addons/napad.js ═══
/* ───────── Dobijarka (id: napad — zostawione dla zgodności ustawień) ─────────
 * Włączony  → atakuje każdego gracza, który wejdzie w zasięg (w zakresie poziomów).
 * Klawisz   → działa ZAWSZE (także gdy dodatek jest wyłączony): namierza najbliższego gracza
 *             i atakuje go w chwili, gdy będzie w zasięgu. Postać nie podchodzi sama.
 * Menu gracza (prawy klik) → „Dobij": namierza tego gracza, atak gdy będzie w zasięgu.
 * Kogo NIE atakować (klan, znajomi…) — decyduje Bratan; Dobijarka takich graczy po prostu pomija.
 */
(() => {
  const RANGE = 2;            // zasięg ataku w kratkach (liczy się większa z odległości w poziomie/pionie)
  const RETRY_MS = 600;       // jak często ponawiać atak na namierzony cel w zasięgu
  const S = { last: 0, protectedUntil: {}, tried: {}, refused: {}, lock: null, timer: null };
  let cfg;

  const dist = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
  const task = (id) => net.build('attackPlayer', { id }).task;
  /** Czy atak na tego gracza przeszedłby przez bezpieczniki (Bratan) — sprawdzamy po cichu. */
  const allowed = (p) => { const t = task(p.id); return !!t && !net.checkGuards(t); };
  const inLvl = (p) => p.lvl >= (Number(cfg.lvlMin) || 0) && p.lvl <= (Number(cfg.lvlMax) || 999);

  async function attack(p) {
    const t = now();
    if (!p || game.inBattle()) return false;
    if (t - S.last < RETRY_MS) return false;
    if (S.protectedUntil[p.id] > t) return false;           // nie marnujemy ataku na ochronę
    S.last = t;
    S.tried[p.id] = t;
    const r = await net.send('attackPlayer', { id: p.id }, {
      src: 'Dobijarka',
      onResponse: (data) => {
        // odmowa serwera (np. żółta mapa: „Przeciwnik nie zgadza się na walkę") — nie ponawiamy w kółko
        let txt = ''; try { txt = JSON.stringify(data || {}); } catch {}
        if (/nie zgadza|nie mo[żz]esz|nie mo[żz]na/i.test(txt)) {
          S.refused[p.id] = now() + 30000;
          return;   // cel zostaje zapamiętany — spróbujemy znowu za 30 s
        }
        const sec = parseProtection(data);
        if (sec) {
          S.protectedUntil[p.id] = now() + sec * 1000;
          if (S.lock && S.lock.id === p.id) toast(`Dobijarka: ${p.nick} ma ochronę jeszcze ${sec} s — zaatakuję, gdy minie`);
        }
      },
    });
    return r.ok;
  }

  /* ── namierzanie (klawisz / menu / lista) ── */
  function lockOn(p) {
    if (!p) return;
    if (!allowed(p)) { toast(`Dobijarka: ${p.nick} jest chroniony przez Bratana`); return; }
    S.lock = { id: p.id, nick: p.nick, t: now() };
    cfg.target = { id: p.id, nick: p.nick };          // zapamiętany na stałe (także po odświeżeniu gry)
    config.save();
    mark.set(p.id);
    toast(`Dobijarka: cel ${p.nick}`);
    ensureLoop();
    tick();
  }
  function unlock(msg) {
    if (!S.lock) return;
    if (msg) toast(msg);
    S.lock = null;
    cfg.target = null;
    config.save();
    mark.clear();
    ensureLoop();
    if (ui.panel && ui.sel === 'napad') ui.renderMain();
  }
  function keyNearest() {
    const h = game.hero(); if (!h) return;
    const list = game.others().filter(allowed).sort((a, b) => dist(h, a) - dist(h, b));
    if (!list.length) { toast('Dobijarka: brak graczy na mapie'); return; }
    // ponowne naciśnięcie przy tym samym celu = następny najbliższy
    let p = list[0];
    if (S.lock && S.lock.id === p.id && list[1]) p = list[1];
    lockOn(p);
  }

  /* ── pętla: namierzony cel + tryb włączony ── */
  function ensureLoop() {
    const need = !!S.lock || (cfg && cfg.enabled);
    if (need && !S.timer) S.timer = setInterval(tick, 150);
    if (!need && S.timer) { clearInterval(S.timer); S.timer = null; }
  }
  /** Namierzony gracz na mapie: po id, a gdy wrócił z nowym id — po nicku. */
  function lockedPlayer() {
    if (!S.lock) return null;
    let p = game.otherById(S.lock.id);
    if (!p) { p = game.otherByNick(S.lock.nick); if (p) { S.lock.id = p.id; cfg.target = { id: p.id, nick: p.nick }; config.save(); } }
    return p;
  }
  function tick() {
    if (!game.ready()) return;
    const h = game.hero(); if (!h) return;
    if (game.inBattle()) return;
    // 1) namierzony cel — pamiętany, dopóki sam go nie zmienisz/przerwiesz; atak, gdy będzie w zasięgu
    if (S.lock) {
      const p = lockedPlayer();
      if (!p && !cfg.remember) { unlock(`Dobijarka: ${S.lock.nick} zniknął z mapy`); return; }
      if (p) mark.ensure(p.id);   // gracz wrócił (nowy obiekt w grze) — przywróć podświetlenie
      if (p && dist(h, p) <= RANGE && !(S.refused[p.id] > now())) { attack(p); return; }
      if (p) return;              // cel jest na mapie, ale daleko — czekamy
      // celu nie ma na mapie — w międzyczasie (gdy włączona) atakuje innych w zasięgu
    }
    // 2) dodatek włączony → każdy w zasięgu
    if (!cfg.enabled) return;
    const t = now();
    const c = game.others()
      .filter((p) => dist(h, p) <= RANGE && inLvl(p) && allowed(p) && !(S.tried[p.id] > t - 2500) && !(S.refused[p.id] > t))
      .sort((a, b) => dist(h, a) - dist(h, b));
    if (c.length) attack(c[0]);
  }

  /*
   * Zaznaczenie celu. Gra ma przy graczu metody znacznika (addColorMark/removeColorMark) —
   * próbujemy ich; niezależnie od tego na ekranie jest mały wskaźnik „Cel: nick".
   */
  const mark = {
    id: null,
    raw: null,
    set(id) {
      this.clear(true);
      this.id = id;
      const raw = game.otherRaw(id);
      this.raw = raw;
      try { if (raw && typeof raw.addColorMark === 'function') raw.addColorMark('#ff0000', 'laddonz'); } catch {}
      this.ind();
    },
    /** Podświetlenie pilnowane cały czas — gra tworzy nowy obiekt gracza po jego powrocie na mapę. */
    ensure(id) {
      const raw = game.otherRaw(id);
      if (!raw) return;
      if (raw !== this.raw || this.id !== id) this.set(id);
    },
    clear(silent) {
      const raw = this.raw || (this.id && game.otherRaw(this.id));
      this.raw = null;
      try { if (raw && typeof raw.removeColorMark === 'function') raw.removeColorMark('laddonz'); } catch {}
      this.id = null;
      if (!silent) this.ind();
    },
    ind() {
      // bez komunikatu na ekranie — cel widać w menu gracza („Przerwij dobijanie")
      const n = document.getElementById('mp-napad-ind'); if (n) n.remove();
    },
  };

  defineAddon({
    id: 'napad', name: 'Dobijarka', icon: 'napad', color: ['#ff5d7a', '#b8325a'], risk: 'auto',
    desc: 'Włączona: atakuje każdego gracza, który wejdzie w zasięg (w podanym zakresie poziomów). Klawisz działa zawsze — namierza najbliższego gracza i atakuje go, gdy tylko będzie w zasięgu. Opcjonalnie zapamiętuje cel po jego zniknięciu, dopóki nie wybierzesz innego albo nie przerwiesz. To samo robi opcja „Dobij" w menu gracza; „Przerwij dobijanie" cofa polecenie. Kogo nie atakować, ustawiasz w Bratanie.',
    defaults: { enabled: false, keyAttack: '', lvlMin: 0, lvlMax: 500, target: null, remember: true },
    notes: () => [{ type: 'warn', text: 'Włączona Dobijarka atakuje bez Twojego kliknięcia — to automat. Postać nigdy sama nie podchodzi do celu.' }],
    settings: [
      { key: 'lvlMin', type: 'number', label: 'Atakuj od poziomu', min: 0, max: 500, hint: 'Dotyczy ataku na każdego w zasięgu.' },
      { key: 'lvlMax', type: 'number', label: 'Atakuj do poziomu', min: 0, max: 500 },
      { key: 'remember', type: 'bool', label: 'Zapamiętuj cel po jego zniknięciu', hint: 'Cel zostaje (z podświetleniem) także po zniknięciu z mapy, zmianie mapy i odświeżeniu gry — aż wybierzesz inny albo przerwiesz. Wyłączone: namierzenie znika razem z celem.' },
      { key: 'keyAttack', type: 'key', label: 'Klawisz: namierz najbliższego gracza', hint: 'Działa także przy wyłączonym dodatku. Ponowne naciśnięcie = następny najbliższy. Przerwanie: prawy klik na celu → „Przerwij dobijanie".' },
    ],
    render(box, c, rerender) {
      box.appendChild(el('div', { class: 'mp-card' }, el('h3', null, 'Zapamiętany cel'),
        S.lock ? el('div', { style: { display: 'flex', alignItems: 'center', gap: '10px' } },
          el('b', null, S.lock.nick), el('span', { class: 'mp-dim' }, game.otherById(S.lock.id) || game.otherByNick(S.lock.nick) ? 'na mapie' : 'poza mapą — czekam'),
          el('button', { class: 'mp-btn bad', style: { marginLeft: 'auto' }, onclick: () => { unlock('Dobijarka: przerwano'); rerender(); } }, 'Przerwij dobijanie'))
          : el('div', { class: 'mp-dim' }, 'Brak. Ustaw klawiszem albo „Dobij" w menu gracza.')));
    },
    init(c) {
      cfg = c;
      if (!c._v15) { c._v15 = true; c.lvlMin = 0; c.lvlMax = 500; config.save(); }
      // klawisz działa niezależnie od włączenia dodatku
      keys.bind({ label: 'Dobijarka: namierz najbliższego', get: () => cfg.keyAttack || '', fn: () => keyNearest() });
      menus.add('player', (id) => {
        // namierzony gracz → zamiast „Dobij" jest „Przerwij dobijanie" (cofa polecenie ataku)
        const pp = game.otherById(id);
        if (S.lock && (S.lock.id === Number(id) || (pp && pp.nick === S.lock.nick))) return [{ label: 'Przerwij dobijanie', fn: () => unlock(`Dobijarka: przerwano atak na ${S.lock ? S.lock.nick : 'cel'}`) }];
        const p = game.otherById(id);
        if (!p || !allowed(p)) return [];
        return [{ label: 'Dobij', fn: () => lockOn(game.otherById(id) || p) }];
      });
      bus.on('map:change', () => { S.protectedUntil = {}; S.tried = {}; S.refused = {}; if (!cfg.remember) unlock(); });
      // przywróć zapamiętany cel
      if (cfg.remember && cfg.target && cfg.target.nick) S.lock = { id: Number(cfg.target.id), nick: cfg.target.nick, t: now() };
      MP.napad = { attack: (p) => lockOn(p), lockOn, unlock };
      ensureLoop();
    },
    onToggle() { ensureLoop(); },
  });
})();

// ═══ src/addons/wakeup_bratan_minichat.js ═══
/* ───────── Hey WakeUP! ─────────
 * Style komunikatów gry (duży żółty napis na środku ekranu — .big-messages .message).
 * Panel też pokazuje swoje powiadomienia jako komunikaty gry, więc styl działa na wszystko.
 * Do wyboru gotowe style z podglądem albo „Własny" (kolory, czcionka, rozmiar, tło, ramka).
 */
(() => {
  let cfg;
  const FONTS = [['Arial,"Segoe UI",sans-serif', 'Arial (jak w grze)'], ['"Segoe UI",system-ui,sans-serif', 'Systemowa'], ['Georgia,serif', 'Georgia (szeryfowa)'], ['"Trebuchet MS",sans-serif', 'Trebuchet'], ['Verdana,sans-serif', 'Verdana'], ['Consolas,monospace', 'Consolas (mono)'], ['Impact,sans-serif', 'Impact']];
  const OUTLINE = '2px 0 0 #000,-2px 0 0 #000,0 2px 0 #000,0 -2px 0 #000,1px 1px 0 #000,-1px -1px 0 #000,1px -1px 0 #000,-1px 1px 0 #000';

  // Gotowe style. „gra" = brak zmian (oryginalny wygląd).
  const PRESETS = {
    gra:      { name: 'Domyślny (gra)', css: null },
    mini:     { name: 'Minimalny', css: 'color:#fff!important;font:600 16px/1.3 "Segoe UI",system-ui,sans-serif!important;text-shadow:0 1px 3px rgba(0,0,0,.9)!important;letter-spacing:.2px!important' },
    szklo:    { name: 'Szkło', css: 'color:#fff!important;font:600 16px/1.3 "Segoe UI",system-ui,sans-serif!important;text-shadow:none!important;background:rgba(16,17,28,.6)!important;-webkit-backdrop-filter:blur(10px)!important;backdrop-filter:blur(10px)!important;border:1px solid rgba(255,255,255,.18)!important;border-radius:14px!important;padding:8px 18px!important;display:table!important;margin:4px auto!important;box-shadow:0 8px 24px rgba(0,0,0,.35)!important' },
    neon:     { name: 'Neon', css: 'color:#e9fbff!important;font:700 20px/1.3 "Segoe UI",system-ui,sans-serif!important;text-shadow:0 0 6px #22d3ee,0 0 14px #22d3ee,0 0 28px #0891b2!important;letter-spacing:.5px!important' },
    alarm:    { name: 'Alarm', css: 'color:#fff!important;font:800 22px/1.3 Arial,sans-serif!important;text-shadow:0 1px 2px #000!important;background:linear-gradient(90deg,rgba(185,28,28,.0),rgba(185,28,28,.85) 15%,rgba(185,28,28,.85) 85%,rgba(185,28,28,0))!important;padding:6px 60px!important;display:table!important;margin:4px auto!important;text-transform:uppercase!important;letter-spacing:1px!important' },
    pasek:    { name: 'Ciemny pasek', css: 'color:#ffd84a!important;font:700 17px/1.3 Arial,sans-serif!important;text-shadow:none!important;background:rgba(0,0,0,.72)!important;padding:6px 40px!important;display:table!important;margin:4px auto!important;border-top:1px solid rgba(255,216,74,.5)!important;border-bottom:1px solid rgba(255,216,74,.5)!important' },
    pergamin: { name: 'Pergamin', css: 'color:#3b2410!important;font:700 18px/1.3 Georgia,serif!important;text-shadow:none!important;background:linear-gradient(#f3e3b8,#e2c88c)!important;border:2px solid #8a6230!important;border-radius:6px!important;padding:6px 18px!important;display:table!important;margin:4px auto!important;box-shadow:0 4px 14px rgba(0,0,0,.45)!important' },
    duzy:     { name: 'Bardzo duży', css: `color:#ffe500!important;font:900 34px/1.25 Arial,sans-serif!important;text-shadow:${OUTLINE},0 0 12px rgba(0,0,0,.6)!important` },
    wlasny:   { name: 'Własny', css: null },
  };

  function customCss() {
    const box = cfg.bgAlpha > 0 || cfg.frame;
    return `color:${cfg.fg}!important;font-family:${cfg.font}!important;font-size:${cfg.size}px!important;font-weight:${cfg.bold ? 700 : 400}!important;` +
      `text-shadow:${cfg.outline ? OUTLINE : 'none'}${cfg.shadow ? `,0 0 10px ${cfg.glow},0 0 20px ${cfg.glow}` : ''}!important;` +
      (box ? `background:${hexA(cfg.bg, cfg.bgAlpha)}!important;padding:5px 16px!important;border-radius:${cfg.radius}px!important;display:table!important;margin:4px auto!important;${cfg.frame ? `border:1px solid ${cfg.glow}!important;` : ''}` : '');
  }
  function cssFor(id) { return id === 'wlasny' ? customCss() : (PRESETS[id] && PRESETS[id].css); }

  function apply() {
    let st = document.getElementById('mp-wakeup-css');
    if (!st) { st = el('style', { id: 'mp-wakeup-css' }); document.head.appendChild(st); }
    const sel = (cfg.gameSelectors || '').split('\n').map((s) => s.trim()).filter(Boolean).join(',');
    const css = cfg.enabled && cssFor(cfg.style);
    // podglądy w panelu zawsze aktualne
    const prev = Object.keys(PRESETS).map((k) => { const c = cssFor(k); return c ? `.mp-wk-prev.wk-${k} .mp-wk-msg{${c}}` : ''; }).join('\n');
    st.textContent = (css && sel ? `${sel}{${css}}\n` : '') + prev;
  }
  function hexA(hex, a) {
    const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex || '');
    if (!m) return hex;
    return `rgba(${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)},${a})`;
  }

  defineAddon({
    id: 'wakeup', name: 'Hey WakeUP!', icon: 'wakeup', color: ['#ffb547', '#ff7a45'], renderFirst: true,
    desc: 'Zmienia wygląd komunikatów gry (duży żółty napis na środku ekranu) — także tych wysyłanych przez panel. Wybierz gotowy styl albo ułóż własny.',
    defaults: { enabled: false, style: 'mini', fg: '#ffe500', glow: '#ffb547', bg: '#10111c', bgAlpha: 0, frame: false, radius: 10, font: 'Arial,"Segoe UI",sans-serif', size: 24, bold: true, outline: true, shadow: false, gameSelectors: '.big-messages .message' },
    settings: [
      { group: 'Własny styl', show: (c) => c.style === 'wlasny', key: 'fg', type: 'color', label: 'Kolor tekstu', live: () => apply() },
      { group: 'Własny styl', show: (c) => c.style === 'wlasny', key: 'font', type: 'select', label: 'Czcionka', options: FONTS },
      { group: 'Własny styl', show: (c) => c.style === 'wlasny', key: 'size', type: 'range', label: 'Rozmiar (px)', min: 10, max: 40, live: () => apply() },
      { group: 'Własny styl', show: (c) => c.style === 'wlasny', key: 'bold', type: 'bool', label: 'Pogrubienie' },
      { group: 'Własny styl', show: (c) => c.style === 'wlasny', key: 'outline', type: 'bool', label: 'Czarny obrys (jak w grze)' },
      { group: 'Własny styl', show: (c) => c.style === 'wlasny', key: 'shadow', type: 'bool', label: 'Kolorowa poświata' },
      { group: 'Własny styl', show: (c) => c.style === 'wlasny', key: 'glow', type: 'color', label: 'Kolor poświaty / ramki', live: () => apply() },
      { group: 'Własny styl', show: (c) => c.style === 'wlasny', key: 'bg', type: 'color', label: 'Kolor tła', live: () => apply() },
      { group: 'Własny styl', show: (c) => c.style === 'wlasny', key: 'bgAlpha', type: 'range', label: 'Krycie tła (0 = bez tła)', min: 0, max: 1, step: 0.05, live: () => apply() },
      { group: 'Własny styl', show: (c) => c.style === 'wlasny', key: 'frame', type: 'bool', label: 'Ramka' },
      { group: 'Własny styl', show: (c) => c.style === 'wlasny', key: 'radius', type: 'range', label: 'Zaokrąglenie (px)', min: 0, max: 24, live: () => apply() },
      { group: 'Zaawansowane', key: 'gameSelectors', type: 'text', label: 'Selektor komunikatów gry', hint: 'Domyślnie .big-messages .message' },
    ],
    render(box, c, rerender) {
      const grid = el('div', { class: 'mp-wk-grid' });
      for (const [k, p] of Object.entries(PRESETS)) {
        const card = el('div', { class: 'mp-wk-prev wk-' + k + (c.style === k ? ' on' : ''), onclick: () => { c.style = k; config.save(); apply(); rerender(); } },
          el('div', { class: 'mp-wk-stage' }, el('span', { class: 'mp-wk-msg' + (k === 'gra' ? ' gra' : '') }, k === 'wlasny' ? 'Twój styl' : 'Komunikat')),
          el('div', { class: 'mp-wk-name' }, p.name));
        grid.appendChild(card);
      }
      box.prepend(el('div', { class: 'mp-card' }, el('h3', null, 'Styl komunikatów'), grid,
        el('div', { class: 'mp-btns' }, el('button', { class: 'mp-btn pri', onclick: () => toast('Tak wygląda komunikat — Hey WakeUP!') }, 'Pokaż w grze'))));
      if (!c.enabled) box.prepend(MP.note('info', 'Dodatek jest wyłączony — komunikaty mają wygląd z gry. Włącz go, żeby zastosować wybrany styl.'));
    },
    init(c) { cfg = c; if (!c._v13) { c._v13 = true; c.style = c.style || 'mini'; c.size = 24; c.fg = '#ffe500'; config.save(); } apply(); },
    onToggle() { apply(); },
    onChange() { apply(); },
  });
})();

/* ───────── Bratan ─────────
 * Blokuje KAŻDY atak (także ręczny i z innych dodatków) na klanowiczów, znajomych, sojuszników i osoby z listy.
 */
(() => {
  let cfg;
  defineAddon({
    id: 'bratan', name: 'Bratan', icon: 'bratan', color: ['#3ddc97', '#1c9b6c'],
    desc: 'Blokuje atak na klanowiczów, znajomych i sojuszników. Działa na wszystkie ataki — także kliknięte ręcznie w grze.',
    defaults: { enabled: false, clan: true, friends: true, allies: true, nicks: [] },
    settings: [
      { key: 'clan', type: 'bool', label: 'Chroń klanowiczów' },
      { key: 'friends', type: 'bool', label: 'Chroń znajomych' },
      { key: 'allies', type: 'bool', label: 'Chroń sojuszników klanu' },
      { key: 'nicks', type: 'list', label: 'Dodatkowo chroń (nicki)', placeholder: 'nick + Enter' },
    ],
    init(c) {
      cfg = c;
      net.addGuard((task) => {
        if (!cfg.enabled) return null;
        if (!/^fight(&|$)/.test(task) || !/(^|&)a=attack(&|$)/.test(task)) return null;
        const m = /(?:^|&)id=(-?\d+)/.exec(task);
        if (!m) return null;
        const id = Number(m[1]);
        if (!id || id < 0) return null; // ujemne id = NPC
        const p = game.otherById(id);
        if (!p) return null;
        const why = (cfg.clan && p.isClan && 'klanowicz') || (cfg.friends && p.isFriend && 'znajomy') || (cfg.allies && p.isAlly && 'sojusznik') || (nickIn(cfg.nicks, p.nick) && 'na liście Bratana');
        return why ? { block: true, reason: `Bratan: zablokowano atak na ${p.nick} (${why})`, src: 'Bratan' } : null;
      });
    },
  });
})();

/* ───────── MiniChat ─────────
 * Zmienia tylko wysokość okna czatu.
 */
(() => {
  let cfg, found = '';
  function detect() {
    $$('[data-mp-chat]').forEach((n) => n.removeAttribute('data-mp-chat'));
    const sel = (cfg.selector || '').split('\n').map((s) => s.trim()).filter(Boolean).join(',');
    let target = null;
    if (sel) { try { target = $$(sel).find(isVisible) || null; } catch {} }
    if (target) {
      target.setAttribute('data-mp-chat', '');
      found = (typeof target.className === 'string' ? '.' + target.className.trim().split(/\s+/).join('.') : target.tagName.toLowerCase());
    } else found = '';
    return target;
  }
  function apply() {
    let st = document.getElementById('mp-minichat-css');
    if (!st) { st = el('style', { id: 'mp-minichat-css' }); document.head.appendChild(st); }
    if (!cfg.enabled || !detect()) { st.textContent = ''; return; }
    st.textContent = `[data-mp-chat]{height:${cfg.height}px!important;max-height:${cfg.height}px!important;min-height:0!important}`;
  }
  defineAddon({
    id: 'minichat', name: 'MiniChat', icon: 'minichat', color: ['#5b8cff', '#3a5bd9'],
    desc: 'Ustawia wysokość okna czatu.',
    defaults: { height: 160, selector: '.new-chat-window' },
    settings: [
      { key: 'height', type: 'range', label: 'Wysokość czatu (px)', min: 60, max: 700, step: 10, live: () => apply() },
      { key: 'selector', type: 'text', label: 'Selektor okna czatu', hint: 'Domyślnie .new-chat-window — zmień tylko, jeśli gra zmieni wygląd czatu.' },
    ],
    render(box) {
      box.appendChild(el('div', { class: 'mp-card' }, el('h3', null, 'Okno czatu'),
        el('div', { class: found ? 'mp-mono mp-okc' : 'mp-warnc' }, found || 'Nie znaleziono — otwórz czat w grze i kliknij „Wykryj ponownie".'),
        el('div', { class: 'mp-btns' }, el('button', { class: 'mp-btn', onclick: () => { apply(); ui.renderMain(); } }, 'Wykryj ponownie'))));
    },
    init(c) {
      cfg = c;
      if (cfg.selector === '.chat-tpl\n.chat-window\n#chat' || cfg.selector === '') cfg.selector = '.new-chat-window';
      apply();
      setInterval(() => { if (cfg.enabled && !document.querySelector('[data-mp-chat]')) apply(); }, 2000);
    },
    onToggle() { apply(); },
    onChange() { apply(); },
  });
})();

// ═══ src/addons/ktotu_ktozlapie_cook.js ═══
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
  function readFromTip(node, id) {
    if (!id || tipBusy.has(id)) return;
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
      if (tip) decorate();
    }, 120);
  }

  function decorate() {
    const wins = $$(LOOT_SEL).filter(isVisible);
    document.querySelectorAll('.mp-ibadge.chance').forEach((b) => { if (!wins.some((w) => w.contains(b))) b.remove(); });
    if (!wins.length) return;
    const P = participants();
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
    desc: 'Pod kafelkami łupu pokazuje Twoją szansę (%) na złapanie przedmiotu. Liczone są osoby z Twojej drużyny, które brały udział w walce. Przy przedmiocie dla konkretnej profesji pierwszeństwo mają gracze tej profesji; gdy nikogo takiego nie było w walce, losują wszyscy. Zakłada, że wszyscy klikną „Chcę".',
    defaults: { enabled: false },
    init(c) {
      cfg = c;
      if ('onlyOnMap' in c || 'lootSelector' in c) { delete c.onlyOnMap; delete c.lootSelector; config.save(); }
      const run = debounce(() => { if (cfg.enabled) decorate(); }, 120);
      new MutationObserver(run).observe(document.body, { childList: true, subtree: true });
      bus.on('battle:start', () => { last = { ids: [], prof: {}, t: 0 }; });
      setInterval(() => { if (cfg.enabled && game.ready() && E().battle && (game.inBattle() || (typeof E().battle.isBattleShow === 'function' && E().battle.isBattleShow()))) snapshot(); }, 500);
      bus.on('battle:end', () => { if (cfg.enabled) snapshot(); });
      MP.ktozlapie = { fighters, participants, debug: () => ({ uczestnicy: participants(), wymagania: Object.fromEntries(reqCache) }) };
    },
  });
})();

/* ───────── Let's Cook Together ─────────
 * Zaproszenia do grupy pod klawisz (znajomi / klan / sojusz / wszyscy na mapie) i rozwiązanie grupy pod klawisz.
 * Bez automatów — każde zaproszenie wysyłasz sam (klawisz albo przycisk).
 */
(() => {
  let cfg, invited = {};

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

  function inviteAll() {
    const h = game.hero();
    const party = new Set(game.partyMembers());
    // ktoś, kto dołączył do grupy albo grupa została rozwiązana — zapomnij o wcześniejszym zaproszeniu
    for (const id of Object.keys(invited)) if (party.has(Number(id))) delete invited[id];
    const matching = game.others().filter((p) => {
      if (nickIn(cfg.never, p.nick)) return false;
      if (cfg.range > 0 && h && game.dist(h, p) > cfg.range) return false;
      return cfg.everyone || (cfg.friends && isFriendP(p)) || (cfg.clan && p.isClan) || (cfg.allies && p.isAlly) || nickIn(cfg.always, p.nick);
    });
    const inParty = matching.filter((p) => party.has(p.id));
    const recent = matching.filter((p) => !party.has(p.id) && invited[p.id] > now() - 10000);   // ta sama osoba nie częściej niż co 10 s
    const l = matching.filter((p) => !party.has(p.id) && !(invited[p.id] > now() - 10000));
    const room = Math.max(0, cfg.maxParty - Math.max(1, party.size));
    const pick = l.slice(0, room || l.length);
    if (!pick.length) {
      const total = game.others().length;
      const why = [];
      if (inParty.length) why.push(`już w grupie: ${inParty.map((p) => p.nick).join(', ')}`);
      if (recent.length) why.push(`zaproszeni przed chwilą: ${recent.map((p) => p.nick).join(', ')}`);
      if (l.length && !room) why.push('grupa jest pełna');
      toast(why.length ? `Let's Cook: ${why.join('; ')}` : total ? `Let's Cook: nikt z ${total} graczy na mapie nie pasuje do ustawień` : 'Let\'s Cook: brak graczy na mapie', 'warn', 2500);
      return;
    }
    // jak gracz: menu gracza → „Zaproś do grupy"; zapas: komenda zaproszenia
    (async () => {
      for (const p of pick) {
        invited[p.id] = now();
        const ok = await menus.choosePlayerOption(p.id, /^zapro[śs] do grupy/i);
        if (!ok) await net.send('partyInvite', { id: p.id }, { src: 'Let\'s Cook' });
        await sleep(250);
      }
    })();
    toast(`Let's Cook: zapraszam ${pick.map((p) => p.nick).join(', ')}`, 'ok', 1800);
  }

  async function disband() {
    invited = {};
    game._partyCache = [];
    // bez okienka „Czy na pewno chcesz rozwiązać grupę?" — od razu komenda rozwiązania (działała od początku)
    await net.send('partyDisband', {}, { src: 'Let\'s Cook', urgent: true });
    toast('Rozwiązuję grupę');
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
      // podgląd: kogo by zaprosił i dlaczego — pomaga sprawdzić ustawienia
      const ok = new Set(eligible().map((p) => p.id));
      const party = new Set(game.partyMembers());
      const rows = game.others().map((p) => el('tr', null, el('td', null, p.nick, el('span', { class: 'mp-dim' }, ` (${p.lvl}${p.prof})`)),
        el('td', { class: 'mp-dim' }, [isFriendP(p) && 'znajomy', p.isClan && 'klan', p.isAlly && 'sojusz'].filter(Boolean).join(', ') || '—', el('span', { class: 'mp-mono' }, ` [rel ${p.relation || '?'}]`)),
        el('td', null, party.has(p.id) ? el('span', { class: 'mp-dim' }, 'w grupie') : ok.has(p.id) ? el('span', { class: 'mp-okc' }, 'zaprosi') : el('span', { class: 'mp-dim' }, 'pominie'))));
      box.appendChild(el('div', { class: 'mp-card' }, el('h3', null, 'Gracze na mapie'), rows.length ? el('table', { class: 'mp-table' }, el('tbody', null, rows)) : el('div', { class: 'mp-dim' }, 'Brak graczy.')));
    },
    init(c) {
      cfg = c;
      if ('auto' in c) { delete c.auto; config.save(); }   // usunięty automat z wcześniejszych wersji
      bus.on('map:change', () => { invited = {}; });
    },
  });
})();

// ═══ src/addons/items_overlay.js ═══
/* ───────── wspólny dekorator przedmiotów (Jaki To Bon, Podpisownik, Szybka rączka) ───────── */
const itemDeco = {
  painters: [],     // fn(itemEl, item) -> [{cls, text, title}] | null
  add(fn) { this.painters.push(fn); },
  run() {
    for (const node of game.itemEls()) {
      const id = game.itemIdFromEl(node);
      if (!id) continue;
      // przedmioty z okna „Ekwipunek Postaci" innego gracza — dane z szablonów gry (Pokaż EQ)
      const it = /-showeq/.test(String(node.className)) ? (MP.eqLookup ? MP.eqLookup(node) : null) : game.itemById(id);
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
    desc: 'Dodaje do przedmiotów legendarnych skrót bonusu w prawym górnym rogu (OR — Ostatni ratunek, CBK — Cios bardzo krytyczny, FO — Fasada opieki…). Działa na Twoim ekwipunku, w oknie „Ekwipunek Postaci" z gry i w podglądzie Pokaż EQ.',
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
        const other = /-showeq/.test(String(node.className));
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
    desc: 'Własne podpisy na przedmiotach (np. dokąd prowadzi kamień teleportacyjny), widoczne w ekwipunku. Prawy klik na przedmiocie → „Podpisz…" (albo Alt + prawy klik). Podpis trafia od razu na wszystkie takie same przedmioty — np. kamienie ustawione w to samo miejsce.',
    defaults: { enabled: false, byId: {}, byKey: {}, rules: [], autoTeleport: true },
    settings: [{ key: 'autoTeleport', type: 'bool', label: 'Automatycznie podpisuj teleporty nazwą celu (jeśli gra ją podaje)' }],
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
          : el('div', { class: 'mp-dim' }, 'Brak — prawy klik na przedmiocie → „Podpisz…".')));
    },
    init(c) {
      cfg = c;
      c.byKey = c.byKey || {};
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
  let busy = false, wanted = null, anchor = null, userEqClick = 0, activeHide = null, lastGrid = null, lastAnchorRect = null;
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
      tip.style.minWidth = Math.min(260, Math.round(r.width)) + 'px';
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
    const S = 36;
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
    return el('div', { class: 'mp-eqsum' },
      el('div', null, 'Legendy: ', el('b', null, String(leg)), ' · Heroiki: ', el('b', null, String(her))),
      Object.keys(sum).length
        ? el('div', { class: 'mp-eqbons' }, Object.values(sum).map((x) => el('span', { class: 'mp-chip', title: MP.legName(x.code) }, `${MP.legAbbr(x.code, x.raw)} ×${x.n}`)))
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

  function watchHover() {
    let mx = 0, my = 0, shift = false, src = null, tipNode = null, lastMapSeen = 0, graceT = null;
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
          // tylko dymek GRACZA: „Nick (poziom…)" — nie dymek przedmiotu z „Właściciel: Nick"
          if (n.querySelector('[class*="item"]') || /t_item/.test(n.getAttribute('data-tip-type') || '')) continue;
          const txt = (n.textContent || '').toLowerCase();
          p = game.others().filter((o) => o.nick && new RegExp(o.nick.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\(\\d').test(txt)).sort((a, b) => b.nick.length - a.nick.length)[0] || null;
          if (p) { tipNode = n; break; }
        }
      }
      // gra potrafi na ułamek sekundy przerysować/odświeżyć swój dymek — chowamy dopiero, gdy dymka nie ma przez 250 ms
      if (p) { lastMapSeen = now(); clearTimeout(graceT); want(p.id, 'map', tipNode); }
      else if (src === 'map') {
        if (now() - lastMapSeen > 250) stop('map');
        else { clearTimeout(graceT); graceT = setTimeout(mapCheck, 260); }
      }
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

// ═══ src/addons/auto_items.js ═══
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
  async function run(src, limit = 0) {
    if (running) return;
    if (game.inBattle()) { toast('Ulepszarka: najpierw skończ walkę', 'warn'); return; }
    dropMaxed();
    if (!slots().length) { toast('Ulepszarka: najpierw wskaż przedmiot do ulepszania', 'warn'); return; }
    const c = net.cmd('enhance');
    if (!c.t || !c.verified) { toast('Ulepszarka: ulepsz raz ręcznie w oknie rzemiosła — wtedy się nauczy', 'warn'); return; }
    let p = plan();
    if (!p.length) { toast('Ulepszarka: brak pasujących przedmiotów', 'info'); return; }
    if (limit) { p = p.slice(0, 1); p[0].list = p[0].list.slice(0, limit); }   // próba: tylko jeden składnik
    const cs = craftState();
    if (!cs) { toast('Ulepszarka: otwórz okno Rzemiosło → zakładka Ulepszanie (bez tego gra wyrzuca)', 'warn'); return; }
    if (cs === 'other') { toast('Ulepszarka: przełącz okno Rzemiosło na zakładkę Ulepszanie', 'warn'); return; }
    if (cfg.confirm) {
      const items = []; p.forEach((o) => o.list.forEach((i) => items.push(el('span', null, i.name, ' ', el('span', { class: 'mp-rar ' + i.rarity }, RAR_PL[i.rarity] || i.rarity), el('span', { class: 'mp-dim' }, ' → ' + o.target.name)))));
      const ok = await confirmBox({ title: 'Ulepszyć teraz?', okText: 'Ulepsz', html: `Zużyję <b>${items.length}</b> przedmiotów:`, items });
      if (!ok) return;
    }
    running = true;
    let n = 0, failed = false;
    const steps = [];
    const saveSteps = () => store.set('up:last', { t: new Date().toISOString(), steps: steps.slice(-20) });
    store.set('up:inflight', now());         // gdyby gra wyrzuciła w trakcie — po powrocie wiemy o tym
    try {
      outer: for (const o of p) {
        // każdy składnik sprawdzony jeszcze raz tuż przed wysłaniem
        const fresh = o.list.filter((i) => { const f = game.itemById(i.id); return f && f.st === 0 && !NEVER.includes(f.rarity) && !targetIds().has(f.id); });
        for (let k = 0; k < fresh.length; k += 16) {
          const part = fresh.slice(k, k + 16);
          const ids = part.map((i) => i.id).join(',');
          // dokładnie tak jak gra: najpierw podgląd, potem ulepszenie; na pytanie gry „Tak" klika Ulepszarka
          const rp = await net.send('enhancePreview', { item: o.target.id, ingredients: ids }, { src: 'Ulepszarka' });
          steps.push({ a: 'preview', item: o.target.id, n: part.length, ok: rp.ok, err: rp.error, resp: short(rp.data) }); saveSteps();
          if (!rp.ok || badResp(rp.data)) { failed = true; if (badResp(rp.data)) { cfg.autoPaused = true; config.save(); } break outer; }
          await sleep(350);
          ask.arm();
          const r = await net.send('enhance', { item: o.target.id, ingredients: ids }, { src: 'Ulepszarka', onResponse: maxResp(o) });
          steps.push({ a: 'progress', item: o.target.id, n: part.length, ok: r.ok, err: r.error, resp: short(r.data) }); saveSteps();
          if (!r.ok || badResp(r.data)) { failed = true; if (badResp(r.data)) { cfg.autoPaused = true; config.save(); } break outer; }
          const gone = await waitGone(part.map((i) => i.id), 6000);
          steps.push({ a: 'gone', n: gone }); saveSteps();
          if (!gone) { failed = true; break outer; }
          n += gone;
          await sleep(600);
        }
      }
    } finally {
      ask.disarm();
      store.del('up:inflight');
      running = false;
      if (cfg.closeCraft) closeCraft();
      dropMaxed();
      net.pushLog({ kind: 'info', src: 'Ulepszarka', msg: `Zużyto ${n} przedmiotów na ulepszanie${failed ? ' (przerwano)' : ''}` });
      if (failed) toast(n ? `Ulepszarka: zużyto ${n}, potem gra przestała przyjmować ulepszenie — przerwałam` : 'Ulepszarka: gra nie przyjęła ulepszenia — przerwałam', 'bad');
      else toast(`Ulepszarka: ulepszono — zużyto ${n} przedmiotów`, 'ok');
      rr();
    }
  }
  /** Odpowiedź serwera z błędem (np. „Błąd wewnętrzny", t:stop) → przerywamy natychmiast. */
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
  const ask = {
    until: 0, mo: null,
    arm() { this.until = now() + 6000; if (!this.mo) { this.mo = new MutationObserver(() => this.scan()); this.mo.observe(document.body, { childList: true, subtree: true }); } this.scan(); },
    disarm() { this.until = 0; },
    scan() {
      if (now() > this.until) return;
      const yesRe = /^\s*(tak|ok|akceptuj|potwierd[źz])\b/i;
      let btns = $$('button, .button, .btn, [class*="button"]').filter((b) => yesRe.test(b.textContent || '') && (b.textContent || '').trim().length < 20 && !b.closest('.mp-glass, .mp-modal-bg'));
      btns = btns.filter((b) => !btns.some((o) => o !== b && b.contains(o)));
      for (const btn of btns) {
        let box = btn.parentElement;
        for (let i = 0; i < 8 && box && !/(ulepsz|sk[łl]adnik|zu[żz]y|zniszcz|na pewno|czy chcesz)/i.test(box.textContent || ''); i++) box = box.parentElement;
        if (!box || box.__mpUp) continue;
        const win = btn.closest('[class*="window"]');
        if (win && /rzemios/i.test(((win.querySelector('[class*="header"], [class*="title"]') || {}).textContent || ''))) continue;   // nigdy przyciski w samym oknie rzemiosła
        if ((box.textContent || '').length > 600) continue;
        box.__mpUp = true;
        box.style.setProperty('visibility', 'hidden', 'important');
        btn.click();
        net.pushLog({ kind: 'info', src: 'Ulepszarka', msg: 'Potwierdzono pytanie gry: ' + (box.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 120) });
      }
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
  let freeBlockSig = '', freeNag = 0;
  const bagSig = () => game.bag().map((i) => i.id).join(',');
  async function freeWatch() {
    if (!cfg || !cfg.enabled || running || cfg.autoPaused || !(Number(cfg.freeAt) > 0) || !slots().length) return;
    if (game.inBattle() || document.querySelector('.mp-modal-bg')) return;
    const free = game.freeBagSlots();
    if (free == null || free > Number(cfg.freeAt)) { freeBlockSig = ''; return; }
    const sig = bagSig();
    if (sig === freeBlockSig) return;          // już próbowaliśmy przy tej zawartości torby
    if (now() - freeNag < 30000 && !net.craftOpen()) return;   // przypomnienie o oknie rzemiosła co 30 s
    freeBlockSig = sig;
    if (!plan().length) return;
    if (craftState() !== 'enh' && craftState() !== 'unknown') { toast(`Ulepszarka: zostało ${free} wolnych miejsc — otwórz Rzemiosło → Ulepszanie, a ulepszę`, 'warn'); freeBlockSig = ''; freeNag = now(); return; }
    net.pushLog({ kind: 'info', src: 'Ulepszarka', msg: `Wolne miejsca w torbie: ${free} — ulepszam` });
    await run('free');
    freeBlockSig = bagSig();
  }

  /** Raport do wysłania twórcy, gdy samouczenie nie zadziała. */
  function report() {
    const E0 = W.Engine || {};
    const r = {
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
    desc: 'Wskaż przedmiot do ulepszania i wybierz, czym go karmić: rzadkość (zwykłe, unikaty, heroiki — nigdy legendy) i typy przedmiotów. Ulepszasz przyciskiem albo klawiszem przy otwartym oknie Rzemiosło → Ulepszanie — to zwykłe ulepszanie z gry, tylko kilka przedmiotów naraz. Każdy typ składników może być przypisany tylko do jednego ulepszanego przedmiotu.',
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
      if (cfg.autoPaused) box.appendChild(el('div', { class: 'mp-card' }, el('div', { class: 'mp-warnc' }, 'Poprzednie ulepszanie zostało przerwane (np. gra wyrzuciła). Ulepszanie przy pełnej torbie jest wstrzymane.'),
        el('div', { class: 'mp-btns' }, el('button', { class: 'mp-btn', onclick: () => { cfg.autoPaused = false; config.save(); rr(); } }, 'Wznów'), el('button', { class: 'mp-btn', onclick: report }, 'Kopiuj raport'))));
      if (Number(cfg.freeAt) > 0) {
        const f = game.freeBagSlots();
        box.appendChild(el('div', { class: 'mp-dim', style: { margin: '4px 2px' } }, f == null ? 'Nie udało się odczytać wolnych miejsc w torbie — kliknij „Kopiuj raport" i wklej w rozmowie.' : `Wolne miejsca w torbie teraz: ${f} · ulepszę przy ${cfg.freeAt} lub mniej`));
      }
      box.appendChild(el('div', { class: 'mp-btns' },
        slots().length ? el('button', { class: 'mp-btn pri', onclick: () => run() }, cfg.key ? `Ulepsz teraz (${cfg.key})` : 'Ulepsz teraz') : null,
        slots().length ? el('button', { class: 'mp-btn', title: 'Ulepsza tylko jednym składnikiem — do bezpiecznego sprawdzenia, czy działa', onclick: () => run('test', 1) }, 'Próba: 1 składnik') : null,
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
      // wyrzuciło z gry w trakcie ulepszania? — automatyczne ulepszanie wstrzymane, dopóki go nie wznowisz
      { const inf = store.get('up:inflight', 0); if (inf && now() - inf < 15 * 60000) { cfg.autoPaused = true; config.save(); } store.del('up:inflight'); }
      // stara komenda z dopisaną odpowiedzią (powodowała wyrzucenie) — usuwamy
      try { const own = (config.data.commands || {}).enhance; if (own && /answer\d+=/.test(own.t || '')) net.resetCmd('enhance'); } catch {}
      setInterval(() => { if (cfg.enabled && !running) dropMaxed(); }, 5000);
      setInterval(freeWatch, 1500);
      MP.ulepszarka = { addTarget, plan, run, craftState, typeOf, closeCraft, report, dropMaxed, enhLevel };
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

// ═══ src/main.js ═══
/* ───────────────────────── main.js ─────────────────────────
 * Start: czekamy aż gra się wczyta, potem uruchamiamy panel.
 */
(async function boot() {
  if (W.__MargoPanelStarted) return;
  W.__MargoPanelStarted = true;
  // dziennik błędów strony (przetrwa odświeżenie / wyrzucenie z gry) — trafia do raportu Ulepszarki
  const logErr = (msg) => { try { const l = store.get('errlog', []); l.unshift({ t: new Date().toISOString(), msg: String(msg).slice(0, 300) }); store.set('errlog', l.slice(0, 15)); } catch {} };
  W.addEventListener('error', (e) => logErr((e.message || '') + ' @ ' + (e.filename || '').split('/').pop() + ':' + (e.lineno || '')));
  W.addEventListener('unhandledrejection', (e) => logErr('promise: ' + (e.reason && (e.reason.message || e.reason))));
  const t0 = now();
  while (!game.ready()) {
    if (now() - t0 > 120000) { console.warn('[laddonz] Nie wykryto gry (nowy interfejs) — panel nie startuje.'); return; }
    await sleep(500);
  }
  await sleep(800);
  const h = game.hero();
  config.load(h && h.nick);
  injectCSS();
  net.install();
  // część obiektów gry powstaje później — ponawiamy podpięcie przez pierwsze 2 minuty
  { let n = 0; const iv = setInterval(() => { net.install(); if (++n > 40) clearInterval(iv); }, 3000); }
  keys.start();
  menus.start();
  battleWatch.start();
  mapWatch.start();
  addons.initAll();
  itemDeco.start();
  ui.start();
  quickbar.start();
  console.log(`%c[laddonz] v${MP.version} gotowy — ${addons.list.length} dodatków. Panel: ${config.data.global.panelKey}`, 'color:#7c5cff;font-weight:bold');
  if (!store.get('welcomed', false)) {
    store.set('welcomed', true);
    toast(`laddonz gotowy — kliknij ikonkę albo naciśnij ${config.data.global.panelKey}`, 'ok', 6000);
  }
})();

MP.version = "1.9.0";
})();
