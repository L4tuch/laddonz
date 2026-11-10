// ==UserScript==
// @name         L4Tools — dodatki (NI)
// @namespace    https://github.com/L4tuch/laddonz
// @version      3.4.0
// @description  Panel dodatków do Margonem (nowy interfejs): Dobijarka, Bratan, Gracze na mapie+, Kto złapie, Let's Cook Together i inne. Jedna akcja = jedno naciśnięcie, automaty domyślnie wyłączone.
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
// @updateURL    https://raw.githubusercontent.com/L4tuch/laddonz/refs/heads/main/dist/laddonz.user.js
// @downloadURL  https://raw.githubusercontent.com/L4tuch/laddonz/refs/heads/main/dist/laddonz.user.js
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
      try { fn(...a); } catch (e) { console.warn('[L4Tools] błąd w obsłudze', ev, e); }
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
    try { localStorage.setItem(this.PREFIX + key, JSON.stringify(val)); } catch (e) { console.warn('[L4Tools] zapis nieudany', e); }
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
    if (!obj || typeof obj !== 'object' || !obj.addons) throw new Error('To nie wygląda na plik konfiguracji L4Tools.');
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
        // okno grupy pokazuje tylko faktycznych członków — jeśli jest, to ono decyduje (dane gry potrafią trzymać
        // zaproszonych, którzy nie przyjęli, albo osoby po wylogowaniu)
        if (domIds.length) return [...new Set(domIds)];
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
        try { b.fn(e); } catch (err) { console.warn('[L4Tools] skrót', b.label, err); }
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
  // potwierdzone w grze (raport): zmiana zestawu = builds&action=updateCurrent&id=<nr>
  eqSet:        { t: 'builds&action=updateCurrent&id={id}', verified: true, destructive: false, label: 'Zmiana zestawu', how: 'Przełącz ręcznie zestaw ekwipunku.' },
  otherEq:      { t: '', destructive: false, label: 'Podgląd EQ gracza', how: 'Kliknij u gracza „Pokaż ekwipunek".' },
  friendAdd:    { t: '', destructive: false, label: 'Dodanie do znajomych', how: 'Dodaj ręcznie kogoś do znajomych.' },
  // potwierdzone w grze (raport z okna rzemiosła): podgląd → ulepszenie → gra zadaje pytanie → odpowiedź „Tak" wysyła sama gra.
  // NIE dopisujemy odpowiedzi z góry (answer…=1) — serwer traktuje to jako błąd i wyrzuca z gry.
  enhancePreview: { t: 'enhancement&action=progress_preview&item={item}&ingredients={ingredients}', verified: true, destructive: false, label: 'Podgląd ulepszenia', how: 'Włóż przedmiot i składnik w oknie ulepszania.' },
  enhanceAnswer: { t: 'enhancement&action=progress&item={item}&ingredients={ingredients}&answer{q}=1', verified: true, destructive: false, label: 'Odpowiedź „Tak" na pytanie przy ulepszaniu', how: '' },
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
    if (!c.t) return { error: `Ta akcja nie jest jeszcze dostępna (${c.label || name}).` };
    if (c.destructive && !c.verified) return { error: `Ta akcja jest zablokowana (${c.label}).` };
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
      } catch (e) { console.warn('[L4Tools] guard error', e); }
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
    try { bus.emit('cmd', t); } catch {}
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
        // komenda ulepszania jest wbudowana — niczego nie zapamiętujemy (dawniej łapało przez pomyłkę podgląd)
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
  wrogowie: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3.5"/><path d="M12 1.5v4M12 18.5v4M1.5 12h4M18.5 12h4"/>',
  pogromca: '<path d="M4 20l7-7M14.5 3.5l6 6-9 9-6-6z"/><path d="M14 4l-2-2M20 10l2 2M3 21l2-2"/>',
  legenda: '<path d="M12 2.5l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16l-5.4 3 1.2-6-4.5-4.2 6.1-.7z"/><path d="M12 6.5v3M9.8 10.2l1.4 1.2M14.2 10.2l-1.4 1.2"/>',
  motywnik: '<path d="M12 3a9 9 0 1 0 0 18c1.2 0 1.8-.8 1.8-1.7 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-.9.8-1.6 1.7-1.6H16a5 5 0 0 0 5-5C21 6.3 17 3 12 3z"/><circle cx="7.5" cy="11" r="1.2"/><circle cx="10.5" cy="7" r="1.2"/><circle cx="15" cy="7.5" r="1.2"/>',
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
#mp-pt{position:fixed;z-index:2147470000;min-width:250px;max-width:340px;border:1px solid;border-radius:6px;font-family:Arimo,Arial,sans-serif;font-size:12.8px;user-select:none;overflow:hidden}
.mp-pt-h{display:flex;align-items:center;gap:8px;padding:6px 8px 5px 10px;border-bottom:1px solid;cursor:move;background:rgba(0,0,0,.18)}
.mp-pt-h b{font-size:1.05em;letter-spacing:.3px;flex:1}
.mp-pt-r{font-size:.85em;opacity:.7}
.mp-pt-x{all:unset;cursor:pointer;width:18px;text-align:center;font-size:16px;line-height:16px;opacity:.7}.mp-pt-x:hover{opacity:1}
.mp-pt-b{padding:4px 8px 8px;max-height:60vh;overflow:auto}
.mp-pt-s{font-size:.8em;text-transform:uppercase;letter-spacing:.8px;margin:6px 0 4px;padding-bottom:2px;border-bottom:1px solid}
.mp-pt-w{margin:4px 0 7px}
.mp-pt-wn{display:flex;align-items:center;gap:8px;font-weight:700;margin-bottom:3px}
.mp-pt-wn > span:first-child{flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mp-pt-hp{width:56px;height:5px;border-radius:3px;background:rgba(0,0,0,.45);overflow:hidden}.mp-pt-hp i{display:block;height:100%;background:linear-gradient(90deg,#c0281e,#ff5a3c)}
.mp-pt-es{display:flex;flex-wrap:wrap;gap:4px}
.mp-pt-e{display:inline-flex;align-items:center;gap:5px;padding:2px 7px 2px 5px;border-radius:10px;box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--c) 60%,transparent);font-size:.92em}
.mp-pt-dot{width:7px;height:7px;border-radius:50%;background:var(--c);box-shadow:0 0 6px var(--c)}
.mp-pt-n{color:var(--c)}
.mp-pt-t{opacity:.85;font-variant-numeric:tabular-nums}
.mp-pt-e.soon{animation:mpPtBlink 1s ease-in-out infinite}
.mp-pt-c{margin:2px 0 4px;padding:3px 7px;border-radius:4px;background:color-mix(in srgb,var(--c) 18%,transparent);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--c) 70%,transparent);color:var(--c);font-size:.95em}
.mp-pt-c.soon{animation:mpPtBlink .7s ease-in-out infinite;font-weight:700}
.mp-pt-u{font-size:.85em;margin:-1px 0 4px 2px}
.mp-pt-cd{font-size:.82em;opacity:.8;font-weight:400;margin-top:1px}
.mp-pt-none{font-size:.88em;font-style:italic}
@keyframes mpPtBlink{0%,100%{filter:none}50%{filter:brightness(1.6);box-shadow:inset 0 0 0 1px var(--c),0 0 10px var(--c)}}
.mp-lg-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px}
.mp-lg-card{position:relative;cursor:pointer;border-radius:12px;padding:8px 8px 10px;border:1px solid rgba(255,255,255,.1);background:rgba(0,0,0,.2);display:flex;flex-direction:column;gap:4px}
.mp-lg-card:hover{border-color:rgba(255,255,255,.3)}.mp-lg-card.on{border-color:var(--c);box-shadow:0 0 0 1px var(--c),0 0 18px color-mix(in srgb,var(--c) 35%,transparent)}
.mp-lg-art{height:70px;border-radius:9px;display:flex;align-items:center;justify-content:center;color:#fff;background:radial-gradient(ellipse at 50% 120%,var(--b),var(--a) 70%);overflow:hidden;position:relative}
.mp-lg-art .mp-lg-ico{filter:drop-shadow(0 0 8px var(--c));color:var(--c);z-index:1}
.mp-lg-art.thor::before{content:'';position:absolute;inset:0;background:linear-gradient(115deg,transparent 46%,rgba(200,225,255,.55) 48%,transparent 50%);animation:mpLgBolt 2.4s infinite}
.mp-lg-art.kasyno::before{content:'';position:absolute;inset:0;background:radial-gradient(circle at 20% 30%,#ffd34d 0 3px,transparent 4px),radial-gradient(circle at 70% 20%,#ffd34d 0 3px,transparent 4px),radial-gradient(circle at 45% 75%,#ffd34d 0 2.5px,transparent 3.5px),radial-gradient(circle at 85% 65%,#ffd34d 0 3px,transparent 4px);animation:mpLgFall 2.2s linear infinite}
.mp-lg-art.disco::before{content:'';position:absolute;inset:-40%;background:conic-gradient(from 0deg,rgba(255,43,214,.35),transparent 12%,rgba(0,229,255,.35) 25%,transparent 37%,rgba(255,230,0,.3) 50%,transparent 62%,rgba(124,255,79,.3) 75%,transparent 87%);animation:mpLgSpin 4s linear infinite}
.mp-lg-art.smoke::before{content:'';position:absolute;inset:0;background:radial-gradient(circle at 30% 70%,rgba(255,255,255,.12),transparent 40%),radial-gradient(circle at 70% 40%,rgba(255,255,255,.1),transparent 45%);animation:mpLgSmoke 3s ease-in-out infinite alternate}
@keyframes mpLgBolt{0%,80%,100%{opacity:0}82%,86%{opacity:1}84%{opacity:.3}}
@keyframes mpLgFall{from{transform:translateY(-70px)}to{transform:translateY(70px)}}
@keyframes mpLgSpin{to{transform:rotate(1turn)}}
@keyframes mpLgSmoke{from{transform:translateY(8px) scale(1)}to{transform:translateY(-8px) scale(1.25)}}
.mp-lg-name{font-weight:700;font-size:13px}
.mp-lg-desc{font-size:11.5px;opacity:.7;line-height:1.35;flex:1}
.mp-lg-test{align-self:flex-start;padding:4px 12px!important;margin-top:4px}
.mp-lg-row{display:flex;align-items:center;gap:10px;margin:6px 0}
.mp-lg-row .mp-range{flex:1}
@property --mpa{syntax:'<angle>';inherits:false;initial-value:0deg}
.mp-lg-hl{position:absolute;inset:0;border-radius:4px;pointer-events:none;z-index:6;--lgc:#8fc4ff}
.mp-lg-hl::before{content:'';position:absolute;inset:0;border-radius:inherit;padding:2px;-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude;animation:mpLgRing 2.2s linear infinite}
.mp-lg-hl::after{content:'';position:absolute;inset:2px;border-radius:3px;overflow:hidden}
@keyframes mpLgRing{to{--mpa:360deg}}
.mp-lg-hl.m-ring{animation:mpLgIn 1.6s ease-in-out infinite}
.mp-lg-hl.m-glow{animation:mpLgOut 1.6s ease-in-out infinite}
.mp-lg-hl.m-pulse{animation:mpLgBg 1.4s ease-in-out infinite}
.mp-lg-hl.m-pulse::before{display:none}
@keyframes mpLgIn{0%,100%{box-shadow:inset 0 0 6px color-mix(in srgb,var(--lgc) 55%,transparent)}50%{box-shadow:inset 0 0 14px var(--lgc)}}
@keyframes mpLgOut{0%,100%{box-shadow:inset 0 0 6px color-mix(in srgb,var(--lgc) 55%,transparent),0 0 3px 0 var(--lgc)}50%{box-shadow:inset 0 0 14px var(--lgc),0 0 7px 1px var(--lgc)}}
@keyframes mpLgBg{0%,100%{background:color-mix(in srgb,var(--lgc) 10%,transparent);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--lgc) 60%,transparent)}50%{background:color-mix(in srgb,var(--lgc) 28%,transparent);box-shadow:inset 0 0 0 1px var(--lgc),inset 0 0 12px var(--lgc)}}
.mp-lg-hl.thor{--lgc:#6fb2ff}.mp-lg-hl.thor::before{background:conic-gradient(from var(--mpa),transparent 0 18%,#4f9dff 26%,#fff 30%,#4f9dff 34%,transparent 42% 68%,#4f9dff 76%,#fff 80%,#4f9dff 84%,transparent 92%);animation-duration:.9s}
.mp-lg-hl.thor::after{background:radial-gradient(circle,rgba(200,230,255,.55),transparent 70%);opacity:0;animation:mpLgThorFl 2.3s steps(1) infinite}
@keyframes mpLgThorFl{0%,100%{opacity:0}31%{opacity:1}33%{opacity:0}35%{opacity:.7}37%{opacity:0}78%{opacity:.9}80%{opacity:0}}
.mp-lg-hl.smoke{--lgc:#ff2a1a}.mp-lg-hl.smoke::before{background:conic-gradient(from var(--mpa),#050505,#ff2a1a 12%,#050505 25%,#2a0505 38%,#ff4a2a 50%,#050505 62%,#8a1208 75%,#050505 88%);animation-duration:3.4s}
.mp-lg-hl.kasyno{--lgc:#ffc83a}.mp-lg-hl.kasyno::before{background:conic-gradient(from var(--mpa),#8a5a05,#ffd34d,#fff6c4 12%,#ffd34d 20%,#b8860b 35%,#ffd34d 55%,#fff6c4 62%,#ffd34d 70%,#8a5a05);animation-duration:1.8s}
.mp-lg-hl.kasyno::after{background:linear-gradient(115deg,transparent 35%,rgba(255,250,220,.6) 50%,transparent 65%) -150% 0/250% 100% no-repeat;animation:mpLgSweep 1.6s ease-in-out infinite}
@keyframes mpLgSweep{0%{background-position:-150% 0}60%,100%{background-position:250% 0}}
.mp-lg-hl.disco{--lgc:#ff4fd8}.mp-lg-hl.disco::before{background:conic-gradient(from var(--mpa),#ff2bd6,#ffe600,#7cff4f,#00e5ff,#a35bff,#ff2bd6);animation-duration:1.2s}
.mp-lg-hl.wlasny::before{background:conic-gradient(from var(--mpa),transparent,var(--lgc) 20%,#fff 25%,var(--lgc) 30%,transparent 50%,var(--lgc) 70%,#fff 75%,var(--lgc) 80%,transparent)}
.c-window.mp-lg-win, .mp-lg-win{animation:mpLgWin 1.3s ease-in-out infinite}
.mp-lg-win.thor{animation:mpLgWinThor 1.6s infinite}
@keyframes mpLgWin{0%,100%{filter:drop-shadow(0 0 6px var(--lgc))}50%{filter:drop-shadow(0 0 18px var(--lgc))}}
@keyframes mpLgWinThor{0%,100%{filter:drop-shadow(0 0 6px #4f9dff)}7%{filter:drop-shadow(0 0 22px #cfe8ff)}10%{filter:drop-shadow(0 0 4px #4f9dff)}13%{filter:drop-shadow(0 0 16px #9fd0ff)}}
.mp-lg-fake{position:fixed!important;left:50%!important;top:46%!important;transform:translate(-50%,-50%);z-index:900!important;pointer-events:none!important}
.mp-lg-fake:not(.mp-lg-fake-tpl){box-sizing:border-box;min-width:300px;border-style:solid;border-width:32px 20px;display:block!important}
.c-window.mp-lg-fake:not(.mp-lg-fake-tpl) > .content{position:relative!important;inset:auto!important;padding:4px 0 8px;background-color:rgb(24,16,12)}
.mp-lg-fake:not(.mp-lg-fake-tpl) .header-label-positioner{position:absolute;left:0;right:0;top:-28px;display:flex;justify-content:center}
.mp-lg-fake:not(.mp-lg-fake-tpl) .header-label{position:relative;padding:4px 26px;min-width:60px;text-align:center;color:#e6d6bf}
.mp-lg-fake:not(.mp-lg-fake-tpl) .close-button-corner-decor{position:absolute;right:-20px;top:-32px;width:51px;height:52px}
.mp-lg-fake-b{display:flex;gap:6px;justify-content:center;padding:6px}
.mp-lg-fake-card{position:relative;display:flex;flex-direction:column;align-items:center;gap:5px;padding:8px 6px 6px;border:1px solid #6b2a1a;background:#3a1a10;width:64px;box-sizing:border-box}
.mp-lg-fake-slot{width:40px;height:40px;display:flex;align-items:center;justify-content:center;background-color:#281d15;box-shadow:inset 0 0 0 1px #000}
.mp-lg-fake-item{width:32px;height:32px;border-radius:2px;background:radial-gradient(circle at 40% 35%,color-mix(in srgb,var(--rc) 70%,#fff),color-mix(in srgb,var(--rc) 55%,#000));box-shadow:inset 0 0 0 2px var(--rc)}
.mp-lg-fake-want{font-size:11.5px;color:#e6d6bf}
.mp-lg-fake-btns{display:flex;gap:4px}.mp-lg-fake-btns .button{min-width:22px;height:22px;line-height:22px;text-align:center;padding:0!important;font-size:12px}
.mp-lg-fake-f{position:absolute!important;left:-20px;right:-20px;bottom:-32px;height:32px;display:flex!important;align-items:center;justify-content:space-between;gap:10px;padding:0 26px;box-sizing:border-box;color:#e6d6bf;font-size:12.8px}
.mp-lg-fake-f .interface-element-bottom-bar-background-stretch{position:absolute;inset:0;z-index:-1;border-style:solid;border-width:0 20px}
.mp-lg-fake-f .button{padding:0 12px;height:24px;line-height:24px}
.mp-lg-glow{--lgg:#ff4a2a;animation:mpLgGlow 1.4s ease-in-out infinite!important;border-radius:3px}
@keyframes mpLgGlow{0%,100%{box-shadow:0 0 5px 1px color-mix(in srgb,var(--lgg) 75%,transparent),inset 0 0 8px color-mix(in srgb,var(--lgg) 55%,transparent)}50%{box-shadow:0 0 11px 3px var(--lgg),inset 0 0 14px color-mix(in srgb,var(--lgg) 85%,transparent)}}
.mp-lg-fbolt{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:2}
.item.mp-lg-fx-fade{animation:mpLgFade 3s ease-in-out infinite}
@keyframes mpLgFade{0%,100%{opacity:1;filter:drop-shadow(0 0 4px #ff2a1a)}45%,55%{opacity:.12;filter:blur(2px) drop-shadow(0 0 8px #000)}}
.item.mp-lg-fx-hue{animation:mpLgHue 2.2s linear infinite}
@keyframes mpLgHue{0%{filter:drop-shadow(0 0 6px #ff2bd6) brightness(1.15)}25%{filter:drop-shadow(0 0 6px #00e5ff) brightness(1.15)}50%{filter:drop-shadow(0 0 6px #ffe600) brightness(1.15)}75%{filter:drop-shadow(0 0 6px #7cff4f) brightness(1.15)}100%{filter:drop-shadow(0 0 6px #ff2bd6) brightness(1.15)}}
.item.mp-lg-fx-glow, .item.mp-lg-fx-pop{animation:mpLgItemGlow 1.6s ease-in-out infinite}
@keyframes mpLgItemGlow{0%,100%{filter:drop-shadow(0 0 3px var(--lgg))}50%{filter:drop-shadow(0 0 8px var(--lgg)) brightness(1.12)}}
.item.mp-lg-fx-bolts{animation:mpLgItemBolt 2.1s steps(1) infinite}
@keyframes mpLgItemBolt{0%,100%{filter:drop-shadow(0 0 3px #6fb2ff)}20%{filter:drop-shadow(0 0 9px #cfe8ff) brightness(1.4)}23%{filter:drop-shadow(0 0 3px #6fb2ff)}61%{filter:drop-shadow(0 0 8px #cfe8ff) brightness(1.3)}64%{filter:drop-shadow(0 0 3px #6fb2ff)}}
.mp-lg-pop{position:fixed;z-index:2147483002;pointer-events:none;perspective:300px}
.mp-mt-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px}
.mp-mt-card{cursor:pointer;border-radius:10px;padding:6px;border:1px solid rgba(255,255,255,.1);background:rgba(0,0,0,.18)}
.mp-mt-card:hover{border-color:rgba(255,255,255,.3)}.mp-mt-card.on{border-color:var(--mp-accent);box-shadow:0 0 0 1px var(--mp-accent)}
.mp-mt-stage{height:84px;border-radius:7px;display:flex;align-items:center;justify-content:center;background-color:#141312}
.mp-mt-stage.domyslny{background:linear-gradient(160deg,#4a3826,#2e2216)}
.mp-mt-win{width:84%;border-radius:4px;display:flex;flex-direction:column;gap:3px;padding:5px 7px;box-sizing:border-box;font:10px/1.2 Arial,sans-serif}
.mp-mt-win i{font-style:normal;font-weight:700;font-size:11px}.mp-mt-win em{font-style:normal;align-self:flex-start;padding:1px 8px;font-size:9.5px;border-radius:2px}
.mp-mt-win.domyslny{background:#2b2116;border:3px solid #8a6a3a;color:#e8d3a3}.mp-mt-win.domyslny i{color:#e8c47a}.mp-mt-win.domyslny em{background:linear-gradient(#335e2a,#264a1f);border:1px solid #4f7e40;color:#fff}

.mp-mt-name{text-align:center;font-size:11.5px;margin-top:5px}.mp-mt-desc{text-align:center;font-size:10.5px;opacity:.6;margin-top:2px}
.mp-mt-own{display:flex;flex-direction:column;gap:6px;margin-bottom:8px}.mp-mt-row{display:flex;align-items:center;gap:6px}
.mp-setq{outline:2px solid var(--mp-accent)!important;outline-offset:1px;border-radius:3px;box-shadow:0 0 8px var(--mp-accent)!important}
.mp-rar{display:inline-block;font-size:10.5px;padding:0 6px;border-radius:6px;margin-left:4px;background:rgba(255,255,255,.1)}
.mp-rar.unique{background:#c9a21a33;color:#ffd75e}.mp-rar.heroic{background:#2f7bff33;color:#7fb2ff}.mp-rar.legendary{background:#ff7a1a33;color:#ffa45e}.mp-rar.upgraded{background:#c94cff33;color:#e19bff}.mp-rar.common{color:#ddd}
.mp-upbar{height:4px;border-radius:3px;background:rgba(255,255,255,.08);margin-top:5px;overflow:hidden}.mp-upbar i{display:block;height:100%;background:var(--mp-accent)}
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

  ORDER: ['napad', 'wakeup', 'bratan', 'wrogowie', 'ktotu', 'ktozlapie', 'cook', 'podpis', 'pokazeq', 'jakibon', 'taxi', 'autof', 'szybka', 'ulepszarka', 'minichat', 'legenda', 'pogromca', 'motywnik'],

  initAll() {
    this.list.sort((a, b) => this.ORDER.indexOf(a.id) - this.ORDER.indexOf(b.id));
    for (const a of this.list) {
      const cfg = config.addon(a.id, Object.assign({ enabled: false }, a.defaults));
      for (const k of a.keys || []) {
        keys.bind({ label: `${a.name}: ${k.label}`, get: () => (cfg.enabled ? cfg[k.key] || '' : ''), fn: k.fn });
      }
      try { a.init && a.init(cfg); } catch (e) { console.warn('[L4Tools] init', a.id, e); }
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
function confirmBox({ title, html, items, okText = 'Potwierdź', cancelText = 'Anuluj', danger = false, countdown = 0, width = null }) {
  return new Promise((resolve) => {
    const body = el('div', { class: 'mp-wbody' });
    if (html) body.appendChild(el('div', { html }));
    if (items && items.length) body.appendChild(el('ul', { style: { margin: '8px 0 0', paddingLeft: '18px' } }, items.map((t) => el('li', null, t))));
    const ok = el('button', { class: 'mp-btn ' + (danger ? 'bad' : 'pri') }, okText);
    const cancel = el('button', { class: 'mp-btn' }, cancelText);
    const bg = el('div', { class: 'mp-modal-bg' }, el('div', { class: 'mp-modal mp-glass', style: width ? { width } : null }, el('h3', null, title), body, el('div', { class: 'mp-btns', style: { justifyContent: 'flex-end' } }, cancel, ok)));
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
  providers: { player: [], item: [], build: [] },
  last: null,            // { type, id, t }
  hooked: false,
  otherHooked: false,

  add(type, fn) { this.providers[type].push(fn); },

  entriesFor(type, id, menu) {
    const out = [];
    for (const p of this.providers[type]) {
      try { (p(id, menu) || []).forEach((e) => e && out.push(e)); } catch (e) { console.warn(e); }
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
        } catch (e) { console.warn('[L4Tools] menu', e); }
        const res = f.apply(this, args);
        try { const mm = args.find((a) => Array.isArray(a)); if (mm) bus.emit('popup:shown', mm.map((m) => self.entryParts(m).label).filter(Boolean)); } catch {}
        return res;
      };
      w.__mpMenu = true;
      try { I[n] = w; this.hooked = true; this.hookName = n; this.origPopup = { obj: I, fn: f }; } catch {}
    }
  },

  inject(menu, args = []) {
    // 0) świeży prawy klik na numerze zestawu
    let tgt = this.last && this.last.type === 'build' && now() - this.last.t < 1500 ? this.last : null;
    // 1) nick w argumentach menu (tytuł menu to nick gracza) — najpewniejsze
    if (!tgt) tgt = this.playerFromArgs(args);
    // 2) ostatni cel kliknięcia (hak gracza / dymek pod kursorem)
    if (!tgt && this.last && now() - this.last.t < 1500) tgt = this.last;
    if (!tgt) tgt = this.guessPlayerFromMenu(menu);
    if (!tgt) return;
    const add = this.entriesFor(tgt.type, tgt.id, menu);
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

  /** Napisy w menu gracza (bez pokazywania menu). */
  async playerMenuLabels(id) {
    const raw = game.otherRaw(id);
    if (!raw || !this.hooked) return [];
    const fn = ['oncontextmenu', 'createMenu'].map((n) => raw[n]).find((f) => typeof f === 'function');
    if (!fn) return [];
    const got = new Promise((res) => { this.capturing = res; setTimeout(() => { if (this.capturing === res) { this.capturing = null; res(null); } }, 400); });
    try { fn.call(raw, { clientX: 0, clientY: 0, pageX: 0, pageY: 0, button: 2, preventDefault() {}, stopPropagation() {}, stopImmediatePropagation() {}, target: document.body }); } catch { this.capturing = null; return []; }
    const menu = await got;
    return menu ? menu.map((m) => this.entryParts(m).label.trim()).filter(Boolean) : [];
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

  /**
   * Menu wyglądające dokładnie jak w grze: rysuje je sama gra (jej funkcja menu), więc czcionka i styl są
   * standardowe. Gdyby się nie dało — nasze menu w stylu gry.
   */
  showGame(x, y, entries, title) {
    const o = this.origPopup;
    if (o && entries.length) {
      setTimeout(() => {
        try {
          const ev = { clientX: x, clientY: y, pageX: x, pageY: y, x, y, button: 2, which: 3, type: 'contextmenu', target: document.body, currentTarget: document.body, preventDefault() {}, stopPropagation() {} };
          o.fn.call(o.obj, entries.map((e) => [e.label, () => { try { e.fn(); } catch (err) { console.warn(err); } }]), ev);
          bus.emit('popup:shown', entries.map((e) => e.label));
          return;                     // gra przyjęła menu — nie pokazujemy drugiego
        } catch {}
        this.showOwn(x, y, entries, title);
      }, 60);
      return;
    }
    this.showOwn(x, y, entries, title);
  },

  /** Własne menu panelu (zapas). */
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
 *   Dodatki · Ogólne
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
    const b = el('div', { id: 'mp-launcher', class: 'mp-glass', title: `L4Tools (${config.data.global.panelKey || 'brak skrótu'})`, style: { left: p.x + 'px', top: p.y + 'px' } }, icon('logo', 24));
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
    const tabs = [['addons', 'grid', 'Dodatki'], ['general', 'gear', 'Ogólne']];
    if (!['addons', 'general'].includes(this.tab)) this.tab = 'addons';
    const head = el('div', { class: 'mp-head' },
      el('div', { class: 'mp-tile', style: { background: grad([config.data.global.accent, '#3fa2ff']) } }, icon('logo', 18)),
      el('div', null, el('div', { class: 'mp-title' }, 'L4Tools'), el('div', { class: 'mp-sub' }, this.subtitle())),
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
        html: 'Ten dodatek może <b>zużywać przedmioty</b>. Przed każdą operacją zobaczysz listę przedmiotów do potwierdzenia.',
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
            null),
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
      for (const s of a.settings.filter((x) => !x.adv && x.group !== 'Zaawansowane')) (groups[s.group || 'Ustawienia'] = groups[s.group || 'Ustawienia'] || []).push(s);
      for (const [g, arr] of Object.entries(groups)) {
        const card = el('div', { class: 'mp-card' }, el('h3', null, g));
        arr.forEach((s) => { if (s.adv) return; if (!s.show || s.show(cfg)) card.appendChild(field(s, cfg, () => { config.save(); a.onChange && a.onChange(s.key, cfg); if (s.rerender) rerender(); })); });
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
      { key: 'panelKey', type: 'key', label: 'Skrót otwierający panel' },
      { key: 'perCharacter', type: 'bool', label: 'Osobne ustawienia dla każdej postaci', hint: 'Zmiana zadziała po odświeżeniu gry.' },
      { key: 'theme', type: 'custom', render: (obj, onSave) => el('div', { class: 'mp-field', style: { flexDirection: 'column', alignItems: 'stretch' } },
        el('div', { class: 'lb' }, 'Motyw okien'),
        el('div', { class: 'mp-themes' }, Object.entries(this.THEMES).map(([k, t]) => el('div', {
          class: 'mp-theme' + ((obj.theme || 'fiolet') === k ? ' on' : ''), style: { '--t-accent': t.accent, background: `rgba(${t.bg},.85)` },
          onclick: () => { obj.theme = k; onSave(); this.renderAll(); quickbar.draw(); },
        }, el('div', { class: 'sw', style: { background: `linear-gradient(135deg, ${t.accent}55, rgba(${t.bg},1))` } }, el('i')), el('div', { class: 'nm' }, t.name))))) },
      { key: 'glass', type: 'range', label: 'Przezroczystość tła', min: 0.2, max: 0.95, step: 0.05 },
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
    M.appendChild(el('div', { class: 'mp-card' }, el('h3', null, 'Coś nie działa?'),
      el('div', { class: 'mp-dim', style: { marginBottom: '8px' } }, 'Skopiuj raport i wklej go w rozmowie z twórcą — są w nim ostatnie ruchy dodatków i odpowiedzi gry (bez haseł i danych konta).'),
      el('div', { class: 'mp-btns' }, el('button', { class: 'mp-btn', onclick: () => copyReport() }, 'Kopiuj raport'))));
    M.appendChild(el('div', { class: 'mp-dim', style: { fontSize: '11.5px' } }, `L4Tools v${MP.version}. Kod otwarty — sprawdź, co robi każdy dodatek, zanim go włączysz.`));
  },
};

/** Wspólny raport dla twórcy (wszystkie dodatki): log, odpowiedzi gry, błędy strony, dane Ulepszarki. */
function copyReport() {
  let r = {};
  try {
    r = {
      wersja: MP.version, czas: new Date().toISOString(),
      wlaczone: addons.list.filter((a) => addons.on(a.id)).map((a) => a.name),
      log: net.log.slice(0, 40).map((x) => ({ t: x.t, k: x.kind, src: x.src, task: x.task, msg: x.msg })),
      komendyGry: (net.recent || []).slice(0, 40),
      bledyStrony: store.get('errlog', []),
      ulepszarka: MP.ulepszarka && MP.ulepszarka.reportData ? MP.ulepszarka.reportData() : null,
      pokazEq: MP.pokazEq && MP.pokazEq.lastDebug || null,
      szybka: MP.szybka ? MP.szybka.debug() : null,
      wrogowie: MP.wrogowie ? MP.wrogowie.debug() : null,
      oknoLupow: MP.legenda && MP.legenda.debug ? MP.legenda.debug() : null,
      klasyUI: (() => { const c = new Map(); document.querySelectorAll('body *').forEach((n) => { if (typeof n.className !== 'string' || n.closest('.mp-glass')) return; n.className.split(/\s+/).forEach((k) => k && !/^mp-|^mt-/.test(k) && c.set(k, (c.get(k) || 0) + 1)); }); return [...c].sort((a, b) => b[1] - a[1]).slice(0, 300).map(([k]) => k); })(),
    };
  } catch (e) { r.blad = String(e); }
  const txt = JSON.stringify(r, null, 1);
  const fallback = () => { const t = el('textarea', { style: { position: 'fixed', left: '-9999px' } }); t.value = txt; document.body.appendChild(t); t.select(); try { document.execCommand('copy'); } catch {} t.remove(); };
  try { navigator.clipboard.writeText(txt).catch(fallback); } catch { fallback(); }
  toast('Raport skopiowany — wklej go w rozmowie', 'ok');
}

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
    this.bar.appendChild(el('div', { class: 'mp-qtile mp-qmore', 'data-name': 'Pełny panel L4Tools', onclick: () => ui.toggle() }, icon('logo', 15)));
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
  const S = { last: 0, protectedUntil: {}, tried: {}, refused: {}, lock: null, timer: null, said: {} };
  /** Komunikat o danym graczu najwyżej raz na `ms` (żeby nie zasypać ekranu przy ponawianiu). */
  const say = (key, msg, ms = 15000, type = 'warn') => { const t = now(); if (S.said[key] > t) return; S.said[key] = t + ms; toast(msg, type); };
  /** Tekst odpowiedzi serwera (ostrzeżenie/komunikat), jeśli jest. */
  function respText(d) {
    if (!d) return '';
    const out = [];
    const walk = (v, depth) => {
      if (depth > 3 || v == null) return;
      if (typeof v === 'string') { if (/[a-ząćęłńóśźż]{3}/i.test(v) && v.length < 200 && v !== 'ok') out.push(v); return; }
      if (Array.isArray(v)) v.forEach((x) => walk(x, depth + 1));
      else if (typeof v === 'object') for (const k of ['w', 'alert', 'msg', 'm', 'e', 'message', 'text', 'info']) if (k in v) walk(v[k], depth + 1);
    };
    walk(d, 0);
    return out.join(' ').replace(/<[^>]+>/g, '').trim();
  }
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
        // odmowa serwera (np. żółta mapa: „Przeciwnik nie zgadza się na walkę") — nie ponawiamy w kółko i MÓWIMY o tym
        let txt = ''; try { txt = JSON.stringify(data || {}); } catch {}
        const said = respText(data);
        if (/nie zgadza|nie mo[żz]esz|nie mo[żz]na|odmówi|odmowa/i.test(txt)) {
          S.refused[p.id] = now() + 30000;
          say('ref' + p.id, `Dobijarka: ${p.nick} — ${said || 'nie zgadza się na walkę'}`, 30000);
          return;   // cel zostaje zapamiętany — spróbujemy znowu za 30 s
        }
        const sec = parseProtection(data);
        if (sec) {
          S.protectedUntil[p.id] = now() + sec * 1000;
          say('prot' + p.id, `Dobijarka: ${p.nick} ma ochronę jeszcze ${sec} s — zaatakuję, gdy minie`, sec * 1000);
          return;
        }
        // każdy inny komunikat gry przy ataku (np. „Nie możesz atakować na tej mapie") — pokazujemy
        if (said && !game.inBattle()) say('msg' + p.id + said, `Dobijarka: ${p.nick} — ${said}`, 20000);
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
      if (p && dist(h, p) <= RANGE && !allowed(p)) { say('br' + p.id, `Dobijarka: ${p.nick} jest chroniony przez Bratana — nie zaatakuję`, 60000); return; }
      if (p && dist(h, p) <= RANGE && !(S.refused[p.id] > now())) { attack(p); return; }
      if (p) return;              // cel jest na mapie, ale daleko — czekamy
      // celu nie ma na mapie — w międzyczasie (gdy włączona) atakuje innych w zasięgu
    }
    // 2) dodatek włączony → każdy w zasięgu
    if (!cfg.enabled) return;
    const t = now();
    for (const p of game.others()) if (dist(h, p) <= RANGE && inLvl(p) && !allowed(p)) say('br' + p.id, `Dobijarka: pomijam ${p.nick} — chroniony przez Bratana`, 120000, 'info');
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
    id: 'napad', name: 'Dobijarka', icon: 'napad', color: ['#ff5d7a', '#b8325a'],
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
      { adv: true, group: 'Zaawansowane', key: 'gameSelectors', type: 'text', label: 'Selektor komunikatów gry', hint: 'Domyślnie .big-messages .message' },
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
      { adv: true, key: 'selector', type: 'text', label: 'Selektor okna czatu', hint: 'Domyślnie .new-chat-window — zmień tylko, jeśli gra zmieni wygląd czatu.' },
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
    desc: 'Lista graczy na mapie z filtrami (nick, klan, poziom, profesja, relacja) i zapisywanymi zestawami. Tryb minimalny pokazuje samą listę po filtrach. Kliknij gracza, żeby zobaczyć jego kartę: EQ, Dobij, zaproszenie do grupy i znajomych, Bratan.',
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
    const r = await net.send('partyInvite', { id: p.id }, { src: 'Let\'s Cook' });
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
      toast(why.length ? `Let's Cook: ${why.join('; ')}` : total ? `Let's Cook: nikt z ${total} graczy na mapie nie pasuje do ustawień` : 'Let\'s Cook: brak graczy na mapie', 'warn', 2500);
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
  let forced = false;
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
    new MutationObserver(debounce(mapCheck, 30)).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class'] });

    /* strażnik: podgląd nie może „zawisnąć" — gdy kursor nie jest już nad graczem, chowamy */
    let lostSince = 0;
    setInterval(() => {
      if (!tip || tip.style.display === 'none' || forced) { lostSince = 0; return; }
      let ok = false;
      if (src === 'list') { const at = document.elementFromPoint(rmx, rmy); ok = !!(at && (listRow(at) || at.closest('#mp-eqtip'))); }
      else if (src === 'map') ok = !!(tipNode && tipNode.isConnected && isVisible(tipNode));
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
    desc: 'Po najechaniu na gracza — na mapie albo na liście graczy — zamiast zwykłego dymka gry pokazuje rozszerzony: informacje o graczu, jego postać z outfitem, ekwipunek ułożony jak w grze i podsumowanie bonusów legendarnych. Zwykłe „Pokaż ekwipunek" z menu gry działa dalej normalnie.',
    defaults: { enabled: false, mapHover: true, listHover: true, needShift: false, cacheSec: 300, tipSelector: '.tip-wrapper.normal-tip' },
    notes: () => [{ type: 'info', text: 'Pierwszy podgląd gracza trwa tyle, ile odpowiedź serwera (jak „Pokaż ekwipunek" w grze). Kolejne przez 5 minut są natychmiastowe.' }],
    settings: [
      { key: 'mapHover', type: 'bool', label: 'Najechanie na gracza na mapie' },
      { key: 'listHover', type: 'bool', label: 'Najechanie na gracza na liście graczy (w grze i w L4Tools)' },
      { key: 'needShift', type: 'bool', label: 'Na mapie tylko z wciśniętym Shift' },
      { adv: true, key: 'cacheSec', type: 'number', label: 'Pamiętaj wynik przez (s)', min: 10, max: 1800 },
      { adv: true, key: 'tipSelector', type: 'text', label: 'Selektor dymka gracza w grze', hint: 'Domyślnie .tip-wrapper.normal-tip' },
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
    desc: 'Włączony: od razu przyjmuje przywołanie drużyny („…przyzywa do siebie swoją drużynę!") — okno z pytaniem w ogóle się nie pokazuje.',
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
    desc: 'Włącz/wyłącz. Gdy jest włączony, każda walka od razu przechodzi na szybką walkę — np. przy kolosie, gdy odchodzisz od komputera, a reszta nie musi czekać na Twoją turę.',
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
    desc: 'Prawy klik na przedmiocie → „Użyj po walce": zaraz po zakończeniu walki przedmiot zostanie użyty (teleporty, mikstury, przywołania…). Przedmiot czekający na użycie ma w rogu ikonkę zegara. Prawy klik na ikonie grupy → „Rozwiąż grupę po walce". Prawy klik na numerze zestawu przy ekwipunku → wybierz zestaw, który ma się założyć zaraz po walce.',
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
    desc: 'Wskaż przedmiot do ulepszania i wybierz, czym go karmić: rzadkość (zwykłe, unikaty, heroiki — nigdy legendy) i typy przedmiotów. Ulepszasz przyciskiem albo klawiszem (okno Rzemiosło → Ulepszanie otwiera się samo) — to zwykłe ulepszanie z gry, tylko kilka przedmiotów naraz. Każdy typ składników może być przypisany tylko do jednego ulepszanego przedmiotu.',
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

// ═══ src/addons/wrogowie.js ═══
/* ───────── Wrogowie na mapie ─────────
 * Na czerwonych mapach (pełne PvP) pokazuje komunikat gry „Wróg na mapie: Nick", gdy pojawi się wróg:
 * gracz oznaczony jako wróg, członek wrogiego klanu, a opcjonalnie także gracze neutralni (bez relacji).
 * Nigdy: znajomi, klan, sojusznicy, członkowie grupy i gracze chronieni w Bratanie.
 * Ten sam gracz znowu dopiero, gdy zniknie z mapy i wróci (najwcześniej po minucie).
 */
(() => {
  let cfg, timer = null, mapId = 0;
  const seen = new Map();      // id → ostatnio widziany (ms)
  const told = new Map();      // id → kiedy powiadomiono (ms)

  /** Czerwona mapa = pełne PvP. Gra opisuje typ mapy liczbą (pole pvp). */
  function isRed() {
    const m = game.mapInfo();
    return (cfg.pvpCodes || [2]).map(Number).includes(Number(m.pvp));
  }
  function protectedByBratan(p) {
    try { const b = addons.cfg('bratan'); return !!(b && b.enabled && (b.nicks || []).some((n) => String(n).toLowerCase() === p.nick.toLowerCase())); } catch { return false; }
  }
  function isEnemy(p, party) {
    if (p.isFriend || p.isClan || p.isAlly || party.has(p.id) || protectedByBratan(p)) return false;
    const rel = String(p.relation || '');
    if (rel === '3') return !!cfg.personal;                  // osobisty wróg
    if (rel === '6' || rel === '8') return !!cfg.enemyClans;  // wrogi klan / frakcja
    if (p.isEnemyTagged) return true;
    return !!cfg.neutral;                                     // brak relacji — „random"
  }
  /** Komunikat gry w wybranym kolorze (tylko ten komunikat, inne zostają bez zmian). */
  function notify(text) {
    toast(text, 'warn', 5000);
    const paint = () => {
      const n = $$('.big-messages .message, .message, .mp-toast').reverse().find((x) => (x.textContent || '').trim() === text && !x.__mpWr);
      if (!n) return false;
      n.__mpWr = true;
      n.style.setProperty('color', cfg.color || '#ff4b3e', 'important');
      $$('*', n).forEach((c) => c.style.setProperty('color', cfg.color || '#ff4b3e', 'important'));
      return true;
    };
    if (!paint()) { requestAnimationFrame(() => { if (!paint()) setTimeout(paint, 60); }); }
  }
  function tick() {
    if (!cfg.enabled || !game.ready()) return;
    const m = game.mapInfo();
    if (m.id !== mapId) { mapId = m.id; seen.clear(); told.clear(); }
    if (!isRed()) return;
    const t = now();
    const party = new Set(game.partyMembers().map(Number));
    const fresh = [];
    for (const p of game.others()) {
      if (!isEnemy(p, party)) continue;
      const wasHere = seen.has(p.id) && t - seen.get(p.id) < 5000;
      seen.set(p.id, t);
      if (wasHere) continue;
      if (told.has(p.id) && t - told.get(p.id) < 60000) continue;
      told.set(p.id, t);
      fresh.push(p);
    }
    fresh.slice(0, 5).forEach((p) => notify(`Wróg na mapie: ${p.nick}${cfg.showLvl ? ` (${p.lvl}${p.prof || ''})` : ''}${p.clanName ? ` [${p.clanName}]` : ''}`));
    if (fresh.length > 5) notify(`Wrogów na mapie: jeszcze ${fresh.length - 5}`);
  }

  defineAddon({
    id: 'wrogowie', name: 'Wrogowie na mapie', icon: 'wrogowie', color: ['#ff6a5c', '#c0392b'],
    desc: 'Na czerwonych mapach pokazuje komunikat „Wróg na mapie: Nick [Klan]", gdy pojawi się wróg. Znajomi, klan, sojusznicy, grupa i gracze z listy Bratana nigdy nie są zgłaszani.',
    defaults: { personal: true, enemyClans: true, neutral: false, showLvl: false, pvpCodes: [2], color: '#ff4b3e' },
    settings: [
      { key: 'enemyClans', type: 'bool', label: 'Wrogie klany' },
      { key: 'personal', type: 'bool', label: 'Gracze oznaczeni jako wrogowie' },
      { key: 'neutral', type: 'bool', label: 'Gracze neutralni (bez relacji) też jako wrogowie' },
      { key: 'showLvl', type: 'bool', label: 'Pokazuj poziom i profesję przy nicku' },
      { key: 'color', type: 'color', label: 'Kolor czcionki powiadomienia' },
    ],
    init(c) {
      cfg = c;
      timer = setInterval(tick, 1000);
      MP.wrogowie = { debug: () => ({ mapa: game.mapInfo(), czerwona: isRed() }) };
    },
    onChange(k) { if (k === 'color') notify('Wróg na mapie: Przykład [Wrogi Klan]'); },
    onToggle(on) { if (on) { seen.clear(); told.clear(); mapId = 0; } },
  });
})();

// ═══ src/addons/motywnik.js ═══
/* ───────── Motywnik ─────────
 * Style całego interfejsu gry dopasowane do jego budowy (klasy NI: c-window/border-window, interface-element-*,
 * widget-button, button.small.*, card/tabs-nav, main-column, top/bottom positioner…).
 *
 * Zasady „jak grafik":
 *   • nic nie zmienia rozmiarów — tylko kolory, tła, obrazki ramek (ta sama geometria cięcia) i krój pisma
 *     o węższych/zbliżonych proporcjach (Roboto zamiast Arimo), bez zmiany wielkości liter;
 *   • grafiki gry (ornamenty pasków, kafelki slotów, tekstury) są PRZEBARWIANE, a nie wyrzucane — zostaje ich
 *     rysunek, zmienia się kolorystyka;
 *   • ramki okien i panele (border-image) są rysowane od nowa w SVG o identycznych wymiarach cięcia;
 *   • ikony, przedmioty, postacie i mapa — bez zmian.
 */
(() => {
  let cfg, styleEl = null, fontEl = null, mo = null;
  const svg = (s) => `url("data:image/svg+xml,${encodeURIComponent(s)}")`;
  const grain = svg(`<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='3' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 .04 0'/></filter><rect width='100%' height='100%' filter='url(#n)'/></svg>`);

  /* ── palety ── */
  const THEMES = {
    domyslny: { name: 'Domyślny', desc: 'Klasyczny interfejs gry, bez zmian.', none: true },
    dark: {
      m: ['#eef1f5', '#9aa3b0', '#3b414b'], orn: 'rivet', xp: ['#c97a22', '#f0a648'], name: 'Dark Theme', desc: 'Grafit i czerń, chłodna stal, spokojne światło.',
      bg0: '#0a0b0d', bg1: '#121317', bg2: '#1a1c21', line: '#30343c', line2: '#21242a', a1: '#cfd5df', a2: '#7f8897', text: '#e6e8ec', text2: '#9ba1ab',
      glow: 'rgba(200,212,232,.10)', edge: 'rgba(160,175,200,.10)', tint: 'grayscale(1) brightness(.55) contrast(1.1)', blend: '#1b1c1f',
      btn: ['#2b2e35', '#1b1d22'], btnLine: '#3d424c', btnText: '#f1f3f6', head: '"Roboto", Arial, sans-serif', fonts: ['Roboto:wght@400;500;700'],
    },
    zorza: {
      m: ['#e3f8ff', '#86bfe6', '#27466e'], orn: 'star', xp: ['#119682', '#4ff5d2'], star: '#f2fdff', name: 'Zorza', desc: 'Nocny granat i świecące pasma zorzy: turkus, błękit, fiolet.',
      bg0: '#050b16', bg1: '#0a1426', bg2: '#10203a', line: '#22426a', line2: '#152c4a', a1: '#2ef2c4', a2: '#8a5cff', a3: '#3fa9ff', text: '#e6f3ff', text2: '#8fb0cc',
      glow: 'rgba(46,242,196,.30)', edge: 'rgba(63,169,255,.22)', tint: 'grayscale(1) brightness(.5) sepia(1) hue-rotate(170deg) saturate(2.4)', blend: '#0e2340',
      btn: ['#13405a', '#0b2539'], btnLine: 'rgba(46,242,196,.55)', btnText: '#e2fff8', head: '"Exo 2", "Roboto", Arial, sans-serif', fonts: ['Roboto:wght@400;500;700', 'Exo+2:wght@600;700'],
    },
    neon: {
      m: ['#ffe0f8', '#d65bdc', '#4a1660'], orn: 'diamond', xp: ['#b0129a', '#ff5ce4'], name: 'Neon', desc: 'Ciemny fiolet, różowy i turkusowy neon z poświatą.',
      bg0: '#07040f', bg1: '#0e0819', bg2: '#170d29', line: '#4a2470', line2: '#25133e', a1: '#ff2bd6', a2: '#00e5ff', text: '#f5ecff', text2: '#ab9cc9',
      glow: 'rgba(255,43,214,.38)', edge: 'rgba(0,229,255,.28)', tint: 'grayscale(1) brightness(.45) sepia(1) hue-rotate(245deg) saturate(3)', blend: '#1d0f33',
      btn: ['#251238', '#140a22'], btnLine: '#ff2bd6', btnText: '#ffe8fb', head: '"Rajdhani", "Roboto", Arial, sans-serif', fonts: ['Roboto:wght@400;500;700', 'Rajdhani:wght@600;700'],
    },
    obsydian: {
      m: ['#ffd2a6', '#b06a3c', '#3e2617'], orn: 'ember', xp: ['#b9471a', '#ff8a3d'], name: 'Obsydian', desc: 'Czerń i ciemny metal, bardzo subtelny żar.',
      bg0: '#0a0908', bg1: '#131110', bg2: '#1b1816', line: '#3c3530', line2: '#26211e', a1: '#ff8a3d', a2: '#b9471a', text: '#eee6dc', text2: '#a69c91',
      glow: 'rgba(255,120,50,.18)', edge: 'rgba(255,110,40,.10)', tint: 'grayscale(1) brightness(.5) sepia(.55) hue-rotate(-12deg) saturate(1.3)', blend: '#1e1713',
      btn: ['#2b2623', '#1a1715'], btnLine: 'rgba(205,100,45,.6)', btnText: '#f6ece1', head: '"Marcellus SC", "Roboto", Georgia, serif', fonts: ['Roboto:wght@400;500;700', 'Marcellus+SC'],
    },
    glebia: {
      m: ['#dafcff', '#5bb9cf', '#143f50'], orn: 'drop', xp: ['#1580b0', '#5fd0ff'], name: 'Głębia', desc: 'Ciemny ocean i chłodne, błękitne światło.',
      bg0: '#04101a', bg1: '#081b2a', bg2: '#0c273b', line: '#185070', line2: '#0f364c', a1: '#38bdf8', a2: '#22d3ee', text: '#e3f6ff', text2: '#8db7cc',
      glow: 'rgba(56,189,248,.28)', edge: 'rgba(34,211,238,.18)', tint: 'grayscale(1) brightness(.5) sepia(1) hue-rotate(160deg) saturate(2.2)', blend: '#0b2438',
      btn: ['#10405d', '#0a283c'], btnLine: 'rgba(56,189,248,.6)', btnText: '#e6f8ff', head: '"Exo 2", "Roboto", Arial, sans-serif', fonts: ['Roboto:wght@400;500;700', 'Exo+2:wght@600;700'],
    },
  };

  /* ── grafiki ramek (SVG) — wymiary cięcia jak w grze ── */
  const strip = (t) => `<linearGradient id='a' x1='0' x2='1'><stop offset='0' stop-color='${t.a1}' stop-opacity='0'/><stop offset='.2' stop-color='${t.a1}'/><stop offset='.55' stop-color='${t.a3 || t.a2}'/><stop offset='.85' stop-color='${t.a2}'/><stop offset='1' stop-color='${t.a2}' stop-opacity='0'/></linearGradient><filter id='g' x='-10%' y='-200%' width='120%' height='500%'><feGaussianBlur stdDeviation='2.2'/></filter>`;
  /* ── grafika metalu ──
   * Emblemat w narożnikach i na plakietkach: gwiazda (Zorza), nit (Dark), romb (Neon), żar (Obsydian), kropla (Głębia). */
  function emblem(t, cx, cy, r) {
    const [m1, m2, m3] = t.m;
    if (t.orn === 'star') {
      const k = r * 0.3;
      return `<path d='M${cx},${cy - r} L${cx + k},${cy - k} L${cx + r},${cy} L${cx + k},${cy + k} L${cx},${cy + r} L${cx - k},${cy + k} L${cx - r},${cy} L${cx - k},${cy - k}Z' fill='${t.star}' stroke='${m2}' stroke-width='.4'/><circle cx='${cx}' cy='${cy}' r='${r * 0.9}' fill='${t.a1}' opacity='.18'/>`;
    }
    if (t.orn === 'diamond') return `<path d='M${cx},${cy - r} L${cx + r},${cy} L${cx},${cy + r} L${cx - r},${cy}Z' fill='${t.a1}' stroke='${m1}' stroke-width='.6'/><path d='M${cx},${cy - r * 0.5} L${cx + r * 0.5},${cy} L${cx},${cy + r * 0.5} L${cx - r * 0.5},${cy}Z' fill='${m1}' opacity='.55'/>`;
    if (t.orn === 'ember') return `<path d='M${cx},${cy - r} L${cx + r * 0.75},${cy} L${cx},${cy + r} L${cx - r * 0.75},${cy}Z' fill='#ff7a2a' stroke='${m3}' stroke-width='.6'/><circle cx='${cx}' cy='${cy}' r='${r * 0.35}' fill='#ffd08a'/>`;
    if (t.orn === 'drop') return `<circle cx='${cx}' cy='${cy}' r='${r * 0.8}' fill='${t.a1}' stroke='${m1}' stroke-width='.6'/><circle cx='${cx - r * 0.25}' cy='${cy - r * 0.3}' r='${r * 0.25}' fill='#fff' opacity='.7'/>`;
    return `<circle cx='${cx}' cy='${cy}' r='${r * 0.75}' fill='url(#mr)' stroke='${m3}' stroke-width='.6'/><circle cx='${cx - r * 0.2}' cy='${cy - r * 0.25}' r='${r * 0.22}' fill='${m1}' opacity='.8'/>`;
  }
  const metalDefs = (t) => `<linearGradient id='mp' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='${t.m[0]}'/><stop offset='.45' stop-color='${t.m[1]}'/><stop offset='1' stop-color='${t.m[2]}'/></linearGradient><radialGradient id='mr' cx='.35' cy='.3' r='.8'><stop offset='0' stop-color='${t.m[0]}'/><stop offset='.6' stop-color='${t.m[1]}'/><stop offset='1' stop-color='${t.m[2]}'/></radialGradient>`;
  /*
   * Ramka okna: 80×104, cięcie 32 (góra/dół) i 20 (boki), krawędzie powtarzane (round) — dzięki temu ozdoby na
   * krawędziach (gwiazdki Zorzy) nie rozciągają się. Metalowa obwódka z cieniowaniem w poprzek (bez pasów wzdłuż),
   * narożniki to metalowe okucia z emblematem stylu.
   */
  const winFrame = (t) => {
    const [m1, m2, m3] = t.m;
    const corner = `<path d='M1.5 21 L1.5 7.5 Q1.5 1.5 7.5 1.5 L21 1.5 L21 5.5 Q12 5.5 9.5 8.5 Q5.5 11 5.5 21 Z' fill='url(#mp)' stroke='${m3}' stroke-width='.7'/><path d='M3 19 L3 8 Q3 3 8 3 L19 3' fill='none' stroke='${m1}' stroke-width='.6' opacity='.7'/>${emblem(t, 8.2, 8.2, 4.2)}`;
    const stars = t.orn === 'star' ? `<g fill='${t.star}'>${[[40, 3.2, 2.1], [3.2, 52, 1.7], [76.8, 52, 1.7], [40, 100.8, 2.1]].map(([x, y, r]) => { const k = r * 0.3; return `<path d='M${x},${y - r} L${x + k},${y - k} L${x + r},${y} L${x + k},${y + k} L${x},${y + r} L${x - k},${y + k} L${x - r},${y} L${x - k},${y - k}Z'/>`; }).join('')}</g>` : '';
    return svg(`<svg xmlns='http://www.w3.org/2000/svg' width='80' height='104'><defs>${metalDefs(t)}<linearGradient id='w' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='${t.a1}' stop-opacity='.13'/><stop offset='1' stop-color='${t.a1}' stop-opacity='0'/></linearGradient></defs>
<rect width='80' height='104' rx='7' fill='${t.bg1}'/>
<rect x='4' y='4' width='72' height='26' fill='url(#w)'/>
<rect x='1' y='1' width='78' height='102' rx='6.5' fill='none' stroke='${m3}' stroke-width='2'/>
<rect x='2.3' y='2.3' width='75.4' height='99.4' rx='5.5' fill='none' stroke='${m2}' stroke-width='1.2'/>
<rect x='3.4' y='3.4' width='73.2' height='97.2' rx='4.6' fill='none' stroke='${m1}' stroke-width='.5' opacity='.55'/>
<rect x='5' y='5' width='70' height='94' rx='3.5' fill='none' stroke='${t.a1}' stroke-width='.6' opacity='.28'/>
${stars}
<g>${corner}</g><g transform='translate(80 0) scale(-1 1)'>${corner}</g><g transform='translate(0 104) scale(1 -1)'>${corner}</g><g transform='translate(80 104) scale(-1 -1)'>${corner}</g>
</svg>`);
  };
  /** Plakietka z nazwą okna: metalowa kapsuła ze szpicami i emblematem (120×28, cięcie 14/22). */
  const plaque = (t) => {
    const [m1, m2, m3] = t.m;
    return svg(`<svg xmlns='http://www.w3.org/2000/svg' width='120' height='28'><defs>${metalDefs(t)}<linearGradient id='pf' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='${t.bg2}'/><stop offset='1' stop-color='${t.bg0}'/></linearGradient></defs>
<path d='M22 1.5 L9 1.5 L1 14 L9 26.5 L22 26.5 L98 26.5 L111 26.5 L119 14 L111 1.5 L98 1.5 Z' fill='url(#pf)' stroke='${m3}' stroke-width='1.6'/>
<path d='M22 3 L10 3 L3 14 L10 25 L22 25 M98 3 L110 3 L117 14 L110 25 L98 25' fill='none' stroke='${m2}' stroke-width='1.1'/>
<line x1='10' y1='3' x2='110' y2='3' stroke='${m1}' stroke-width='.6' opacity='.6'/>
<line x1='10' y1='25' x2='110' y2='25' stroke='${m2}' stroke-width='.9'/>
${emblem(t, 11, 14, 4)}${emblem(t, 109, 14, 4)}
</svg>`);
  };
  /** Pionowa metalowa listwa (kolumna czatu / ekwipunku): kafelek 10×96 powtarzany w pionie, emblemat co 96 px. */
  const railV = (t) => {
    const [m1, m2, m3] = t.m;
    return svg(`<svg xmlns='http://www.w3.org/2000/svg' width='10' height='96'><defs>${metalDefs(t)}<linearGradient id='rv' x1='0' y1='0' x2='1' y2='0'><stop offset='0' stop-color='${m3}'/><stop offset='.3' stop-color='${m2}'/><stop offset='.5' stop-color='${m1}'/><stop offset='.7' stop-color='${m2}'/><stop offset='1' stop-color='${m3}'/></linearGradient></defs>
<rect width='10' height='96' fill='${t.bg0}'/><rect x='2' width='6' height='96' fill='url(#rv)'/><rect x='2' width='.6' height='96' fill='#000' opacity='.45'/><rect x='7.4' width='.6' height='96' fill='#000' opacity='.45'/>
<rect x='1' y='40' width='8' height='16' rx='2' fill='url(#mp)' stroke='${m3}' stroke-width='.6'/>${emblem(t, 5, 48, 3)}</svg>`);
  };
  /** Pozioma metalowa listwa (krawędź górnego i dolnego paska): kafelek 96×5. */
  const railH = (t, flip) => {
    const [m1, m2, m3] = t.m;
    const g = flip ? [m3, m2, m1, m2, m3].reverse() : [m3, m2, m1, m2, m3];
    return svg(`<svg xmlns='http://www.w3.org/2000/svg' width='96' height='5'><defs>${metalDefs(t)}<linearGradient id='rh' x1='0' y1='0' x2='0' y2='1'>${g.map((c, i) => `<stop offset='${i / 4}' stop-color='${c}'/>`).join('')}</linearGradient></defs>
<rect width='96' height='5' fill='url(#rh)'/><rect y='${flip ? 0 : 4.4}' width='96' height='.6' fill='#000' opacity='.6'/>${t.orn === 'star' ? `<circle cx='48' cy='2.5' r='1.1' fill='${t.star}'/>` : `<circle cx='48' cy='2.5' r='1.2' fill='url(#mr)' stroke='${m3}' stroke-width='.4'/>`}</svg>`);
  };
  /** Własne tło HUD-a na górze (342×65): metalowa tarcza w kolorach stylu z polami na nick, mapę, złoto i smocze łuski. */
  const hudSvg = (t) => {
    const [m1, m2, m3] = t.m;
    const box = (x, y, w, h) => `<rect x='${x}' y='${y}' width='${w}' height='${h}' rx='3' fill='${t.bg0}' stroke='${t.line}' stroke-width='.8'/><rect x='${x + 1}' y='${y + 1}' width='${w - 2}' height='1' fill='${m1}' opacity='.08'/>`;
    return svg(`<svg xmlns='http://www.w3.org/2000/svg' width='342' height='65'><defs>${metalDefs(t)}<linearGradient id='hf' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='${t.bg2}'/><stop offset='1' stop-color='${t.bg1}'/></linearGradient></defs>
<path d='M1 0 L341 0 L333 52 Q331 62 320 63 L22 63 Q11 62 9 52 Z' fill='url(#hf)' stroke='${m3}' stroke-width='2'/>
<path d='M3 0 L339 0 L331.5 51.5 Q329.5 60.5 320 61.3 L22 61.3 Q12.5 60.5 10.5 51.5 Z' fill='none' stroke='${m2}' stroke-width='1.1'/>
<path d='M5 1 L337 1' stroke='${m1}' stroke-width='.6' opacity='.5'/>
${box(30, 1, 282, 19)}${box(16, 22, 222, 16)}${box(242, 22, 84, 16)}${box(90, 41, 80, 17)}${box(211, 41, 80, 17)}
${emblem(t, 20, 49, 3.2)}${emblem(t, 322, 49, 3.2)}
</svg>`);
  };
  /*
   * Faktury tła — odpowiednik drewna z klasycznego interfejsu, inna dla każdego stylu:
   *   Dark Theme — szczotkowana stal, Zorza — nocne niebo z pasmami zorzy i gwiazdami,
   *   Neon — siatka z neonową poświatą, Obsydian — łupane szkło wulkaniczne,
   *   Głębia — refleksy światła pod wodą (kaustyka) i pęcherzyki.
   * Kafelki SVG bez szwów (stitchTiles / wzór okresowy), pamiętane per styl.
   */
  const rnd = (seed) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const texCache = {};
  function texture(t) {
    const key = t.orn;
    if (texCache[key]) return texCache[key];
    let w = 256, h = 256, body = '';
    const r = rnd(7 + key.length * 31);
    if (t.orn === 'rivet') {
      body = `<filter id='b' x='0' y='0' width='100%' height='100%'><feTurbulence type='fractalNoise' baseFrequency='.003 .55' numOctaves='2' seed='3' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 .09 0'/></filter>
<filter id='d' x='0' y='0' width='100%' height='100%'><feTurbulence type='fractalNoise' baseFrequency='.012' numOctaves='3' seed='9' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -.9 .55'/></filter>
<rect width='${w}' height='${h}' filter='url(#b)'/><rect width='${w}' height='${h}' filter='url(#d)' opacity='.5'/>`;
    } else if (t.orn === 'star') {
      w = 640; h = 320;
      const band = (y, c, op, sw) => `<path d='M-40 ${y} C 120 ${y - 50}, 260 ${y + 40}, 340 ${y - 10} S 560 ${y - 60}, 680 ${y}' stroke='${c}' stroke-width='${sw}' fill='none' opacity='${op}'/>`;
      let stars = '';
      for (let i = 0; i < 70; i++) { const x = (r() * w).toFixed(1), y = (r() * h).toFixed(1), s = (r() * 0.9 + 0.25).toFixed(2); stars += `<circle cx='${x}' cy='${y}' r='${s}' fill='#fff' opacity='${(r() * 0.5 + 0.15).toFixed(2)}'/>`; }
      for (let i = 0; i < 4; i++) { const x = r() * w, y = r() * h, k = 3.2; stars += `<path d='M${x},${y - k} L${x + .7},${y - .7} L${x + k},${y} L${x + .7},${y + .7} L${x},${y + k} L${x - .7},${y + .7} L${x - k},${y} L${x - .7},${y - .7}Z' fill='${t.star}' opacity='.75'/>`; }
      body = `<filter id='a' x='-20%' y='-50%' width='140%' height='200%'><feGaussianBlur stdDeviation='16'/></filter>
<g filter='url(#a)'>${band(90, t.a1, 0.16, 26)}${band(150, t.a3, 0.12, 34)}${band(210, t.a2, 0.12, 30)}${band(130, t.a1, 0.08, 60)}</g>${stars}`;
    } else if (t.orn === 'diamond') {
      w = 192; h = 192;
      body = `<pattern id='g' width='32' height='32' patternUnits='userSpaceOnUse'><path d='M32 0 L0 0 0 32' fill='none' stroke='${t.a1}' stroke-width='.6' opacity='.12'/></pattern>
<filter id='gl' x='-50%' y='-50%' width='200%' height='200%'><feGaussianBlur stdDeviation='1.6'/></filter>
<rect width='${w}' height='${h}' fill='url(#g)'/>
<path d='M0 96 L192 96 M96 0 L96 192' stroke='${t.a2}' stroke-width='1' opacity='.07' filter='url(#gl)'/>
${[[32, 64], [128, 160], [160, 32], [64, 128]].map(([x, y]) => `<circle cx='${x}' cy='${y}' r='1.3' fill='${t.a2}' opacity='.35'/><circle cx='${x}' cy='${y}' r='4' fill='${t.a2}' opacity='.08'/>`).join('')}
<path d='M0 192 L192 0' stroke='${t.a1}' stroke-width='14' opacity='.025' filter='url(#gl)'/>`;
    } else if (t.orn === 'ember') {
      // łupane szkło: trójkątne ścianki z delikatnym połyskiem
      w = 384; h = 384;
      const pts = [];
      const n = 6;
      for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) {
        const edgeX = i === 0 || i === n, edgeY = j === 0 || j === n;
        pts.push([i * w / n + (edgeX ? 0 : (r() - 0.5) * 34), j * h / n + (edgeY ? 0 : (r() - 0.5) * 34)]);
      }
      // brzegi muszą się zgadzać po przeciwnych stronach (kafelek bez szwów)
      for (let j = 0; j <= n; j++) pts[j * (n + 1) + n][1] = pts[j * (n + 1)][1] = j * h / n;
      for (let i = 0; i <= n; i++) pts[n * (n + 1) + i][0] = pts[i][0] = i * w / n;
      let facets = '';
      const P = (i, j) => pts[j * (n + 1) + i];
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        const a = P(i, j), b = P(i + 1, j), c = P(i + 1, j + 1), d = P(i, j + 1);
        for (const tri of (r() > 0.5 ? [[a, b, c], [a, c, d]] : [[a, b, d], [b, c, d]])) {
          const l = r();
          facets += `<path d='M${tri.map((p) => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' L')}Z' fill='${l > 0.5 ? '#fff' : '#000'}' fill-opacity='${(l > 0.5 ? (l - 0.5) * 0.05 : (0.5 - l) * 0.26).toFixed(3)}' stroke='#fff' stroke-opacity='.045' stroke-width='.6'/>`;
        }
      }
      body = facets;
    } else if (t.orn === 'drop') {
      let bub = '';
      for (let i = 0; i < 9; i++) { const x = (r() * w).toFixed(1), y = (r() * h).toFixed(1), s = (r() * 2 + 0.8).toFixed(2); bub += `<circle cx='${x}' cy='${y}' r='${s}' fill='none' stroke='${t.m[0]}' stroke-width='.5' opacity='.22'/>`; }
      body = `<filter id='c' x='0' y='0' width='100%' height='100%'><feTurbulence type='turbulence' baseFrequency='.018' numOctaves='2' seed='4' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 .4  0 0 0 0 .85  0 0 0 0 1  -2.4 0 0 0 1.05'/><feGaussianBlur stdDeviation='.6'/></filter>
<rect width='${w}' height='${h}' filter='url(#c)' opacity='.09'/>${bub}`;
    }
    return (texCache[key] = { url: svg(`<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}'>${body}</svg>`), w, h });
  }

  /** Pomarańczowy pasek gry (#e29533, odcień ~33°) → kolor paska stylu; szary (zużyty) zostaje szary. */
  const xpFilter = (t) => {
    const hex = (t.xp || [t.a2, t.a1])[1].replace('#', '');
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.substr(i, 2), 16) / 255);
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, l = (mx + mn) / 2;
    let h = 0; if (d) h = mx === r ? 60 * (((g - b) / d) % 6) : mx === g ? 60 * ((b - r) / d + 2) : 60 * ((r - g) / d + 4);
    if (h < 0) h += 360;
    let rot = Math.round(h - 33); if (rot > 180) rot -= 360; if (rot < -180) rot += 360;
    return `hue-rotate(${rot}deg) saturate(1.15) brightness(${(0.9 + l * 0.3).toFixed(2)})`;
  };
  /** Filtr przebarwiający szare, metalowe grafiki gry (kula HP, obramowania pasków doświadczenia) na metal stylu. */
  const metalFilter = (t, hud) => {
    const h = t.m[1].replace('#', ''); const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.substr(i, 2), 16) / 255);
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
    const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
    let hue = 0;
    if (d) hue = mx === r ? 60 * (((g - b) / d) % 6) : mx === g ? 60 * ((b - r) / d + 2) : 60 * ((r - g) / d + 4);
    if (hue < 0) hue += 360;
    if (s < 0.12) return hud ? 'grayscale(1) brightness(.68) contrast(1.12)' : 'grayscale(1) brightness(.85) contrast(1.08)';
    return `grayscale(1) sepia(1) hue-rotate(${Math.round(hue - 38)}deg) saturate(${(1 + s * 1.6).toFixed(2)}) brightness(${((hud ? 0.68 : 0.85) + l * (hud ? 0.3 : 0.45)).toFixed(2)})`;
  };
  // powierzchnia panelu: boczne pasy 11 px (gui/middle_graphics.png 0 11 fill)
  // panel w oknie: jednolite tło (kolor elementu) + krawędzie po bokach w miejscu ramek z drewna (cięcie 0 11)
  const surface = (t, raised) => { const side = (x, dir) => `<rect x='${x}' width='11' height='60' fill='${raised ? t.bg1 : t.bg0}'/><rect x='${dir > 0 ? x + 9 : x + 1}' width='1' height='60' fill='${t.m[1]}' opacity='.35'/><rect x='${dir > 0 ? x + 10 : x}' width='1' height='60' fill='${t.m[2]}'/>`; return svg(`<svg xmlns='http://www.w3.org/2000/svg' width='60' height='60' preserveAspectRatio='none'>${side(0, 1)}${side(49, -1)}</svg>`); };
  // pasek / nagłówek tabeli: boczne pasy 20 px (quest_bar.png, table_header.png 0 20 fill)
  // metalowa płyta (nagłówki tabel, paski na dole okien — zamiast drewna): jednolita w poziomie, więc pasuje do każdego cięcia
  const plate = (t) => svg(`<svg xmlns='http://www.w3.org/2000/svg' width='80' height='40' preserveAspectRatio='none'><defs><linearGradient id='p' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='${t.bg2}'/><stop offset='.5' stop-color='${t.bg1}'/><stop offset='1' stop-color='${t.bg0}'/></linearGradient><linearGradient id='h' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='${t.m[0]}' stop-opacity='.26'/><stop offset='.5' stop-color='${t.m[1]}' stop-opacity='.1'/><stop offset='1' stop-color='${t.m[2]}' stop-opacity='.2'/></linearGradient></defs><rect width='80' height='40' fill='url(#p)'/><rect width='80' height='40' fill='url(#h)'/><rect width='80' height='1' fill='${t.m[1]}' opacity='.55'/><rect y='39' width='80' height='1' fill='${t.m[2]}'/></svg>`);
  const bar = (t) => plate(t);
  // karta/etykieta: pas 5 px (width-card-button.png 5 fill)
  const card = (t, active) => svg(`<svg xmlns='http://www.w3.org/2000/svg' width='40' height='40'><defs><linearGradient id='c' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='${t.bg2}'/><stop offset='1' stop-color='${t.bg1}'/></linearGradient></defs><rect x='.5' y='.5' width='39' height='39' rx='3' fill='url(#c)' stroke='${t.line}'/>${active ? `<rect x='4' y='37' width='32' height='1.5' rx='.75' fill='${t.a1}' opacity='.8'/>` : ''}</svg>`);

  function loadFonts(t) {
    if (!t || !t.fonts) { if (fontEl) fontEl.remove(); fontEl = null; return; }
    const href = 'https://fonts.googleapis.com/css2?' + t.fonts.map((f) => 'family=' + f).join('&') + '&display=swap';
    if (fontEl && fontEl.href === href) return;
    if (fontEl) fontEl.remove();
    fontEl = el('link', { rel: 'stylesheet', href });
    document.head.appendChild(fontEl);
  }

  function css(t) {
    const IL = '.interface-layer';
    const body = '"Roboto", Arimo, Arial, sans-serif';
    const btn = (from, to, line, txt) => `background:linear-gradient(${from},${to})!important;color:${txt}!important;border-radius:3px!important;box-shadow:inset 0 0 0 1px ${line},inset 0 1px 0 ${t.m[0]}2e,0 1px 2px rgba(0,0,0,.55)!important;text-shadow:0 1px 1px rgba(0,0,0,.8)!important`;
    const ha = (h, a) => { const x = String(h).replace('#', ''); const n = parseInt(x.length === 3 ? x.split('').map((ch) => ch + ch).join('') : x, 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; };
    const tx = texture(t), TX = `${tx.url} 0 0 / ${tx.w}px ${tx.h}px repeat`;
    const btnMain = btn(t.btn[0], t.btn[1], t.btnLine, t.btnText);
    const hover = `filter:brightness(1.18);box-shadow:inset 0 0 0 1px ${t.a1},0 0 10px ${t.glow}!important`;
    return `
/* ═══ Motywnik — ${t.name} ═══ */
:root{--mt-bg0:${t.bg0};--mt-bg1:${t.bg1};--mt-bg2:${t.bg2};--mt-line:${t.line};--mt-a1:${t.a1};--mt-a2:${t.a2};--mt-text:${t.text};--mt-text2:${t.text2}}

/* — krój pisma (te same wielkości co w grze) — */
/* tylko okna, dymki, menu, czat i prawa kolumna — pasek dolny (HP, doświadczenie, czas) zostaje z czcionką gry */
.c-window:not(.transparent), .tip-wrapper, .popup-menu-layer, .new-chat-window, ${IL} .right-column.main-column,
.c-window:not(.transparent) :not(.item):not(.item *):not(.button):not(.button *):not(.widget-button):not(.widget-button *):not(.card):not(.card *), .tip-wrapper *, .new-chat-window *:not(.button):not(.button *):not(.widget-button):not(.widget-button *):not(.card):not(.card *), ${IL} .right-column.main-column :not(.item):not(.item *):not(.button):not(.button *):not(.widget-button):not(.widget-button *):not(.card):not(.card *){font-family:${body}!important}
.c-window .header-label .text, .c-window .header-label, .c-window .header-label *{font-family:${t.head}!important}
/* przyciski zostają z krojem gry — inne metryki czcionki przesuwały napis w pionie */
.button, .button *, .widget-button, .widget-button *, .tabs-nav .card, .tabs-nav .card *, .mt-mi, .mt-mi *{font-family:Arimo, Arial, sans-serif!important}

/* — ramy ekranu: kolumny, górny i dolny pasek — */
${IL} .left-column.main-column, ${IL} .right-column.main-column{background:${TX}, radial-gradient(ellipse at 50% 0%, ${t.edge}, transparent 45%), linear-gradient(${t.bg1},${t.bg0})!important}
${IL} .left-column.main-column .new-chat-window, ${IL} .left-column.main-column .chat-input-wrapper{background-color:transparent!important}
/* metalowe listwy przy kolumnie czatu i ekwipunku (w miejscu krawędzi gry, ta sama szerokość) */
${IL} .left-column.main-column > .border, ${IL} .right-column.main-column > .border{background:${railV(t)} 0 0 / 10px 96px repeat-y!important;opacity:1!important}
/* górny i dolny pasek: tło stylu + metalowa krawędź od strony mapy (rysowana wewnątrz paska — nic nie wystaje) */
${IL} .top.positioner > .bg{background:${railH(t, true)} 0 100% / 96px 5px repeat-x, ${TX}, linear-gradient(${t.bg2},${t.bg0})!important}
${IL} .bottom.positioner > .bg{background:${railH(t, false)} 0 0 / 96px 5px repeat-x, ${TX}, linear-gradient(${t.bg0},${t.bg2})!important}
/* metal wokół kuli HP, ramki pasków doświadczenia i wskaźników — ten sam rysunek, barwa metalu stylu */
.bottom-panel .bottom-panel-graphic, .bottom-panel .hp-indicator-wrapper > .glass, .bottom-panel .exp-progress > .overlay, .bottom-panel .pointer-exp-graphic, .bottom-panel .pointer-ttl-graphic{filter:${metalFilter(t)}!important}
.mt-hud-bg{filter:${metalFilter(t, true)}!important}
/* paski doświadczenia i wyczerpania: przebarwiamy pomarańcz gry filtrem, NIE podmieniamy tła —
   dzięki temu stany gry (np. szary pasek zużytego wyczerpania) zostają czytelne */
.bottom-panel .exp-progress .progress > .inner{filter:${xpFilter(t)}}
.skill-usable-slot[class*="interface-element-one-item-slot"]{background-color:${t.bg0}!important;box-shadow:inset 0 0 0 1px ${t.m[2]},inset 0 0 6px rgba(0,0,0,.6)!important}
/* ozdoby wokół HP, panel szybkich umiejętności i HUD na górze — grafiki gry bez zmian (żadnych prostokątów wokół) */
body::after{content:'';position:fixed;inset:0;pointer-events:none;z-index:2147480000;box-shadow:inset 0 0 38px ${t.edge}}

/* — sloty przedmiotów i siatka torby: ten sam rysunek, nowa barwa — */
.interface-element-item-slot-grid-stretch, .interface-element-one-item-slot-background-to-repeat{background-color:${t.blend}!important;background-blend-mode:luminosity!important}
.interface-element-one-black-tile{background:linear-gradient(${t.bg2},${t.bg0})!important;box-shadow:inset 0 0 0 1px ${t.line2}!important}
.interface-element-grid-border, .interface-element-background-color-3{background-color:${t.bg1}!important}

/* — okna — */
.c-window:not(.transparent).border-window{border-image-source:${winFrame(t)}!important;border-image-slice:32 20 fill!important;border-image-repeat:round!important}
.c-window .inner-content{background-color:transparent!important}
.c-window:not(.transparent) > .content{color:${t.text}}
.c-window:not(.transparent){box-shadow:0 12px 30px rgba(0,0,0,.6),0 0 22px ${t.glow}!important}
/* okna przezroczyste (mapa podręczna, przelogowanie, liczniki…) zostają przezroczyste — gra sama ustawia ich krycie */
.c-window:not(.transparent) .header-label{background:none!important;box-shadow:none!important;border-image:${plaque(t)} 14 22 fill / 14px 22px / 3px 16px stretch!important;filter:drop-shadow(0 0 6px ${t.glow})}
.c-window .header-label .text{color:${t.text}!important;text-shadow:0 0 8px ${t.glow},0 1px 1px #000!important}
/* ozdoby plakietki z nazwą okna — ten sam kształt, przebarwione */
/* metalowe ozdoby klasycznego interfejsu — w nowoczesnych stylach ich nie ma */
.c-window .header-label .left-decor, .c-window .header-label .right-decor{opacity:0!important}
.c-window .close-button-corner-decor{background-image:none!important}
.c-window .close-button{filter:grayscale(1) brightness(1.35);background-color:${t.bg2}!important;border-radius:4px!important;box-shadow:0 0 0 1px ${t.m[2]},inset 0 0 0 1px ${t.m[1]}66!important}
.c-window .close-button:hover{filter:grayscale(.2) brightness(1.6);box-shadow:0 0 0 1px ${t.a1},0 0 8px ${t.glow}!important}
/* panel szybkich umiejętności nad HP — ta sama ramka co okna */
.additional-skill-panel-border{border-image-source:${winFrame(t)}!important;border-image-slice:32 20 fill!important;border-image-repeat:round!important}
/* okna łupów i ważne okna — mocniejsze światło */
.c-window[class*="loot"], .c-window.window-on-peak{box-shadow:0 12px 30px rgba(0,0,0,.6),0 0 0 1px ${t.a1}55,0 0 34px ${t.glow}!important}

/* — powierzchnie interfejsu (border-image) — */
[class*="interface-element-middle-"]{border-image-source:${surface(t, false)}!important;background:${t.bg1}!important}
[class*="interface-element-middle-2"], [class*="interface-element-middle-3"]{border-image-source:${surface(t, true)}!important;background:${t.bg0}!important;box-shadow:none!important}
.interface-element-bottom-bar-background-stretch, [class*="interface-element-header-1"]{border-image-source:${bar(t)}!important}
[class*="interface-element-header-3"], .opt-header{background:linear-gradient(${t.bg2},${t.bg1})!important;color:${t.text}!important;box-shadow:inset 0 -1px 0 ${t.line}!important}
.interface-element-active-card-background-stretch, .interface-element-active-card-border-image{border-image-source:${card(t, true)}!important}
.interface-element-green-box-background{background:radial-gradient(ellipse 80% 70% at 50% 0, ${t.glow}, transparent 75%), linear-gradient(${t.bg2},${t.bg0})!important;box-shadow:inset 0 0 0 1px ${t.m[2]},inset 0 1px 0 ${t.m[0]}26!important}
.c-window:not(.transparent) > .content{background:radial-gradient(ellipse 70% 140px at 50% 0, ${t.glow}, transparent 70%), linear-gradient(${t.bg2}, ${t.bg1} 140px)!important;background-color:${t.bg1}!important}

/* — drewniane nagłówki tabel i belki gry → metalowa płyta w kolorach stylu — */
.mt-plate{background-image:${plate(t)}!important;background-size:100% 100%!important;background-position:0 0!important;background-repeat:no-repeat!important;background-color:${t.bg1}!important;color:${t.text}!important;text-shadow:0 1px 1px #000!important}
.mt-plate-bi{border-image-source:${plate(t)}!important}
.mt-plate *, .mt-plate-bi ~ *{color:${t.text}}

/* nagłówki tabel (klany, członkowie, historia…) — klasy gry z drewnem */
.c-window table.table-header, .c-window .table-header-wrapper, .c-window table.table-header tr{background:none!important;border-image:none!important}
.c-window td.table-header, .c-window th.table-header, .c-window div.table-header, .c-window .header-sort, .c-window .hover-header, .c-window div[class*="interface-element-table-header"]{background-image:${plate(t)}!important;background-size:100% 100%!important;background-position:0 0!important;background-repeat:no-repeat!important;background-color:${t.bg1}!important;border-image-source:${plate(t)}!important;color:${t.text}!important;text-shadow:0 1px 1px #000!important}
.c-window [class*="table-header-1"]::before, .c-window [class*="table-header-1"]::after, .c-window .table-header::before, .c-window .table-header::after{background-image:none!important}
.c-window .table-header *, .c-window [class*="table-header-1"] *{color:${t.text}!important}
.c-window .table-header-wrapper{box-shadow:inset 0 -1px 0 ${t.m[2]}!important}
.c-window td.table-header + td.table-header, .c-window .hover-header + .hover-header{box-shadow:inset 1px 0 0 ${t.m[2]}!important}
.c-window .hover-header:hover{filter:brightness(1.2)}
/* wiersze tabel: delikatne pasy na zmianę i cienkie linie zamiast jednolitej szarości */
.c-window table.table-content tr, .c-window table.table-content tr.mt-bov{background-color:transparent!important}
.c-window table.table-content tr:nth-child(even):has(> td:not(:empty)){background-color:${t.m[0]}08!important}
.c-window table.table-content tr:hover:has(> td:not(:empty)){background-color:${t.a1}12!important}
.c-window table.table-content td, .c-window table.table-content td.mt-bd{border-color:${t.line2}!important}

/* — okno łupu: gładkie tło bez pionowych krawędzi paneli, okienka przedmiotów jako spokojne kafle — */
.c-window.mt-loot > .content{background:transparent!important;box-shadow:none!important}
/* tło okna łupów sięga aż do metalowej ramy — jedna płaszczyzna, bez pasów między ramą a środkiem.
   Rysowane na samym oknie (pseudo-element), żeby niczego w środku nie przesuwać — pasek z „Potwierdź" zostaje na miejscu */
.c-window.mt-loot::before{content:'';position:absolute;left:-15px;right:-15px;top:-25px;bottom:0;z-index:-1;pointer-events:none;border-radius:5px;background:radial-gradient(ellipse 80% 110px at 50% 0, ${t.glow}, transparent 75%), radial-gradient(ellipse 120% 95% at 50% 45%, transparent 55%, rgba(0,0,0,.5)), linear-gradient(${ha(t.bg2, 0.88)}, ${ha(t.bg0, 0.95)}), ${TX}}
.c-window.mt-loot .content .mt-lclear, .c-window.mt-loot .content .mt-lclear:is(.mt-b0,.mt-b1,.mt-b2,.mt-bov,.mt-bd), .c-window.mt-loot .content [class*="interface-element-middle-"]{background:transparent!important;background-image:none!important;border-color:transparent!important;border-image:none!important;box-shadow:none!important}
.c-window.mt-loot .content .mt-lin{background:transparent!important;background-image:none!important;border-color:transparent!important;box-shadow:none!important}
/* okienko przedmiotu: szlachetny kafel — metalowa krawędź, światło od góry, głęboki cień w środku */
.c-window.mt-loot .content .mt-lcard{background:radial-gradient(ellipse 90% 50% at 50% 0, ${ha(t.a1, 0.10)}, transparent 70%), linear-gradient(${t.bg2}, ${t.bg0})!important;border-color:${t.m[2]}!important;border-radius:5px!important;box-shadow:inset 0 0 0 1px ${t.m[2]}, inset 0 1px 0 ${t.m[0]}2e, inset 0 -10px 18px rgba(0,0,0,.35), 0 2px 6px rgba(0,0,0,.45)!important}
.c-window.mt-loot .content .mt-lslot:not(.mp-lg-glow){background:radial-gradient(circle at 50% 40%, ${t.bg1}, ${t.bg0} 75%)!important;border-radius:4px!important;box-shadow:inset 0 0 0 1px ${t.m[2]}, inset 0 2px 6px rgba(0,0,0,.7), 0 1px 0 ${t.m[0]}14!important}
.c-window.mt-loot .content .mt-lcard *:not(.button):not(.button *):not(.item *){color:${t.text}}

/* — zakładki — */
.tabs-nav .card{background:linear-gradient(${t.bg2},${t.bg0})!important;color:${t.text2}!important;box-shadow:inset 0 0 0 1px ${t.m[2]},inset 0 1px 0 ${t.m[0]}1f!important;text-shadow:0 1px 1px #000!important}
.tabs-nav .card:hover{color:${t.text}!important;box-shadow:inset 0 0 0 1px ${t.line},inset 0 1px 0 ${t.m[0]}2e!important}
.tabs-nav .card.active{background:linear-gradient(${t.bg2},${t.bg1})!important;color:${t.text}!important;box-shadow:inset 0 0 0 1px ${t.a1}99,inset 0 1px 0 ${t.m[0]}33,inset 0 0 12px ${t.glow}!important}
/* środek kart i przycisków list: bez dodatkowych teł (żadnych jaśniejszych prostokątów w środku) */
.tabs-nav .card :is(.mt-b0,.mt-b1,.mt-b2,.mt-bov), .tabs-nav .card .bck, .tabs-nav .card .bck-wrapper{background-color:transparent!important;background-image:none!important;box-shadow:none!important}
/* drewniana przegroda między kolumnami → metalowa listwa */
.c-window .interface-element-vertical-wood, .c-window .divide-wood{background:${railV(t)} center top / 10px 96px repeat-y!important;border-image:none!important}

/* — przyciski gry (zielone / fioletowe / czerwone / niebieskie) — */
.button.green, .button.small.green{${btnMain}}
.button.purple, .button.violet{${btn(t.btn[0], t.btn[1], t.btnLine, t.btnText)}}
.button.red{${btn('#4a1717', '#200909', '#a33a3a', '#ffe9e9')}}
.button:hover{${hover}}
.button.disabled, .button.inactive, .button[disabled], .widget-button.disabled{filter:grayscale(1);opacity:.55}
.widget-button.green{${btnMain}}
.widget-button.violet, .widget-button.blink-violet{${btn(t.btn[0], t.btn[1], t.btnLine, t.btnText)}}
.widget-button.blue{${btn(t.bg2, t.bg0, t.line, t.btnText)}}
.widget-button.red{${btn('#3a1414', '#1a0808', '#8a3030', '#fff')}}
.widget-button:hover{${hover}}

/* — menu prawego przycisku — */
.mt-menu{background:${t.bg1}!important;box-shadow:0 0 0 1px ${t.m[2]},0 10px 26px rgba(0,0,0,.65),0 0 16px ${t.glow}!important;border-image-source:none!important;border-color:${t.line}!important}
.mt-menu .mt-mi{border-image-source:none!important}
.mt-mi{${btnMain}}
.mt-mi:hover{${hover}}
#mp-ctx{background:${t.bg1}!important;border-color:${t.line}!important}
#mp-ctx .mp-ctx-item{${btnMain};border-color:transparent!important}
#mp-ctx .mp-ctx-item:hover{${hover}}
#mp-ctx .mp-ctx-title{background:transparent!important;color:${t.text}!important;border-bottom-color:${t.line}!important}

/* — dymki, pola, czat — */
.tip-wrapper{background:${t.bg1}f2!important;box-shadow:0 0 0 1px ${t.line},0 8px 22px rgba(0,0,0,.6),0 0 14px ${t.glow}!important;border-image:none!important;color:${t.text}}
.ni-input input, .c-window input, .c-window textarea, .new-chat-window input, .new-chat-window textarea{background-color:${t.bg0}!important;color:${t.text}!important}
.ni-input.search-wrapper{filter:${t.tint} brightness(1.5)}
.new-chat-window .chat-channel-card{background:linear-gradient(${t.bg1},${t.bg0})!important;box-shadow:inset 0 0 0 1px ${t.line2}!important}
.new-chat-window .chat-channel-card.active{background:linear-gradient(${t.bg2},${t.bg1})!important;box-shadow:inset 0 0 0 1px ${t.line},inset 0 -2px 0 ${t.a1}!important}

/* — ciemny tekst na nowym, ciemnym tle — */
.mt-lt, .mt-lw{color:${t.text}!important}
.mt-lt2{color:${t.text2}!important}
.mt-bd{border-color:${t.line}!important}
.mt-b0{background-color:${t.bg0}!important}
.mt-b1{background-color:${t.bg1}!important}
.mt-b2{background-color:${t.bg2}!important}
.mt-bov{background-color:rgba(255,255,255,.035)!important}

/* — przewijanie — */
.game-window-positioner ::-webkit-scrollbar-thumb{background:${t.line}!important}
`;
  }

  /* ── menu prawego przycisku i ciemny tekst ── */
  const skip = (n) => n.closest('.mp-glass, #mp-qbar, #mp-qpop, .mp-modal-bg, #mp-ctx, #mp-eqtip, #mp-launcher');
  const lum = (c) => { const m = String(c).match(/(\d+)\D+(\d+)\D+(\d+)/); return m ? (0.299 * m[1] + 0.587 * m[2] + 0.114 * m[3]) / 255 : 1; };
  /** Barwa: jasność i nasycenie (0–1) z rgb(a). */
  function tone(c) {
    const m = String(c).match(/([\d.]+)\D+([\d.]+)\D+([\d.]+)(?:\D+([\d.]+))?/);
    if (!m) return null;
    const r = m[1] / 255, g = m[2] / 255, b = m[3] / 255, a = m[4] == null ? 1 : Number(m[4]);
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    return { l: 0.299 * r + 0.587 * g + 0.114 * b, s: mx ? (mx - mn) / mx : 0, a };
  }
  const SCOPE = '.c-window:not(.transparent), .tip-wrapper, .new-chat-window, .right-column.main-column, .mt-menu';
  const OWN = '.button, .card, .widget-button, .header-label, .mt-mi, input, textarea, select, [class*="interface-element-"]';
  /**
   * Ujednolicenie jak w projekcie graficznym: szare tła, szare ramki i szare/białe napisy gry dostają kolory stylu
   * (te same odcienie wszędzie). Kolorowe napisy (rzadkość, wartości, ostrzeżenia) zostają bez zmian.
   */
  const WOOD = /wood|drewn|header|deska|belka|plank/i;
  function fixText(root) {
    if (!active()) return;
    const list = root === document.body ? $$(SCOPE).flatMap((w) => [w, ...$$('*', w)]) : (root.closest && root.closest(SCOPE) ? [root, ...$$('*', root)] : $$(SCOPE, root).flatMap((w) => [w, ...$$('*', w)]));
    for (const n of list) {
      if (n.nodeType !== 1 || skip(n) || n.closest('.item, .big-messages, canvas') || /^(IMG|CANVAS|svg|path)$/i.test(n.tagName)) continue;
      const cs = getComputedStyle(n);
      // napis
      if ([...n.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim())) {
        const t = tone(cs.color);
        if (t && t.s < 0.22) {
          if (t.l < 0.33) n.classList.add('mt-lt');
          else if (t.l < 0.66) n.classList.add('mt-lt2');
          else n.classList.add('mt-lw');
        }
      }
      if (n.matches(OWN) || n.matches(SCOPE)) continue;
      // drewno (nagłówki tabel, belki) → metalowa płyta
      if (WOOD.test(cs.backgroundImage)) n.classList.add('mt-plate');
      if (WOOD.test(cs.borderImageSource)) n.classList.add('mt-plate-bi');
      // ramka
      if (parseFloat(cs.borderTopWidth) + parseFloat(cs.borderLeftWidth) + parseFloat(cs.borderBottomWidth) + parseFloat(cs.borderRightWidth) > 0 && cs.borderImageSource === 'none') {
        const t = tone(cs.borderTopColor) || tone(cs.borderLeftColor);
        if (t && t.a > 0.05 && t.s < 0.2) n.classList.add('mt-bd');
      }
      // tło (tylko jednolite, bez obrazka)
      if (cs.backgroundImage === 'none') {
        const t = tone(cs.backgroundColor);
        if (t && t.a > 0.02 && t.s < 0.2) {
          if (t.a < 0.5) n.classList.add('mt-bov');
          else if (t.l < 0.09) n.classList.add('mt-b0');
          else n.classList.add('mt-b1');
        }
      }
    }
  }
  /* menu gry pod prawym przyciskiem (.popup-menu): ramka i każda pozycja w kolorach stylu */
  /* okno łupu: rozpoznawane po nagłówku „Łup…" — dostaje spokojniejszy, gładki wygląd */
  const sized = new WeakSet();
  function tagLoot() {
    if (!active()) return;
    for (const w of $$('.c-window')) {
      const h = w.querySelector('.header-label .text, .header-label');
      if (!(h && /^\s*łup/i.test(h.textContent || ''))) continue;
      w.classList.add('mt-loot');
      // wszystkie tła w środku okna (także kolorowe, np. brązowo-czerwone okienka przedmiotów) → kolory stylu
      const c = w.querySelector(':scope > .content'); if (!c) continue;
      // okienko przedmiotu = największy przodek kafelka, w którym jest tylko ten jeden przedmiot
      const cards = new Set();
      for (const it of $$('.item', c)) {
        let n = it; const iw = it.getBoundingClientRect().width || 32;
        while (n.parentElement && n.parentElement !== c) {
          const p = n.parentElement;
          if (p.matches('.inner-content, [class*="scroll"]') || $$('.item', p).length > 1 || p.getBoundingClientRect().width > iw * 4.5) break;
          n = p;
        }
        if (n !== it) { n.classList.add('mt-lcard'); cards.add(n); if (it.parentElement !== n) it.parentElement.classList.add('mt-lslot'); }
      }
      // wymiary jak w klasycznym wyglądzie: mierzymy okienka bez stylu motywu i — jeśli coś się różni — przywracamy je
      if (cards.size && !sized.has(w)) {
        sized.add(w);
        const list = [...cards];
        styleEl.disabled = true;
        const base = list.map((n) => n.getBoundingClientRect());
        styleEl.disabled = false;
        list.forEach((n, i) => {
          const r = n.getBoundingClientRect();
          if (Math.abs(r.width - base[i].width) > 1) { n.style.boxSizing = 'border-box'; n.style.width = base[i].width + 'px'; }
          if (Math.abs(r.height - base[i].height) > 1) { n.style.boxSizing = 'border-box'; n.style.height = base[i].height + 'px'; }
        });
      }
      // reszta teł w środku okna znika — zostaje jedno, spójne tło okna (żadnych pasów po bokach)
      for (const n of $$('*', c)) {
        if (cards.has(n) || n.closest('.item, .button, .mp-lg-hl, .mp-ibadge, .mp-lg-pop, .mt-lslot, .c-window__bottom-bar') || n.classList.contains('mt-lslot')) continue;
        const cs = getComputedStyle(n);
        if (cs.backgroundImage !== 'none' || (tone(cs.backgroundColor) || { a: 0 }).a > 0.02 || parseFloat(cs.borderLeftWidth) > 0 || parseFloat(cs.borderTopWidth) > 0 || cs.borderImageSource !== 'none') n.classList.add(n.closest('.mt-lcard') ? 'mt-lin' : 'mt-lclear');
      }
    }
  }
  function tagPopups() {
    if (!active()) return;
    for (const m of $$('.popup-menu')) {
      m.classList.add('mt-menu');
      for (const n of $$('*', m)) {
        if (n.closest('.mt-mi') || !(n.textContent || '').trim()) continue;
        const cs = getComputedStyle(n);
        const bg = cs.backgroundImage !== 'none' || (tone(cs.backgroundColor) || { a: 0 }).a > 0.05;
        if (bg) n.classList.add('mt-mi');
      }
    }
  }
  function tagMenu(labels) {
    [0, 40, 150, 400].forEach((ms) => setTimeout(tagPopups, ms));
    if (!active() || !labels || !labels.length) return;
    setTimeout(() => {
      const leaves = labels.map((l) => $$('body *').find((n) => !n.children.length && (n.textContent || '').trim() === String(l).trim() && isVisible(n) && !skip(n))).filter(Boolean);
      if (!leaves.length) return;
      const rows = leaves.map((lf) => { let r = lf; while (r.parentElement && r.parentElement !== document.body && (r.parentElement.textContent || '').trim() === (lf.textContent || '').trim()) r = r.parentElement; return r; });
      let box = rows[0].parentElement;
      while (box && box !== document.body && !rows.every((r) => box.contains(r))) box = box.parentElement;
      if (box && box !== document.body) { box.classList.add('mt-menu'); rows.forEach((r) => r.classList.add('mt-mi')); }
    }, 0);
  }
  const onCtx = () => [30, 120, 350].forEach((ms) => setTimeout(tagPopups, ms));
  let queue = new Set(), qT = null;
  function start() {
    if (mo) return;
    fixText(document.body);
    mo = new MutationObserver((muts) => {
      for (const m of muts) for (const n of m.addedNodes) if (n.nodeType === 1 && !skip(n)) queue.add(n);
      if (queue.size && !qT) qT = setTimeout(() => { qT = null; const q = [...queue]; queue.clear(); q.forEach((n) => n.isConnected && fixText(n)); hudLayer(active()); tagPopups(); tagLoot(); }, 150);
    });
    mo.observe(document.body, { childList: true, subtree: true });
    document.addEventListener('contextmenu', onCtx, true);
    [1200, 4000].forEach((ms) => setTimeout(() => { fixText(document.body); hudLayer(active()); }, ms));
  }
  function stop() {
    if (mo) { mo.disconnect(); mo = null; }
    document.removeEventListener('contextmenu', onCtx, true);
    ['mt-menu', 'mt-mi', 'mt-lt', 'mt-lt2', 'mt-lw', 'mt-bd', 'mt-b0', 'mt-b1', 'mt-b2', 'mt-bov', 'mt-btn', 'mt-skin', 'mt-frame', 'mt-plate', 'mt-plate-bi', 'mt-loot', 'mt-lc', 'mt-lcb', 'mt-lcard', 'mt-lslot', 'mt-lclear', 'mt-lin'].forEach((c) => $$('.' + c).forEach((n) => n.classList.remove(c)));
  }
  const active = () => !!(cfg && cfg.enabled && THEMES[cfg.theme] && !THEMES[cfg.theme].none);

  function apply() {
    if (!styleEl) { styleEl = el('style', { id: 'mp-motywnik' }); document.head.appendChild(styleEl); }
    stop();
    if (!cfg || !cfg.enabled) { styleEl.textContent = ''; loadFonts(null); return; }
    const t = THEMES[cfg.theme] || THEMES.domyslny;
    loadFonts(active() ? t : null);
    let out = active() ? css(t) : '';
    const own = (cfg.custom || []).find((x) => x.id === cfg.customOn);
    if (own) out += `\n/* Własny styl: ${own.name} */\n${own.css}`;
    styleEl.textContent = out;
    hudLayer(active());
    if (active()) start();
  }

  /* HUD na górze (złoto, mapa) ma metalową grafikę z dziećmi w środku — filtra nie da się dać na cały element,
     więc kopia tej samej grafiki trafia na warstwę pod treścią i tylko ona jest przebarwiana. */
  function hudLayer(on) {
    for (const hud of $$('.hud-container')) {
      let lay = hud.querySelector(':scope > .mt-hud-bg');
      if (!on) { if (lay) lay.remove(); const ic = hud.querySelector(':scope > .mt-hud-ico'); if (ic) ic.remove(); if (hud.classList.contains('mt-hud')) { hud.classList.remove('mt-hud'); hud.style.removeProperty('background-image'); } continue; }
      if (!lay) {
        const cs = getComputedStyle(hud);
        if (cs.backgroundImage === 'none') continue;
        lay = el('div', { class: 'mt-hud-bg' });
        Object.assign(lay.style, { position: 'absolute', inset: '0', zIndex: '-1', pointerEvents: 'none', backgroundImage: cs.backgroundImage, backgroundPosition: cs.backgroundPosition, backgroundRepeat: cs.backgroundRepeat, backgroundSize: cs.backgroundSize });
        if (cs.position === 'static') hud.style.position = 'relative';
        hud.style.isolation = 'isolate';
        hud.prepend(lay);
        // ikony złota i smoczych łusek zostają w oryginalnych kolorach: niezabarwiona kopia grafiki tylko w ich miejscu
        const ico = el('div', { class: 'mt-hud-ico' });
        Object.assign(ico.style, { position: 'absolute', inset: '0', zIndex: '-1', pointerEvents: 'none', backgroundImage: cs.backgroundImage, backgroundPosition: cs.backgroundPosition, backgroundRepeat: cs.backgroundRepeat, backgroundSize: cs.backgroundSize });
        const circ = (x, y, r) => `M${x - r},${y}a${r},${r} 0 1,0 ${2 * r},0a${r},${r} 0 1,0 ${-2 * r},0`;
        const g = hud.querySelector('.gold-btn'), c = hud.querySelector('.credits-btn');
        const parts = [];
        if (g) parts.push(circ(g.offsetLeft - 15, g.offsetTop + 10.5, 11));
        if (c) parts.push(circ(c.offsetLeft - 11, c.offsetTop + 10.5, 11));
        if (parts.length) { ico.style.clipPath = `path('${parts.join(' ')}')`; lay.after(ico); }
      }
      hud.classList.add('mt-hud');
      hud.style.setProperty('background-image', 'none', 'important');
    }
  }

  /* ── dane wyglądu dla twórcy ── */
  function collectLook() {
    const short = (v) => String(v || '').replace(/url\("?([^")]*)"?\)/g, (m, u) => 'url(' + u.split('/').slice(-2).join('/').slice(0, 60) + ')').slice(0, 140);
    const chain = (n) => { const p = []; for (let x = n, i = 0; x && x !== document.body && i < 3; x = x.parentElement, i++) p.unshift((x.tagName || '').toLowerCase() + (typeof x.className === 'string' && x.className.trim() ? '.' + x.className.trim().split(/\s+/).slice(0, 4).join('.') : '')); return p.join(' > '); };
    const ownText = (n) => [...n.childNodes].filter((c) => c.nodeType === 3).map((c) => c.textContent.trim()).join(' ').slice(0, 24);
    const els = [], seen = new Set();
    for (const n of $$('body *')) {
      if (n.closest('.mp-glass, #mp-qbar, #mp-qpop, .mp-modal-bg, #mp-ctx, #mp-eqtip, #mp-launcher') || /^(SCRIPT|STYLE|LINK|svg|path)$/i.test(n.tagName)) continue;
      const r = n.getBoundingClientRect();
      if (r.width < 6 || r.height < 6 || !isVisible(n)) continue;
      const cs = getComputedStyle(n);
      const hasBg = cs.backgroundImage !== 'none', hasBi = cs.borderImageSource !== 'none', hasCol = cs.backgroundColor !== 'rgba(0, 0, 0, 0)';
      const txt = ownText(n);
      if (!hasBg && !hasBi && !hasCol && !txt) continue;
      const k = chain(n) + '|' + (hasBg ? short(cs.backgroundImage) : '') + '|' + (txt ? 't' : '');
      if (seen.has(k)) continue;
      seen.add(k);
      els.push({ el: chain(n), wh: Math.round(r.width) + 'x' + Math.round(r.height), bg: hasBg ? short(cs.backgroundImage) : undefined, bi: hasBi ? short(cs.borderImageSource) + ' ' + cs.borderImageSlice + ' / ' + cs.borderWidth : undefined, bgc: hasCol ? cs.backgroundColor : undefined, col: txt ? cs.color : undefined, font: txt ? cs.fontFamily.split(',')[0] + ' ' + cs.fontSize : undefined, txt: txt || undefined });
      if (els.length > 900) break;
    }
    const tree = (n, d) => ({ c: (n.tagName || '').toLowerCase() + (typeof n.className === 'string' && n.className.trim() ? '.' + n.className.trim().split(/\s+/).join('.') : ''), k: d < 5 ? [...n.children].slice(0, 10).map((x) => tree(x, d + 1)) : undefined });
    const wins = $$('.c-window, .border-window, [class*="-window"]').filter((w) => isVisible(w) && !w.closest('.mp-glass') && !w.parentElement.closest('.c-window, .border-window')).slice(0, 8).map((w) => tree(w, 0));
    const txt = JSON.stringify({ wersja: MP.version, styl: cfg && cfg.theme, ekran: innerWidth + 'x' + innerHeight, okna: wins, elementy: els });
    const fallback = () => { const t = el('textarea', { style: { position: 'fixed', left: '-9999px' } }); t.value = txt; document.body.appendChild(t); t.select(); try { document.execCommand('copy'); } catch {} t.remove(); };
    try { navigator.clipboard.writeText(txt).catch(fallback); } catch { fallback(); }
    toast(`Motywnik: skopiowano dane wyglądu (${els.length} elementów) — wklej je w rozmowie`, 'ok', 5000);
  }

  /* ── własne style ── */
  const uid = () => Math.random().toString(36).slice(2, 9);
  async function saveCustom(text, name, rerender) {
    const nm = name || await MP.promptBox({ title: 'Nazwa stylu', label: 'Pod tą nazwą styl pojawi się na liście', value: 'Mój styl', okText: 'Zapisz' });
    if (!nm) return;
    const item = { id: uid(), name: nm, css: text };
    cfg.custom = (cfg.custom || []).concat(item); cfg.customOn = item.id;
    config.save(); apply(); rerender();
    toast(`Motywnik: zapisano i włączono styl „${nm}"`);
  }
  function loadFile(rerender) {
    const inp = el('input', { type: 'file', accept: '.css,text/css,.txt', style: { display: 'none' } });
    inp.addEventListener('change', () => {
      const f = inp.files && inp.files[0]; if (!f) return;
      const rd = new FileReader();
      rd.onload = () => { saveCustom(String(rd.result || ''), f.name.replace(/\.(css|txt)$/i, ''), rerender); inp.remove(); };
      rd.readAsText(f);
    });
    document.body.appendChild(inp); inp.click();
  }
  function download(name, text) {
    const a = el('a', { href: URL.createObjectURL(new Blob([text], { type: 'text/css' })), download: (name || 'styl') + '.css' });
    document.body.appendChild(a); a.click(); a.remove();
  }

  /** Podgląd: kawałek ramy, okno z nagłówkiem i przycisk — w kolorach stylu. */
  function preview(k) {
    const t = THEMES[k];
    if (t.none) return el('div', { class: 'mp-mt-stage domyslny' }, el('div', { class: 'mp-mt-win domyslny' }, el('i', null, 'Grupa'), el('span', null, 'Habiachi (41p)'), el('em', null, 'Rozwiąż grupę')));
    const st = el('div', { class: 'mp-mt-stage' });
    st.style.background = `radial-gradient(ellipse at 50% 0%, ${t.glow}, transparent 65%), ${t.bg0}`;
    st.style.boxShadow = `inset 0 0 0 1px ${t.line}, inset 0 0 18px ${t.edge}`;
    const w = el('div', { class: 'mp-mt-win' }, el('i', null, 'Grupa'), el('span', null, 'Habiachi (41p)'), el('em', null, 'Rozwiąż grupę'));
    Object.assign(w.style, { background: `linear-gradient(${t.bg2}, ${t.bg1} 26%)`, boxShadow: `0 0 0 1px ${t.line}, 0 0 12px ${t.glow}`, color: t.text, borderTop: `2px solid ${t.a1}` });
    Object.assign(w.querySelector('i').style, { color: t.text, textShadow: `0 0 8px ${t.glow}`, fontFamily: t.head });
    Object.assign(w.querySelector('em').style, { background: `linear-gradient(${t.btn[0]}, ${t.btn[1]})`, boxShadow: `inset 0 0 0 1px ${t.btnLine}`, color: t.btnText });
    st.appendChild(w);
    return st;
  }

  defineAddon({
    id: 'motywnik', name: 'Motywnik', icon: 'motywnik', color: ['#2ef2c4', '#8a5cff'], renderFirst: true,
    desc: 'Style całego interfejsu: ramy ekranu, paski, okna, nagłówki, zakładki, przyciski, menu, sloty, dymki i czat. Domyślny = klasyczny wygląd gry. Rozmiary zostają jak w grze. Możesz też wgrać własne style CSS.',
    defaults: { theme: 'domyslny', custom: [], customOn: null },
    settings: [],
    render(box, c, rerender) {
      const grid = el('div', { class: 'mp-mt-grid' });
      for (const [k, t] of Object.entries(THEMES)) grid.appendChild(el('div', { class: 'mp-mt-card' + (c.theme === k ? ' on' : ''), onclick: () => { c.theme = k; config.save(); apply(); rerender(); } }, preview(k), el('div', { class: 'mp-mt-name' }, t.name), el('div', { class: 'mp-mt-desc' }, t.desc)));
      const tc = el('div', { class: 'mp-card' }, el('h3', null, 'Styl interfejsu'), grid);
      if (!c.enabled) tc.prepend(MP.note('info', 'Dodatek jest wyłączony — gra ma swój wygląd.'));
      let editing = null;
      const ta = el('textarea', { class: 'mp-in', placeholder: '/* Własny CSS, np.:\n.button.green { color: #ffd27a !important; } */' });
      ta.addEventListener('keydown', (e) => e.stopPropagation());
      const list = el('div', { class: 'mp-mt-own' });
      (c.custom || []).forEach((s) => list.appendChild(el('div', { class: 'mp-mt-row' },
        el('button', { class: 'mp-upchip' + (c.customOn === s.id ? ' on' : ''), onclick: () => { c.customOn = c.customOn === s.id ? null : s.id; config.save(); apply(); rerender(); } }, c.customOn === s.id ? 'Włączony' : 'Włącz'),
        el('b', { style: { flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, s.name),
        el('button', { class: 'mp-btn', onclick: () => { ta.value = s.css; ta.focus(); editing = s.id; } }, 'Edytuj'),
        el('button', { class: 'mp-btn', onclick: () => download(s.name, s.css) }, 'Pobierz'),
        el('button', { class: 'mp-btn bad', onclick: async () => { if (await MP.confirmBox({ title: `Usunąć „${s.name}"?`, okText: 'Usuń', danger: true })) { c.custom = c.custom.filter((x) => x.id !== s.id); if (c.customOn === s.id) c.customOn = null; config.save(); apply(); rerender(); } } }, 'Usuń'))));
      const oc = el('div', { class: 'mp-card' }, el('h3', null, 'Własne style'),
        (c.custom || []).length ? list : el('div', { class: 'mp-dim', style: { marginBottom: '8px' } }, 'Wklej CSS albo wczytaj plik .css. Działa razem z wybranym stylem (z „Domyślnym" jest jedyny).'),
        ta,
        el('div', { class: 'mp-btns' },
          el('button', { class: 'mp-btn', onclick: () => { if (!styleEl) apply(); styleEl.textContent += '\n' + ta.value; toast('Motywnik: podgląd przez 8 sekund'); setTimeout(() => apply(), 8000); } }, 'Podgląd'),
          el('button', { class: 'mp-btn pri', onclick: () => {
            if (!ta.value.trim()) { toast('Motywnik: wpisz najpierw CSS', 'warn'); return; }
            if (editing) { const s = c.custom.find((x) => x.id === editing); if (s) { s.css = ta.value; config.save(); apply(); toast(`Motywnik: zapisano „${s.name}"`); rerender(); return; } }
            saveCustom(ta.value, null, rerender);
          } }, 'Zapisz styl'),
          el('button', { class: 'mp-btn', onclick: () => loadFile(rerender) }, 'Wczytaj plik .css'),
          THEMES[c.theme] && !THEMES[c.theme].none ? el('button', { class: 'mp-btn', onclick: () => download(THEMES[c.theme].name, css(THEMES[c.theme])) }, 'Pobierz CSS stylu') : null));
      const dc = el('div', { class: 'mp-card' }, el('h3', null, 'Coś wygląda nie tak?'),
        el('div', { class: 'mp-dim', style: { marginBottom: '8px' } }, 'Otwórz okno, które źle wygląda, kliknij przycisk i wklej wynik w rozmowie (razem ze zrzutem ekranu).'),
        el('div', { class: 'mp-btns' }, el('button', { class: 'mp-btn', onclick: collectLook }, 'Zbierz dane wyglądu')));
      box.append(tc, oc, dc);
    },
    init(c) {
      cfg = c;
      if (!THEMES[c.theme]) c.theme = { mroczny: 'obsydian' }[c.theme] || 'domyslny';
      if ('ember' in c) { delete c.ember; config.save(); }
      bus.on('popup:shown', (labels) => tagMenu(labels));
      apply();
      MP.motywnik = { apply, collectLook, THEMES, texture, current: () => (active() ? THEMES[cfg.theme] : null) };
    },
    onToggle() { apply(); },
  });
})();

// ═══ src/addons/legenda.js ═══
/* ───────── Legendarny Łup ─────────
 * Gdy w oknie łupu pojawia się przedmiot legendarny — efekt na cały ekran z dźwiękiem.
 * Style: Thor (błyskawice i grzmoty), Smoke (czarny dym za oknem łupu), Kasyno (złote monety),
 * Disco (kula disco, światła, neony i muzyka) oraz Własny (sam składasz warstwy, kolor i dźwięk).
 * Każdy styl ma wbudowany dźwięk (syntezowany w przeglądarce — nie da się go usunąć) i może mieć własny
 * plik dźwiękowy (trzymany w IndexedDB przeglądarki).
 *
 * Rysowanie: dwa płótna — „tył" (za oknem łupu: dym, promienie, poświata) i „przód" (nad wszystkim:
 * błyskawice, monety, kula disco, neony, napis). Oba bez przechwytywania kliknięć.
 */
(() => {
  let cfg;
  const LOOT_SEL = '.loot-wnd, .loots-window, .loot-window, [class*="loot-window"], [class*="loots-window"], .c-window[class*="loot"]';
  const FONTS = 'https://fonts.googleapis.com/css2?family=Cinzel:wght@700;900&family=Bungee&family=Monoton&display=swap';

  const STYLES = {
    thor: { name: 'Thor', desc: 'Burza nad ekranem: błyskawice biją w okno łupu, grzmoty przetaczają się po głośnikach.', col: '#8fc4ff', grad: ['#16244a', '#3c6fd1'], dur: 6200 },
    smoke: { name: 'Smoke', desc: 'Z okna łupu bucha czarny dym, który wznosi się i rozpływa po całym ekranie.', col: '#cfd3d8', grad: ['#0c0c0e', '#3a3d44'], dur: 7200 },
    kasyno: { name: 'Kasyno', desc: 'Jackpot! Fontanna i deszcz złotych monet z brzękiem, złote światła za oknem.', col: '#ffd34d', grad: ['#3a2600', '#d39a14'], dur: 6600 },
    disco: { name: 'Disco', desc: 'Nad oknem łupu zjeżdża kula disco, światła wirują, latają neony i gra muzyka.', col: '#ff4fd8', grad: ['#2a0a3e', '#ff2bd6'], dur: 9000 },
    wlasny: { name: 'Własny', desc: 'Złóż efekt sam: wybierz warstwy, kolor i dźwięk.', col: '#7c5cff', grad: ['#1d1640', '#7c5cff'], dur: 6500 },
  };
  const LAYERS = [
    ['flash', 'Rozbłysk'], ['bolts', 'Błyskawice'], ['smoke', 'Dym'], ['coins', 'Monety'],
    ['ball', 'Kula disco'], ['beams', 'Światła'], ['neon', 'Neony'], ['glow', 'Poświata'], ['banner', 'Napis'], ['media', 'Moja animacja'],
  ];
  const PRESET_LAYERS = {
    thor: ['storm', 'bolts', 'flash', 'banner'],
    smoke: ['shade', 'smoke', 'banner'],
    kasyno: ['glow', 'sunburst', 'coins', 'banner'],
    disco: ['shade', 'beams', 'spots', 'ball', 'neon', 'pulse', 'banner'],
  };
  /** Uderzenia piorunów (sekundy) — wspólne dla obrazu i grzmotów; mocne otwarcie, potem burza do końca efektu. */
  function strikesFor(dur) {
    const out = [0.1, 0.82, 1.5, 1.95, 3.05, 3.9];
    let t = 3.9;
    while (true) { t += R(1.1, 2.2); if (t > dur - 1.6) break; out.push(+t.toFixed(2)); if (Math.random() < 0.3 && t + 0.4 < dur - 1.6) out.push(+(t + R(0.25, 0.45)).toFixed(2)); }
    return out.filter((x) => x < dur - 1);
  }
  let STRIKES = [0.1, 0.82, 1.5, 1.95, 3.05, 3.9];
  /** Fontanny monet w Kasynie (sekundy) — wspólne dla obrazu i dźwięku. */
  const FOUNTAINS = (dur) => { const o = [0]; for (let t = 4.6; t < dur - 3; t += 4.6) o.push(t); return o; };
  const durOf = () => Math.max(5, Math.min(20, Number(cfg && cfg.dur) || 15));

  /* ═════════════════ narzędzia ═════════════════ */
  const R = (a, b) => a + Math.random() * (b - a);
  const ease = { out: (p) => 1 - Math.pow(1 - p, 3), back: (p) => { const c = 1.6; return 1 + (c + 1) * Math.pow(p - 1, 3) + c * Math.pow(p - 1, 2); } };
  const hexRgb = (h) => { h = String(h || '#ffffff').replace('#', ''); if (h.length === 3) h = h.split('').map((c) => c + c).join(''); const n = parseInt(h, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const rgba = (h, a) => { const [r, g, b] = hexRgb(h); return `rgba(${r},${g},${b},${a})`; };

  /* ── IndexedDB na własne pliki dźwiękowe ── */
  const idb = {
    db: null,
    open() {
      if (this.db) return Promise.resolve(this.db);
      return new Promise((res, rej) => {
        const q = indexedDB.open('l4tools', 1);
        q.onupgradeneeded = () => q.result.createObjectStore('audio');
        q.onsuccess = () => { this.db = q.result; res(this.db); };
        q.onerror = () => rej(q.error);
      });
    },
    async op(mode, fn) { const db = await this.open(); return new Promise((res, rej) => { const tx = db.transaction('audio', mode); const r = fn(tx.objectStore('audio')); tx.oncomplete = () => res(r && r.result); tx.onerror = () => rej(tx.error); }); },
    get(k) { return this.op('readonly', (s) => s.get(k)); },
    put(k, v) { return this.op('readwrite', (s) => s.put(v, k)); },
    del(k) { return this.op('readwrite', (s) => s.delete(k)); },
  };

  /* ═════════════════ dźwięk (Web Audio) ═════════════════ */
  let AC = null;
  function ac() {
    if (!AC) { const C = W.AudioContext || W.webkitAudioContext; if (!C) return null; AC = new C(); }
    if (AC.state === 'suspended') AC.resume().catch(() => {});
    return AC;
  }
  function noiseBuf(a, sec, brown) {
    const b = a.createBuffer(2, Math.floor(a.sampleRate * sec), a.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c); let last = 0;
      for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; if (brown) { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w; }
    }
    return b;
  }
  const env = (g, t0, a, peak, d, end = 0.0001) => { g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(peak, t0 + a); g.gain.exponentialRampToValueAtTime(end, t0 + a + d); };
  function src(a, buf) { const s = a.createBufferSource(); s.buffer = buf; return s; }

  const SOUND = {
    /** Grzmot: suchy trzask + przetaczający się pomruk, rozłożony w stereo. */
    thor(a, out, t0, dur = 15) {
      const white = noiseBuf(a, 1.2), brown = noiseBuf(a, 6, true);
      STRIKES.forEach((s, i) => {
        const t = t0 + s, big = i % 2 === 0;
        // trzask
        const n = src(a, white), hp = a.createBiquadFilter(), g = a.createGain(), p = a.createStereoPanner();
        hp.type = 'highpass'; hp.frequency.value = 1200; p.pan.value = R(-0.6, 0.6);
        env(g, t, 0.004, big ? 0.55 : 0.32, 0.22);
        n.connect(hp).connect(g).connect(p).connect(out); n.start(t); n.stop(t + 0.5);
        // pomruk
        const r = src(a, brown), lp = a.createBiquadFilter(), g2 = a.createGain(), p2 = a.createStereoPanner();
        lp.type = 'lowpass'; lp.frequency.setValueAtTime(900, t + 0.05); lp.frequency.exponentialRampToValueAtTime(120, t + 2.6);
        p2.pan.setValueAtTime(p.pan.value, t); p2.pan.linearRampToValueAtTime(-p.pan.value, t + 2.8);
        g2.gain.setValueAtTime(0.0001, t); g2.gain.exponentialRampToValueAtTime(big ? 0.95 : 0.55, t + 0.12);
        for (let k = 1; k < 8; k++) g2.gain.exponentialRampToValueAtTime((big ? 0.8 : 0.45) * R(0.35, 1) / (1 + k * 0.45), t + 0.12 + k * 0.33);
        g2.gain.exponentialRampToValueAtTime(0.0001, t + 3.4);
        r.connect(lp).connect(g2).connect(p2).connect(out); r.start(t, R(0, 2)); r.stop(t + 3.5);
      });
      // deszcz w tle
      const rain = src(a, white), bp = a.createBiquadFilter(), gr = a.createGain(); rain.loop = true;
      bp.type = 'bandpass'; bp.frequency.value = 5000; bp.Q.value = 0.4;
      gr.gain.setValueAtTime(0.0001, t0); gr.gain.exponentialRampToValueAtTime(0.06, t0 + 1); gr.gain.setValueAtTime(0.06, t0 + dur - 1.2); gr.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      rain.connect(bp).connect(gr).connect(out); rain.start(t0); rain.stop(t0 + dur + 0.1);
    },
    /** Dym: głęboki wybuch powietrza, potem szum rozchodzący się na boki. */
    smoke(a, out, t0, dur = 15) {
      const white = noiseBuf(a, 8), brown = noiseBuf(a, 8, true), D = dur;
      const boom = src(a, brown), lp = a.createBiquadFilter(), gb = a.createGain();
      lp.type = 'lowpass'; lp.frequency.setValueAtTime(400, t0); lp.frequency.exponentialRampToValueAtTime(60, t0 + 1.6);
      env(gb, t0, 0.03, 1.8, 1.8); boom.connect(lp).connect(gb).connect(out); boom.start(t0); boom.stop(t0 + 2);
      [-0.75, 0.75, 0].forEach((pan, i) => {
        const n = src(a, white), bp = a.createBiquadFilter(), g = a.createGain(), p = a.createStereoPanner();
        bp.type = 'bandpass'; bp.Q.value = 0.9;
        bp.frequency.setValueAtTime(220, t0); bp.frequency.exponentialRampToValueAtTime(1400 + i * 300, t0 + 0.7); bp.frequency.exponentialRampToValueAtTime(380, t0 + D * 0.5); bp.frequency.exponentialRampToValueAtTime(240, t0 + D);
        p.pan.setValueAtTime(0, t0); p.pan.linearRampToValueAtTime(pan, t0 + 3);
        g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(i === 2 ? 0.5 : 0.35, t0 + 0.35); g.gain.exponentialRampToValueAtTime(0.16, t0 + 3); g.gain.setValueAtTime(0.16, t0 + D - 3); g.gain.exponentialRampToValueAtTime(0.0001, t0 + D);
        n.loop = true; n.connect(bp).connect(g).connect(p).connect(out); n.start(t0, i); n.stop(t0 + D + 0.1);
      });
      const hiss = src(a, white), hp = a.createBiquadFilter(), gh = a.createGain();
      hp.type = 'highpass'; hp.frequency.value = 6000; env(gh, t0 + 0.1, 0.4, 0.05, D - 0.6);
      hiss.loop = true; hiss.connect(hp).connect(gh).connect(out); hiss.start(t0 + 0.1); hiss.stop(t0 + D);
      // kolejne kłęby: miękkie „puff" co kilka sekund, w rytm nowych chmur na ekranie
      for (let tt = 3.2; tt < D - 2.5; tt += R(2.4, 3.4)) {
        const pf = src(a, brown), lp2 = a.createBiquadFilter(), g3 = a.createGain(), pp = a.createStereoPanner();
        lp2.type = 'lowpass'; lp2.frequency.setValueAtTime(700, t0 + tt); lp2.frequency.exponentialRampToValueAtTime(90, t0 + tt + 1.4); pp.pan.value = R(-0.7, 0.7);
        env(g3, t0 + tt, 0.08, 0.7, 1.4); pf.connect(lp2).connect(g3).connect(pp).connect(out); pf.start(t0 + tt, R(0, 5)); pf.stop(t0 + tt + 1.6);
      }
    },
    /** Monety: dzwonek „jackpot" i kaskada metalicznych brzęknięć. */
    kasyno(a, out, t0, dur = 15) {
      const ding = (tt) => [1046.5, 1318.5, 1568, 2093].forEach((f, i) => {
        const o = a.createOscillator(), g = a.createGain(); o.type = 'triangle'; o.frequency.value = f;
        env(g, tt + i * 0.07, 0.005, 0.22, 1.1); o.connect(g).connect(out); o.start(tt + i * 0.07); o.stop(tt + i * 0.07 + 1.3);
      });
      FOUNTAINS(dur).forEach((f) => ding(t0 + f));
      const clink = (t, f, v, pan) => {
        const p = a.createStereoPanner(); p.pan.value = pan; p.connect(out);
        [1, 2.76, 5.4, 8.93].forEach((m, k) => {
          const o = a.createOscillator(), g = a.createGain(); o.type = 'sine'; o.frequency.value = f * m;
          env(g, t, 0.002, v / (1 + k * 1.3), R(0.12, 0.35)); o.connect(g).connect(p); o.start(t); o.stop(t + 0.45);
        });
      };
      const span = Math.max(3, dur - 2.5);
      for (let i = 0; i < Math.round(22 * span); i++) { const t = t0 + 0.15 + Math.random() * span; clink(t, R(2100, 4200), R(0.04, 0.13), R(-0.8, 0.8)); }
      FOUNTAINS(dur).forEach((f) => { for (let i = 0; i < 8; i++) clink(t0 + f + 0.05 + i * 0.045, R(2600, 3400), 0.2, R(-0.3, 0.3)); });
    },
    /** Disco: 4 takty 120 BPM — stopa, hi-hat, klaśnięcie, oktawowy bas, akordy i smyczki na wejście. */
    disco(a, out, t0, dur = 15) {
      const bpm = 120, beat = 60 / bpm, bars = Math.max(2, Math.floor(dur / (beat * 4)));
      const comp = a.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 4; comp.connect(out);
      const white = noiseBuf(a, 1);
      const fadeT = t0 + bars * 4 * beat;
      const master = a.createGain(); master.gain.setValueAtTime(1, t0); master.gain.setValueAtTime(1, fadeT - 0.8); master.gain.linearRampToValueAtTime(0.0001, fadeT + 0.2); master.connect(comp);
      const kick = (t) => { const o = a.createOscillator(), g = a.createGain(); o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.12); env(g, t, 0.002, 0.8, 0.28); o.connect(g).connect(master); o.start(t); o.stop(t + 0.32); };
      const hat = (t, open) => { const n = src(a, white), hp = a.createBiquadFilter(), g = a.createGain(); hp.type = 'highpass'; hp.frequency.value = 7500; env(g, t, 0.002, open ? 0.22 : 0.12, open ? 0.2 : 0.05); n.connect(hp).connect(g).connect(master); n.start(t); n.stop(t + 0.3); };
      const clap = (t) => { const bp = a.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1500; bp.Q.value = 0.8; bp.connect(master); [0, 0.011, 0.022].forEach((d) => { const n = src(a, white), g = a.createGain(); env(g, t + d, 0.001, 0.5, d === 0.022 ? 0.16 : 0.02); n.connect(g).connect(bp); n.start(t + d); n.stop(t + d + 0.2); }); };
      const CH = [[57, [57, 60, 64, 67]], [62, [62, 66, 69, 72]], [55, [55, 59, 62, 66]], [60, [60, 64, 67, 71]]]; // Am7 D9 Gmaj7 Cmaj7 (MIDI)
      const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
      const bass = (t, m) => { const o = a.createOscillator(), f = a.createBiquadFilter(), g = a.createGain(); o.type = 'sawtooth'; o.frequency.value = hz(m - 24); f.type = 'lowpass'; f.frequency.setValueAtTime(900, t); f.frequency.exponentialRampToValueAtTime(220, t + 0.2); env(g, t, 0.005, 0.32, 0.2); o.connect(f).connect(g).connect(master); o.start(t); o.stop(t + 0.26); };
      const stab = (t, notes) => { const f = a.createBiquadFilter(), g = a.createGain(); f.type = 'lowpass'; f.frequency.setValueAtTime(3200, t); f.frequency.exponentialRampToValueAtTime(700, t + 0.18); env(g, t, 0.004, 0.09, 0.2); f.connect(g).connect(master); notes.forEach((m) => [-6, 6].forEach((det) => { const o = a.createOscillator(); o.type = 'sawtooth'; o.frequency.value = hz(m); o.detune.value = det; o.connect(f); o.start(t); o.stop(t + 0.25); })); };
      // smyczkowy „swoosh" na wejście
      const sw = a.createBiquadFilter(), sg = a.createGain(); sw.type = 'lowpass'; sw.frequency.setValueAtTime(300, t0); sw.frequency.exponentialRampToValueAtTime(5000, t0 + 1.2); sg.gain.setValueAtTime(0.0001, t0); sg.gain.exponentialRampToValueAtTime(0.12, t0 + 1); sg.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.8); sw.connect(sg).connect(master);
      [69, 72, 76, 81].forEach((m) => [-8, 8].forEach((d) => { const o = a.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(hz(m - 12), t0); o.frequency.exponentialRampToValueAtTime(hz(m), t0 + 1.2); o.detune.value = d; o.connect(sw); o.start(t0); o.stop(t0 + 1.9); }));
      for (let bar = 0; bar < bars; bar++) {
        const [root, notes] = CH[bar % 4];
        for (let b = 0; b < 4; b++) {
          const t = t0 + (bar * 4 + b) * beat;
          kick(t); hat(t + beat / 2, true); hat(t + beat / 4); hat(t + beat * 3 / 4);
          if (b % 2 === 1) clap(t);
          bass(t, root); bass(t + beat / 2, root + 12);
          if (b === 1 || b === 3) stab(t + beat / 2, notes);
        }
      }
    },
  };
  const SOUND_KEYS = [['thor', 'Grzmoty (Thor)'], ['smoke', 'Dym (Smoke)'], ['kasyno', 'Monety (Kasyno)'], ['disco', 'Muzyka disco (Disco)'], ['own', 'Własny plik'], ['none', 'Bez dźwięku']];

  const bufCache = {};
  async function ownBuffer(key) {
    if (bufCache[key]) return bufCache[key];
    const rec = await idb.get('snd:' + key).catch(() => null);
    if (!rec || !rec.data) return null;
    const a = ac(); if (!a) return null;
    const buf = await a.decodeAudioData(rec.data.slice(0)).catch(() => null);
    if (buf) bufCache[key] = buf;
    return buf;
  }
  /** Gra dźwięk stylu: własny plik (jeśli wybrany i jest) albo wbudowany. Zwraca funkcję zatrzymującą. */
  async function playSound(styleKey, durMs) {
    const a = ac(); if (!a) return () => {};
    const vol = Math.max(0, Math.min(1, Number(cfg.volume ?? 0.7)));
    // ogranicznik na wyjściu: głośne grzmoty i stopa disco nie przesterują
    const lim = a.createDynamicsCompressor(); lim.threshold.value = -6; lim.knee.value = 4; lim.ratio.value = 12; lim.attack.value = 0.002; lim.release.value = 0.2; lim.connect(a.destination);
    const master = a.createGain(); master.gain.value = vol; master.connect(lim);
    const stop = () => { try { master.gain.cancelScheduledValues(a.currentTime); master.gain.setValueAtTime(master.gain.value, a.currentTime); master.gain.linearRampToValueAtTime(0.0001, a.currentTime + 0.6); setTimeout(() => { master.disconnect(); lim.disconnect(); }, 800); } catch {} };
    let which = styleKey;
    if (styleKey === 'wlasny') which = (cfg.custom && cfg.custom.sound) || 'thor';
    const useOwn = which === 'own' || (cfg.sounds && cfg.sounds[styleKey] === 'own');
    if (which === 'none') return stop;
    const t0 = a.currentTime + 0.03;
    if (useOwn) {
      const buf = await ownBuffer(styleKey);
      if (buf) {
        const s = a.createBufferSource(); s.buffer = buf; s.connect(master); s.start(t0);
        const end = t0 + durMs / 1000;
        master.gain.setValueAtTime(vol, Math.max(t0, end - 1)); master.gain.linearRampToValueAtTime(0.0001, end);
        s.stop(end + 0.05);
        return stop;
      }
      if (which === 'own') return stop;
    }
    const fn = SOUND[which] || SOUND.thor;
    if (!run) STRIKES = strikesFor(durMs / 1000);
    fn(a, master, t0, durMs / 1000);
    return stop;
  }

  /* ═════════════════ grafika ═════════════════ */
  /** Kafelki dymu: miękkie, nieregularne kłęby (kilka wariantów). */
  let smokeSprites = null;
  function getSmoke() {
    if (smokeSprites) return smokeSprites;
    smokeSprites = [0, 1, 2].map(() => {
      const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d');
      x.filter = 'blur(10px)';
      for (let i = 0; i < 34; i++) {
        const ang = R(0, 6.3), d = Math.pow(Math.random(), 0.7) * 62, r = R(22, 60) * (1 - d / 120);
        const px = 128 + Math.cos(ang) * d, py = 128 + Math.sin(ang) * d;
        const g = x.createRadialGradient(px, py, 0, px, py, r);
        const v = Math.floor(R(8, 38));
        g.addColorStop(0, `rgba(${v},${v},${v + 4},${R(0.22, 0.4)})`); g.addColorStop(0.6, `rgba(${v},${v},${v + 4},${R(0.1, 0.18)})`); g.addColorStop(1, `rgba(${v},${v},${v},0)`);
        x.fillStyle = g; x.beginPath(); x.arc(px, py, r, 0, 7); x.fill();
      }
      // jaśniejsze, „podświetlone" krawędzie kłębów
      x.globalCompositeOperation = 'source-atop';
      const hl = x.createLinearGradient(0, 40, 0, 220); hl.addColorStop(0, 'rgba(120,120,128,.22)'); hl.addColorStop(0.5, 'rgba(0,0,0,0)'); x.fillStyle = hl; x.fillRect(0, 0, 256, 256);
      return c;
    });
    return smokeSprites;
  }
  /** Moneta: awers (jaśniejszy) i rewers (ciemniejszy) — przy obrocie rysowane ze ściśnięciem w poziomie. */
  let coinSprites = null;
  function getCoins() {
    if (coinSprites) return coinSprites;
    coinSprites = [0, 1].map((back) => {
      const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
      const g = x.createRadialGradient(24, 22, 4, 32, 32, 31);
      if (back) { g.addColorStop(0, '#e9b93a'); g.addColorStop(0.7, '#a8740e'); g.addColorStop(1, '#5e3c02'); } else { g.addColorStop(0, '#fff6c4'); g.addColorStop(0.45, '#ffd34d'); g.addColorStop(0.85, '#c88d10'); g.addColorStop(1, '#7a4f04'); }
      x.fillStyle = g; x.beginPath(); x.arc(32, 32, 30, 0, 7); x.fill();
      x.strokeStyle = back ? '#6b4503' : '#9a6a08'; x.lineWidth = 2.4; x.beginPath(); x.arc(32, 32, 22, 0, 7); x.stroke();
      x.strokeStyle = 'rgba(255,255,255,.45)'; x.lineWidth = 1.2; x.beginPath(); x.arc(32, 32, 28.5, -2.6, -0.9); x.stroke();
      x.fillStyle = back ? '#7a5105' : '#a87410'; x.font = '900 26px Cinzel, Georgia, serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('L', 32, 34);
      x.fillStyle = 'rgba(255,255,255,.35)'; x.fillText('L', 31, 32.5);
      return c;
    });
    return coinSprites;
  }
  /** Piorun: przemieszczenie punktu środkowego + odnogi. */
  function bolt(x0, y0, x1, y1, disp, branches) {
    let pts = [[x0, y0], [x1, y1]];
    for (let it = 0; it < 8; it++) {
      const n = [pts[0]];
      for (let i = 1; i < pts.length; i++) {
        const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
        const dx = bx - ax, dy = by - ay, l = Math.hypot(dx, dy) || 1;
        const off = R(-disp, disp);
        n.push([(ax + bx) / 2 + (-dy / l) * off, (ay + by) / 2 + (dx / l) * off], [bx, by]);
      }
      pts = n; disp *= 0.55;
    }
    const out = [{ pts, w: 1 }];
    if (branches) for (let i = 8; i < pts.length - 20; i += 6) {
      if (Math.random() > 0.16) continue;
      const [px, py] = pts[i], ang = Math.atan2(y1 - y0, x1 - x0) + R(-0.9, 0.9), len = R(60, 180);
      out.push(...bolt(px, py, px + Math.cos(ang) * len, py + Math.sin(ang) * len, len * 0.18, false).map((b) => ({ pts: b.pts, w: 0.45 })));
    }
    return out;
  }
  function strokeBolt(x, b, a) {
    x.lineJoin = 'round'; x.lineCap = 'round';
    for (const { pts, w } of b) {
      x.beginPath(); x.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) x.lineTo(pts[i][0], pts[i][1]);
      x.shadowColor = 'rgba(120,170,255,1)'; x.shadowBlur = 34;
      x.strokeStyle = `rgba(110,160,255,${0.3 * a})`; x.lineWidth = 16 * w; x.stroke();
      x.shadowBlur = 14; x.strokeStyle = `rgba(170,210,255,${0.9 * a})`; x.lineWidth = 5.5 * w; x.stroke();
      x.shadowBlur = 0; x.strokeStyle = `rgba(255,255,255,${a})`; x.lineWidth = 2.2 * w; x.stroke();
    }
  }
  function star4(x, cx, cy, r, a, col = '#fff') {
    x.save(); x.globalAlpha = a; x.fillStyle = col; x.beginPath();
    x.moveTo(cx, cy - r); x.quadraticCurveTo(cx, cy, cx + r, cy); x.quadraticCurveTo(cx, cy, cx, cy + r); x.quadraticCurveTo(cx, cy, cx - r, cy); x.quadraticCurveTo(cx, cy, cx, cy - r);
    x.fill(); x.restore();
  }

  /*
   * Warstwy efektu. Każda: make(E) → { back(x,t,dt), front(x,t,dt) }.
   * E = { W, H, r: prostokąt okna łupu, dur (s), col, name, fade(t) — 0..1 wejście/wyjście }.
   */
  const L = {
    storm(E) {
      const sheets = Array.from({ length: Math.round(E.dur * 1.2) }, () => ({ at: R(0.3, E.dur - 1.2), x: R(0.1, 0.9), y: R(0.05, 0.4) }));
      return { back(x, t) {
        const a = E.fade(t);
        const g = x.createRadialGradient(E.W / 2, E.H * 0.3, 60, E.W / 2, E.H / 2, Math.max(E.W, E.H) * 0.75);
        g.addColorStop(0, `rgba(14,24,52,${a * 0.42})`); g.addColorStop(1, `rgba(3,6,18,${a * 0.72})`); x.fillStyle = g; x.fillRect(0, 0, E.W, E.H);
        // błyski w chmurach (rozproszone światło za horyzontem)
        for (const s of sheets.concat(STRIKES.map((at) => ({ at, x: 0.5, y: 0.1 })))) {
          const d = t - s.at; if (d < 0 || d > 0.35) continue;
          const k = (1 - d / 0.35) * (0.6 + 0.4 * Math.sin(d * 60));
          const gx = s.x * E.W, gy = s.y * E.H, rr = Math.max(E.W, E.H) * 0.45;
          const lg = x.createRadialGradient(gx, gy, 0, gx, gy, rr); lg.addColorStop(0, `rgba(150,180,255,${0.28 * k * a})`); lg.addColorStop(1, 'rgba(150,180,255,0)');
          x.fillStyle = lg; x.fillRect(0, 0, E.W, E.H);
        }
      } };
    },
    shade(E) {
      return { back(x, t) { x.fillStyle = `rgba(0,0,0,${(E.dim ?? 0.35) * E.fade(t)})`; x.fillRect(0, 0, E.W, E.H); } };
    },
    bolts(E) {
      const { r } = E;
      const strikes = STRIKES.filter((s) => s < E.dur - 1).map((s, i) => {
        const toWin = i % 2 === 0;
        const x1 = toWin ? R(r.left + r.width * 0.15, r.right - r.width * 0.15) : R(E.W * 0.05, E.W * 0.95);
        const y1 = toWin ? r.top + 4 : R(E.H * 0.45, E.H * 0.9);
        const x0 = x1 + R(-E.W * 0.25, E.W * 0.25);
        return { at: s, b: bolt(x0, -10, x1, y1, Math.hypot(x1 - x0, y1) * 0.16, true), end: [x1, y1], toWin, sparks: null };
      });
      return {
        front(x, t, dt) {
          x.save(); x.globalCompositeOperation = 'lighter';
          for (const s of strikes) {
            const p = (t - s.at) / 0.6;
            if (p < 0 || p > 1) continue;
            const a = Math.pow(1 - p, 1.4) * (0.55 + 0.45 * Math.abs(Math.sin(p * 38)));
            strokeBolt(x, s.b, a);
            if (!s.sparks) s.sparks = Array.from({ length: s.toWin ? 34 : 14 }, () => ({ x: s.end[0], y: s.end[1], vx: R(-260, 260), vy: R(-320, -40), l: R(0.35, 0.8), a: 0 }));
          }
          for (const s of strikes) if (s.sparks) for (const k of s.sparks) {
            k.a += dt; if (k.a > k.l) continue;
            k.vy += 900 * dt; const nx = k.x + k.vx * dt, ny = k.y + k.vy * dt;
            x.strokeStyle = `rgba(190,225,255,${1 - k.a / k.l})`; x.lineWidth = 1.6; x.beginPath(); x.moveTo(k.x, k.y); x.lineTo(nx, ny); x.stroke();
            k.x = nx; k.y = ny;
          }
          x.restore();
        },
      };
    },
    flash(E) {
      const times = E.layers.includes('bolts') ? STRIKES : [0.05];
      return { front(x, t) {
        let a = 0;
        for (const s of times) { const d = t - s; if (d >= 0 && d < 0.14) a += 0.42 * (1 - d / 0.14); const d2 = d - 0.09; if (d2 >= 0 && d2 < 0.1) a += 0.25 * (1 - d2 / 0.1); }
        if (a > 0) { x.fillStyle = E.custom ? rgba(E.col, Math.min(0.6, a)) : `rgba(205,225,255,${Math.min(0.6, a)})`; x.fillRect(0, 0, E.W, E.H); }
      } };
    },
    smoke(E) {
      const sp = getSmoke(), { r } = E, cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const P = []; let acc = 0;
      const spawn = (n, burst) => { for (let i = 0; i < n; i++) {
        const side = Math.floor(Math.random() * 4);
        const px = side === 0 ? R(r.left, r.right) : side === 1 ? r.right : side === 2 ? R(r.left, r.right) : r.left;
        const py = side === 0 ? r.top : side === 1 ? R(r.top, r.bottom) : side === 2 ? r.bottom : R(r.top, r.bottom);
        const dx = px - cx, dy = py - cy, l = Math.hypot(dx, dy) || 1, v = burst ? R(160, 340) : R(50, 140);
        P.push({ x: px, y: py, vx: (dx / l) * v * 1.4 + R(-25, 25), vy: (dy / l) * v - R(30, 90), r0: R(26, 50), r1: R(150, 300), rot: R(0, 6.3), vr: R(-0.6, 0.6), life: R(3, 4.6), age: 0, s: sp[i % 3], ph: R(0, 6), op: R(0.8, 1) });
      } };
      return { back(x, t, dt) {
        if (t < 0.05 && !P.length) spawn(70, true);
        if (t < E.dur - 3) { acc += dt * 38 * E.k; const n = Math.floor(acc); acc -= n; spawn(n, false); }
        for (let i = P.length - 1; i >= 0; i--) {
          const p = P[i]; p.age += dt; if (p.age > p.life) { P.splice(i, 1); continue; }
          const k = p.age / p.life;
          p.vx *= 1 - 0.35 * dt; p.vy = p.vy * (1 - 0.3 * dt) - 26 * dt;
          p.x += (p.vx + Math.sin(t * 0.9 + p.ph) * 14) * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
          const rad = p.r0 + (p.r1 - p.r0) * ease.out(k), a = (k < 0.1 ? k / 0.1 : 1 - Math.pow((k - 0.1) / 0.9, 0.8)) * p.op;
          x.save(); x.globalAlpha = Math.max(0, a); x.translate(p.x, p.y); x.rotate(p.rot); x.drawImage(p.s, -rad, -rad, rad * 2, rad * 2); x.restore();
        }
      } };
    },
    glow(E) {
      const { r } = E, col = E.custom ? E.col : '#ffc83a';
      return { back(x, t) {
        const a = E.fade(t) * (0.55 + 0.15 * Math.sin(t * 6));
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2, rad = Math.max(r.width, r.height) * 1.3;
        const g = x.createRadialGradient(cx, cy, Math.min(r.width, r.height) * 0.3, cx, cy, rad);
        g.addColorStop(0, rgba(col, 0.55 * a)); g.addColorStop(1, rgba(col, 0));
        x.fillStyle = g; x.fillRect(cx - rad, cy - rad, rad * 2, rad * 2);
      } };
    },
    sunburst(E) {
      const { r } = E;
      return { back(x, t) {
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2, len = Math.max(E.W, E.H), a = E.fade(t) * 0.16;
        x.save(); x.translate(cx, cy); x.rotate(t * 0.25); x.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 16; i++) {
          x.rotate((Math.PI * 2) / 16);
          const g = x.createLinearGradient(0, 0, len, 0); g.addColorStop(0, `rgba(255,214,90,${a})`); g.addColorStop(1, 'rgba(255,214,90,0)');
          x.fillStyle = g; x.beginPath(); x.moveTo(0, 0); x.lineTo(len, -len * 0.07); x.lineTo(len, len * 0.07); x.closePath(); x.fill();
        }
        x.restore();
      } };
    },
    coins(E) {
      const sp = getCoins(), { r } = E, C = [], G = []; let acc = 0, fi = 0; const fq = FOUNTAINS(E.dur);
      const add = (o) => C.push(Object.assign({ ph: R(0, 6.3), vph: R(7, 15), tilt: R(-0.5, 0.5), sz: R(11, 18), b: 0, dead: 0 }, o));
      return { front(x, t, dt) {
        while (fi < fq.length && t >= fq[fi]) { fi++; const cx = r.left + r.width / 2; for (let i = 0; i < 70; i++) add({ x: cx + R(-20, 20), y: r.top + 8, vx: R(-420, 420), vy: R(-1050, -520), g: 1500 }); }
        if (t < E.dur - 3) { acc += dt * (t < 3.2 ? 64 : 26) * E.k; const n = Math.floor(acc); acc -= n; for (let i = 0; i < n; i++) add({ x: R(0, E.W), y: R(-60, -20), vx: R(-40, 40), vy: R(180, 380), g: 700 }); }
        for (let i = C.length - 1; i >= 0; i--) {
          const c = C[i];
          c.vy += c.g * dt; c.x += c.vx * dt; c.y += c.vy * dt; c.ph += c.vph * dt;
          if (c.y > E.H - c.sz && c.vy > 0) { if (c.b < 1) { c.vy *= -0.38; c.vx *= 0.6; c.b++; c.y = E.H - c.sz; } else c.dead += dt * 2; }
          if (c.dead >= 1 || c.y > E.H + 60) { C.splice(i, 1); continue; }
          const cs = Math.cos(c.ph), w = Math.max(0.1, Math.abs(cs));
          x.save(); x.globalAlpha = (1 - c.dead) * Math.min(1, E.fade(t) * 1.5); x.translate(c.x, c.y); x.rotate(c.tilt);
          if (w < 0.35) { x.fillStyle = '#8a5a05'; x.fillRect(-c.sz * 0.12, -c.sz, c.sz * 0.24, c.sz * 2); }
          x.drawImage(sp[cs < 0 ? 1 : 0], -c.sz * w, -c.sz, c.sz * 2 * w, c.sz * 2);
          x.restore();
          if (Math.random() < 0.012) G.push({ x: c.x + R(-6, 6), y: c.y + R(-6, 6), a: 0 });
        }
        for (let i = G.length - 1; i >= 0; i--) { const g = G[i]; g.a += dt / 0.35; if (g.a >= 1) { G.splice(i, 1); continue; } star4(x, g.x, g.y, 9 * Math.sin(g.a * Math.PI), Math.sin(g.a * Math.PI), '#fffbe0'); }
      } };
    },
    ball(E) {
      const { r } = E, R0 = 50, cx = r.left + r.width / 2, ty = Math.max(R0 + 30, r.top - R0 - 34);
      E.ballPos = () => ({ x: cx, y: ty });
      const ROWS = 14, COLS = 26;
      return { front(x, t) {
        const p = Math.min(1, t / 0.8), cy = -R0 + (ty + R0) * ease.back(p), a = E.fade(t);
        E.ballPos = () => ({ x: cx, y: cy });
        x.save(); x.globalAlpha = a;
        // linka
        x.strokeStyle = 'rgba(200,200,210,.7)'; x.lineWidth = 1.4; x.beginPath(); x.moveTo(cx, 0); x.lineTo(cx, cy - R0); x.stroke();
        x.fillStyle = '#9aa0a8'; x.fillRect(cx - 5, cy - R0 - 6, 10, 7);
        // kula: kafelki-lustra na obracającej się sferze
        x.save(); x.beginPath(); x.arc(cx, cy, R0, 0, 7); x.clip();
        x.fillStyle = '#2a2c33'; x.fillRect(cx - R0, cy - R0, R0 * 2, R0 * 2);
        const rot = t * 0.9, light = [-0.5, 0.6, 0.62];
        for (let i = 0; i < ROWS; i++) {
          const la0 = -Math.PI / 2 + (i / ROWS) * Math.PI, la1 = la0 + Math.PI / ROWS;
          for (let j = 0; j < COLS; j++) {
            const lo0 = (j / COLS) * Math.PI * 2 + rot, lo1 = lo0 + (Math.PI * 2) / COLS;
            const lm = (la0 + la1) / 2, om = (lo0 + lo1) / 2;
            const nz = Math.cos(lm) * Math.cos(om); if (nz <= 0.02) continue;
            const pt = (la, lo) => [cx + R0 * Math.cos(la) * Math.sin(lo), cy - R0 * Math.sin(la)];
            const q = [pt(la0 + 0.02, lo0 + 0.02), pt(la0 + 0.02, lo1 - 0.02), pt(la1 - 0.02, lo1 - 0.02), pt(la1 - 0.02, lo0 + 0.02)];
            const nx = Math.cos(lm) * Math.sin(om), ny = Math.sin(lm);
            let b = 0.28 + 0.6 * Math.max(0, nx * light[0] + ny * light[1] + nz * light[2]);
            const hsh = Math.sin(i * 12.9898 + j * 78.233 + Math.floor(t * 9) * 3.1) * 43758.5453; const sp = hsh - Math.floor(hsh);
            const hue = (t * 70 + j * 14 + i * 9) % 360;
            x.fillStyle = sp > 0.965 ? '#ffffff' : `hsl(${hue},${sp > 0.86 ? 75 : 12}%,${Math.round(b * 78)}%)`;
            x.beginPath(); x.moveTo(q[0][0], q[0][1]); for (let k = 1; k < 4; k++) x.lineTo(q[k][0], q[k][1]); x.closePath(); x.fill();
          }
        }
        const sh = x.createRadialGradient(cx - R0 * 0.35, cy - R0 * 0.4, R0 * 0.1, cx, cy, R0);
        sh.addColorStop(0, 'rgba(255,255,255,.28)'); sh.addColorStop(0.6, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(0,0,0,.55)');
        x.fillStyle = sh; x.fillRect(cx - R0, cy - R0, R0 * 2, R0 * 2);
        x.restore();
        for (let k = 0; k < 3; k++) { const g = (t * 1.7 + k * 0.33) % 1; star4(x, cx + Math.cos(k * 2.1 + t) * R0 * 0.6, cy + Math.sin(k * 1.7 + t * 1.3) * R0 * 0.5, 10 * Math.sin(g * Math.PI), Math.sin(g * Math.PI)); }
        x.restore();
      } };
    },
    beams(E) {
      const cols = ['#ff2bd6', '#00e5ff', '#ffe600', '#7cff4f', '#a35bff', '#ff7a1a'];
      return { back(x, t) {
        const b = E.ballPos ? E.ballPos() : { x: E.W / 2, y: 60 }, len = Math.hypot(E.W, E.H), a = E.fade(t) * 0.22;
        x.save(); x.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 9; i++) {
          const ang = t * (i % 2 ? 0.7 : -0.55) + i * 0.7 + Math.sin(t * 0.8 + i) * 0.4;
          if (Math.sin(ang) < -0.2) continue;
          const g = x.createLinearGradient(b.x, b.y, b.x + Math.cos(ang) * len, b.y + Math.sin(ang) * len);
          const c = cols[i % cols.length]; g.addColorStop(0, rgba(c, a)); g.addColorStop(0.8, rgba(c, 0));
          x.fillStyle = g; x.beginPath(); x.moveTo(b.x, b.y);
          x.lineTo(b.x + Math.cos(ang - 0.05) * len, b.y + Math.sin(ang - 0.05) * len); x.lineTo(b.x + Math.cos(ang + 0.05) * len, b.y + Math.sin(ang + 0.05) * len); x.closePath(); x.fill();
        }
        x.restore();
      } };
    },
    spots(E) {
      const S = Array.from({ length: 46 }, (_, i) => ({ d: R(0.15, 1), a0: R(0, 6.3), s: R(3, 8), h: (i * 47) % 360 }));
      return { back(x, t) {
        const b = E.ballPos ? E.ballPos() : { x: E.W / 2, y: 60 }, a = E.fade(t), m = Math.max(E.W, E.H) * 0.75;
        x.save(); x.globalCompositeOperation = 'lighter';
        for (const s of S) {
          const ang = s.a0 + t * 0.55, px = b.x + Math.cos(ang) * s.d * m, py = b.y + Math.abs(Math.sin(ang)) * s.d * m * 0.9 + 30;
          const g = x.createRadialGradient(px, py, 0, px, py, s.s * 3); g.addColorStop(0, `hsla(${(s.h + t * 60) % 360},100%,75%,${0.75 * a})`); g.addColorStop(1, 'hsla(0,0%,0%,0)');
          x.fillStyle = g; x.beginPath(); x.arc(px, py, s.s * 3, 0, 7); x.fill();
        }
        x.restore();
      } };
    },
    neon(E) {
      const N = []; let acc = 0;
      const hues = E.custom ? [null] : [320, 190, 55, 280, 140];
      return { front(x, t, dt) {
        if (t < E.dur - 1.2) { acc += dt * 4.2 * E.k; while (acc >= 1) { acc--; const fromLeft = Math.random() < 0.5; N.push({ x: fromLeft ? -40 : E.W + 40, y: R(E.H * 0.08, E.H * 0.92), vx: (fromLeft ? 1 : -1) * R(520, 900), vy: R(-120, 120), w: R(0, 6), f: R(2, 5), h: hues[Math.floor(Math.random() * hues.length)], tr: [] }); } }
        x.save(); x.globalCompositeOperation = 'lighter'; x.lineCap = 'round'; x.lineJoin = 'round';
        for (let i = N.length - 1; i >= 0; i--) {
          const n = N[i]; n.w += dt * n.f; n.x += n.vx * dt; n.y += (n.vy + Math.sin(n.w * 3) * 160) * dt;
          n.tr.push([n.x, n.y]); if (n.tr.length > 16) n.tr.shift();
          if (n.x < -300 || n.x > E.W + 300) { N.splice(i, 1); continue; }
          const col = n.h === null ? E.col : `hsl(${n.h},100%,62%)`;
          x.beginPath(); x.moveTo(n.tr[0][0], n.tr[0][1]); for (const p of n.tr) x.lineTo(p[0], p[1]);
          x.shadowColor = col; x.shadowBlur = 16; x.strokeStyle = col; x.globalAlpha = 0.85 * E.fade(t); x.lineWidth = 4; x.stroke();
          x.shadowBlur = 0; x.strokeStyle = '#fff'; x.lineWidth = 1.4; x.stroke();
        }
        x.restore();
      } };
    },
    pulse(E) {
      const { r } = E;
      return { front(x, t) {
        const beat = 0.5, k = (t % beat) / beat, hue = (Math.floor(t / beat) * 67) % 360, a = (1 - k) * E.fade(t) * 0.9, g = k * 26;
        x.save(); x.strokeStyle = `hsl(${hue},100%,62%)`; x.shadowColor = x.strokeStyle; x.shadowBlur = 18; x.globalAlpha = a; x.lineWidth = 3;
        const rr = (xx, yy, w, h, rad) => { x.beginPath(); x.moveTo(xx + rad, yy); x.arcTo(xx + w, yy, xx + w, yy + h, rad); x.arcTo(xx + w, yy + h, xx, yy + h, rad); x.arcTo(xx, yy + h, xx, yy, rad); x.arcTo(xx, yy, xx + w, yy, rad); x.closePath(); };
        rr(r.left - 6 - g, r.top - 6 - g, r.width + 12 + g * 2, r.height + 12 + g * 2, 10 + g / 2); x.stroke();
        x.restore();
      } };
    },
    /** Napis „LEGENDA!" + nazwa przedmiotu, w stylu efektu. */
    banner(E) {
      const { r } = E, cx = r.left + r.width / 2;
      const top = E.layers.includes('ball') ? Math.max(36, r.top - 200) : Math.max(46, r.top - 58);
      const st = E.style;
      return { front(x, t) {
        const p = Math.min(1, Math.max(0, (t - 0.25) / 0.55)); if (p <= 0) return;
        const a = E.fade(t) * Math.min(1, p * 1.6), sc = 0.6 + 0.4 * ease.back(p);
        const big = st === 'kasyno' ? 'JACKPOT!' : st === 'wlasny' ? (String((cfg.custom && cfg.custom.text) || 'LEGENDA!').slice(0, 24)) : 'LEGENDA!';
        x.save(); x.translate(cx, top); x.scale(sc, sc); x.globalAlpha = a; x.textAlign = 'center'; x.textBaseline = 'middle';
        if (st === 'thor') {
          x.font = '900 46px Cinzel, Georgia, serif';
          const fl = 0.75 + 0.25 * Math.abs(Math.sin(t * 23));
          x.shadowColor = '#6fb2ff'; x.shadowBlur = 26 * fl; x.fillStyle = '#e8f4ff'; x.fillText(big, 0, 0);
          x.shadowBlur = 0; x.lineWidth = 1.2; x.strokeStyle = '#7fb8ff'; x.strokeText(big, 0, 0);
        } else if (st === 'smoke') {
          x.font = '900 46px Cinzel, Georgia, serif';
          x.filter = `blur(${Math.max(0, (1 - p) * 8)}px)`;
          x.shadowColor = 'rgba(0,0,0,.9)'; x.shadowBlur = 18; x.fillStyle = '#e9ecef'; x.fillText(big, 0, 0);
          x.filter = 'none';
        } else if (st === 'kasyno') {
          x.font = '46px Bungee, Impact, sans-serif';
          const g = x.createLinearGradient(0, -24, 0, 24); g.addColorStop(0, '#fff6c4'); g.addColorStop(0.45, '#ffd34d'); g.addColorStop(0.55, '#e0a10e'); g.addColorStop(1, '#8a5a05');
          x.lineWidth = 7; x.strokeStyle = '#3b2400'; x.strokeText(big, 0, 0);
          x.shadowColor = 'rgba(255,200,60,.8)'; x.shadowBlur = 22; x.fillStyle = g; x.fillText(big, 0, 0); x.shadowBlur = 0;
          const sw = ((t * 0.9) % 1.4) * 520 - 260;
          x.globalCompositeOperation = 'source-atop'; const sg = x.createLinearGradient(sw - 40, 0, sw + 40, 0); sg.addColorStop(0, 'rgba(255,255,255,0)'); sg.addColorStop(0.5, 'rgba(255,255,255,.75)'); sg.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = sg; x.fillText(big, 0, 0); x.globalCompositeOperation = 'source-over';
        } else if (st === 'disco') {
          x.font = '44px Monoton, Impact, sans-serif';
          const on = Math.sin(t * 31) > -0.85 || t > 1.4;
          const hue = (300 + Math.sin(t * 2) * 40) % 360;
          x.shadowColor = `hsl(${hue},100%,60%)`; x.shadowBlur = on ? 28 : 4; x.fillStyle = on ? `hsl(${hue},100%,78%)` : `hsl(${hue},40%,30%)`; x.fillText(big, 0, 0);
          x.shadowBlur = 0; x.lineWidth = 1; x.strokeStyle = 'rgba(0,229,255,.8)'; x.strokeText(big, 0, 0);
        } else {
          const fnt = (cfg.custom && cfg.custom.font) || 'Cinzel';
          x.font = fnt === 'Bungee' ? '44px Bungee, Impact, sans-serif' : fnt === 'Monoton' ? '42px Monoton, Impact, sans-serif' : '900 44px Cinzel, Georgia, serif';
          x.shadowColor = E.col; x.shadowBlur = 24; x.fillStyle = '#fff'; x.fillText(big, 0, 0); x.shadowBlur = 0; x.lineWidth = 1.4; x.strokeStyle = E.col; x.strokeText(big, 0, 0);
        }
        if (E.name) {
          x.font = '700 15px Cinzel, Georgia, serif'; x.shadowColor = 'rgba(0,0,0,.95)'; x.shadowBlur = 6;
          x.fillStyle = st === 'kasyno' ? '#ffe9a6' : st === 'disco' ? '#bff8ff' : st === 'thor' ? '#cfe6ff' : '#ffb35c';
          x.fillText(E.name, 0, 36);
        }
        x.restore();
      } };
    },
  };

  /* ── własna grafika / animacja (GIF, PNG, WebP, MP4, WebM) — warstwa „Moja animacja" ── */
  let mediaUrl = null, mediaType = '';
  async function loadMedia() {
    if (mediaUrl) return mediaUrl;
    const rec = await idb.get('media:wlasny').catch(() => null);
    if (!rec || !rec.data) return null;
    mediaType = rec.type || '';
    mediaUrl = URL.createObjectURL(new Blob([rec.data], { type: rec.type }));
    return mediaUrl;
  }
  async function showMedia(E) {
    if (!(E.custom && E.layers.includes('media'))) return;
    const url = await loadMedia(); if (!url || !run) return;
    const cc = cfg.custom || {}, size = Math.max(10, Math.min(100, Number(cc.mediaSize) || 45)) / 100, pos = cc.mediaPos || 'above';
    const vid = /^video\//.test(mediaType);
    const m = el(vid ? 'video' : 'img', { class: 'mp-lg-media', src: url });
    if (vid) { m.muted = true; m.loop = true; m.playsInline = true; m.autoplay = true; }
    const r = E.r, w = pos === 'full' ? E.W : Math.round(E.W * size);
    Object.assign(m.style, { position: 'fixed', zIndex: '2147483001', pointerEvents: 'none', width: w + 'px', height: pos === 'full' ? '100vh' : 'auto', objectFit: pos === 'full' ? 'cover' : 'contain', opacity: '0', transition: 'opacity .5s, transform .6s cubic-bezier(.2,1.4,.4,1)', transform: 'scale(.7)' });
    if (pos === 'full') Object.assign(m.style, { left: '0', top: '0', mixBlendMode: cc.mediaBlend ? 'screen' : 'normal' });
    else if (pos === 'center') Object.assign(m.style, { left: (E.W - w) / 2 + 'px', top: '50%', translate: '0 -50%' });
    else Object.assign(m.style, { left: Math.max(0, Math.min(E.W - w, r.left + r.width / 2 - w / 2)) + 'px', bottom: (E.H - r.top + 8) + 'px' });
    document.body.appendChild(m);
    run.media = m;
    requestAnimationFrame(() => { m.style.opacity = '1'; m.style.transform = 'scale(1)'; });
    if (vid) m.play().catch(() => {});
    setTimeout(() => { if (m.isConnected) m.style.opacity = '0'; }, Math.max(500, E.dur * 1000 - 700));
  }

  /* ═════════════════ odtwarzanie ═════════════════ */
  let run = null;
  /** Okna łupu gry: po klasie albo po nagłówku „Łup…" (okno gry .c-window). */
  function lootWindows() {
    const set = new Set($$(LOOT_SEL));
    for (const w of $$('.c-window')) { const h = w.querySelector('.header-label .text, .header-label'); if (h && /^\s*łup/i.test(h.textContent || '')) set.add(w); }
    return [...set].filter((w) => isVisible(w) && !w.closest('#mp-panel, .mp-glass, .mp-lg-fake'));
  }
  function lootWindow() { const ws = lootWindows(); return ws[ws.length - 1] || null; }

  /* ── podświetlenie legendarnych przedmiotów w oknie łupu (zostaje, dopóki okno jest otwarte) ── */
  /*
   * Wygląd pola z legendą w oknie łupów (zostaje, dopóki okno jest otwarte; nic nie blokuje najechania na przedmiot):
   *   Thor   — obwódka-błyskawica + pioruny uderzające w legendę
   *   Smoke  — czarno-czerwona obwódka + legenda pojawia się i znika jak w dymie
   *   Kasyno — złota obwódka + (w trakcie efektu) legenda wyskakuje z pola i kręci się jak moneta
   *   Disco  — neonowa obwódka + legenda świeci zmieniającym się kolorem
   *   Własny — obwódka i efekt przedmiotu do wyboru
   */
  const FIELD = {
    thor: { ring: 'thor', item: 'bolts', glow: '#7fc0ff' },
    smoke: { ring: 'smoke', item: 'fade', glow: '#ff2a1a' },
    kasyno: { ring: 'kasyno', item: 'pop', glow: '#ffc83a' },
    disco: { ring: 'disco', item: 'hue', glow: '#ff4fd8' },
  };
  function fieldSpec() {
    if (cfg.style !== 'wlasny') return FIELD[cfg.style] || FIELD.thor;
    const cc = cfg.custom || {};
    return { ring: cc.ring || 'wlasny', item: cc.itemFx || 'glow', glow: cc.color || '#ff9a1f' };
  }
  function hlClass(spec) { return 'mp-lg-hl ' + spec.ring + ' m-' + (cfg.hlMode || 'ring'); }
  /** „Okienko" przedmiotu w oknie łupu: największy przodek kafelka, który zawiera tylko ten jeden przedmiot. */
  function cardOf(it) {
    let n = it;
    const iw = it.getBoundingClientRect().width || 32;
    while (n.parentElement) {
      const p = n.parentElement;
      if (p.matches('.c-window, .content, .inner-content, .mp-lg-fake, .mp-lg-fake-b, [class*="scroll"], body') || $$('.item', p).length > 1) break;
      if (p.getBoundingClientRect().width > iw * 4.5) break;
      n = p;
    }
    return n;
  }
  const FX_CLASSES = ['mp-lg-fx-fade', 'mp-lg-fx-hue', 'mp-lg-fx-glow', 'mp-lg-fx-pop', 'mp-lg-fx-bolts'];
  function markItem(it) {
    if (!it) return;
    const spec = fieldSpec();
    const card = cardOf(it);
    const slot = it.parentElement && it.parentElement !== card ? it.parentElement : it;
    // blask pola w kolorze stylu
    slot.classList.add('mp-lg-glow'); slot.style.setProperty('--lgg', spec.glow);
    // efekt na samym przedmiocie
    FX_CLASSES.forEach((c) => it.classList.remove(c));
    it.classList.add('mp-lg-fx-' + spec.item); it.style.setProperty('--lgg', spec.glow);
    if ((cfg.hlMode || 'ring') === 'none') return;
    let h = card.querySelector(':scope > .mp-lg-hl');
    if (!h) {
      if (getComputedStyle(card).position === 'static') card.style.position = 'relative';
      h = el('div'); card.appendChild(h);
    }
    const was = h.className;
    h.className = hlClass(spec);
    h.style.setProperty('--lgc', spec.glow);
    if (spec.ring === 'smoke' && !/\bsmoke\b/.test(was)) try { h.animate([{ opacity: 0, filter: 'blur(8px)' }, { opacity: 1, filter: 'blur(0px)' }], { duration: 3500, easing: 'ease-out' }); } catch {}
    if (spec.item === 'bolts') fieldBolts(h, slot); else { const c = h.querySelector('canvas'); if (c) c.remove(); }
  }
  /** Małe pioruny bijące w legendę — płótno wewnątrz pola, działa, dopóki pole istnieje. */
  function fieldBolts(h, slot) {
    if (h.querySelector('canvas')) return;
    const cv = el('canvas', { class: 'mp-lg-fbolt' }); h.appendChild(cv);
    const x = cv.getContext('2d');
    let next = 0, cur = null, t0 = performance.now();
    const loop = (n) => {
      if (!cv.isConnected) return;
      const W = (cv.width = h.clientWidth || 60), H = (cv.height = h.clientHeight || 100);
      const hr = h.getBoundingClientRect(), sr = slot.getBoundingClientRect();
      const tx = sr.left - hr.left + sr.width / 2, ty = sr.top - hr.top + sr.height / 2;
      const t = (n - t0) / 1000;
      if (t > next) { cur = { at: t, b: bolt(R(0, W), -4, tx + R(-6, 6), ty + R(-6, 6), Math.max(10, H * 0.12), false), b2: Math.random() < 0.5 ? bolt(R(0, W), -4, tx, ty, H * 0.1, false) : null }; next = t + R(0.45, 1.3); }
      x.clearRect(0, 0, W, H);
      if (cur) {
        const p = (t - cur.at) / 0.32;
        if (p <= 1) {
          const a = Math.pow(1 - p, 1.2) * (0.6 + 0.4 * Math.abs(Math.sin(p * 30)));
          x.save(); x.globalCompositeOperation = 'lighter';
          for (const b of [cur.b, cur.b2].filter(Boolean)) for (const { pts } of b) {
            x.beginPath(); x.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) x.lineTo(pts[i][0], pts[i][1]);
            x.shadowColor = '#6fb2ff'; x.shadowBlur = 10; x.strokeStyle = `rgba(150,200,255,${0.8 * a})`; x.lineWidth = 2.4; x.stroke();
            x.shadowBlur = 0; x.strokeStyle = `rgba(255,255,255,${a})`; x.lineWidth = 0.9; x.stroke();
          }
          const g = x.createRadialGradient(tx, ty, 0, tx, ty, 26); g.addColorStop(0, `rgba(200,230,255,${0.7 * a})`); g.addColorStop(1, 'rgba(200,230,255,0)');
          x.fillStyle = g; x.fillRect(0, 0, W, H); x.restore();
        }
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
  function markWindow(win) {
    if (!win) return;
    for (const it of $$('.item', win)) if (it.dataset.mpLg) markItem(it);
  }
  function canvas(z, before) {
    const c = el('canvas', { class: 'mp-lg-cv', style: { position: 'fixed', left: '0', top: '0', width: '100vw', height: '100vh', pointerEvents: 'none', zIndex: String(z) } });
    c.width = innerWidth; c.height = innerHeight;
    if (before && before.parentElement) before.parentElement.insertBefore(c, before); else document.body.appendChild(c);
    return c;
  }
  function stopFx() {
    if (!run) return;
    cancelAnimationFrame(run.raf); run.cvs.forEach((c) => c.remove()); if (run.fake) run.fake.remove();
    if (run.media) run.media.remove();
    (run.pops || []).forEach((b) => b.remove());
    $$('.item[data-mp-lg]').forEach((x) => { if (x.style.opacity === '0') x.style.opacity = ''; });
    if (run.win) run.win.classList.remove('mp-lg-win', 'thor', 'smoke', 'kasyno', 'disco', 'wlasny');
    if (run.test) $$('.mp-lg-hl.test').forEach((h) => h.remove());
    if (run.dim) $$('.mp-glass').forEach((g) => { g.style.transition = 'opacity .4s'; g.style.opacity = ''; });
    try { run.stopSnd && run.stopSnd(); } catch {}
    run = null;
  }
  /** Okno łupu „na niby" do testu: kilka losowych przedmiotów (zwykłe, unikaty, heroiki, legendy), jak w grze. */
  const RAR = { common: ['Zwykły', '#9a9a9a'], unique: ['Unikatowy', '#e6c13b'], heroic: ['Heroiczny', '#3fa2ff'], legendary: ['Legendarny', '#ff8a1f'] };
  /** Kopia kafelka przedmiotu z gry (razem z obrazkiem z płótna). */
  function cloneItem(src) {
    const c = src.cloneNode(true);
    const a = src.querySelectorAll('canvas'), b = c.querySelectorAll('canvas');
    a.forEach((cv, i) => { try { b[i].width = cv.width; b[i].height = cv.height; b[i].getContext('2d').drawImage(cv, 0, 0); } catch {} });
    c.removeAttribute('id'); c.querySelectorAll('.mp-ibadge, .mp-lg-hl').forEach((x) => x.remove());
    return c;
  }
  /** Przedmioty z Twojej torby/ekwipunku do testu, pogrupowane po rzadkości. */
  function bagByRarity() {
    const out = { common: [], unique: [], heroic: [], legendary: [] };
    for (const n of $$('.item[class*="item-id-"]')) {
      if (n.closest(LOOT_SEL + ', .mp-lg-fake, #mp-panel, .mp-glass') || !isVisible(n)) continue;
      const it = game.itemById(game.itemIdFromEl(n)); if (!it) continue;
      const r = it.rarity === 'upgraded' ? 'unique' : it.rarity;
      if (out[r] && out[r].length < 6) out[r].push(n);
    }
    return out;
  }
  /** Okno łupów do testu — zbudowane z tych samych elementów co okno gry, więc wygląda jak ono (także w Motywniku). */
  function fakeLoot() {
    const tpl = store.get('legenda:lootTpl', null);
    if (tpl && tpl.html) try { const f = fakeFromTpl(tpl); if (f) return f; } catch (e) { console.warn('[L4Tools] wzór okna łupów', e); }
    return fakeBuilt();
  }
  function randomRars() {
    const n = 2 + Math.floor(Math.random() * 3);
    const rars = Array.from({ length: n }, () => ['common', 'common', 'unique', 'heroic', 'legendary'][Math.floor(Math.random() * 5)]);
    if (!rars.includes('legendary')) rars[Math.floor(Math.random() * n)] = 'legendary';
    return rars;
  }
  function testItem(r, bag) {
    let pool = bag[r];
    if (!pool || !pool.length) pool = [].concat(bag.legendary, bag.heroic, bag.unique, bag.common);   // brak takiej rzadkości w torbie — dowolny przedmiot
    let it;
    if (pool && pool.length) { it = cloneItem(pool[Math.floor(Math.random() * pool.length)]); it.style.position = it.style.left = it.style.top = it.style.transform = ''; it.querySelectorAll('.amount, small, .cl-icon').forEach((n) => n.remove()); }
    else it = el('div', { class: 'item mp-lg-fake-item', style: { '--rc': RAR[r][1], width: '32px', height: '32px' } });
    it.title = RAR[r][0];
    if (r === 'legendary') it.dataset.mpLg = '1'; else delete it.dataset.mpLg;
    return it;
  }
  /** Okno łupów z zapamiętanego wzoru gry: te same elementy i klasy, tylko inne przedmioty. */
  function fakeFromTpl(tpl) {
    const box = document.createElement('div'); box.innerHTML = tpl.html;
    const f = box.firstElementChild; if (!f) return null;
    const proto = f.querySelector('[data-mp-card]'); if (!proto) return null;
    const holder = proto.parentElement;
    $$('[data-mp-card]', f).forEach((c) => c.remove());
    // inne okienka przedmiotów z wzoru (gdy było ich kilka) też wylatują
    $$('.item', holder).forEach((x) => { let n = x; while (n.parentElement && n.parentElement !== holder) n = n.parentElement; n.remove(); });
    const bag = bagByRarity();
    for (const r of randomRars()) {
      const card = proto.cloneNode(true); card.removeAttribute('data-mp-card');
      card.querySelectorAll('.mp-lg-hl, .mp-lg-pop').forEach((x) => x.remove());
      card.classList.remove('mt-lcard');
      const old = card.querySelector('.item');
      const it = testItem(r, bag);
      if (old) { const sz = it.classList.contains('mp-lg-fake-item') ? ';width:32px;height:32px' : ''; it.style.cssText = old.style.cssText + sz; old.replaceWith(it); }
      holder.appendChild(card);
    }
    f.querySelectorAll('.mp-lg-hl').forEach((x) => x.remove());
    [f, ...f.querySelectorAll('[class*="mt-"]')].forEach((n) => [...n.classList].forEach((c) => { if (/^mt-/.test(c)) n.classList.remove(c); }));
    f.classList.add('mp-lg-fake', 'mp-lg-fake-tpl');
    f.style.left = f.style.top = ''; f.style.transform = '';
    const par = tpl.parent && document.querySelector('.' + tpl.parent.trim().split(/\s+/).join('.'));
    (par || document.querySelector('.alerts-layer') || document.body).appendChild(f);
    return f;
  }
  function fakeBuilt() {
    const n = 3 + Math.floor(Math.random() * 3);
    const rars = Array.from({ length: n }, () => ['common', 'common', 'unique', 'heroic', 'legendary'][Math.floor(Math.random() * 5)]);
    if (!rars.includes('legendary')) rars[Math.floor(Math.random() * n)] = 'legendary';
    const bag = bagByRarity();
    const cards = rars.map((r) => {
      const pool = bag[r];
      let it;
      if (pool && pool.length) { it = cloneItem(pool[Math.floor(Math.random() * pool.length)]); it.style.position = 'relative'; it.style.left = it.style.top = '0'; }
      else it = el('div', { class: 'item mp-lg-fake-item', style: { '--rc': RAR[r][1] } });
      it.classList.add('mp-lg-fake-item-real'); it.title = RAR[r][0];
      if (r === 'legendary') it.dataset.mpLg = '1';
      return el('div', { class: 'mp-lg-fake-card' },
        el('div', { class: 'mp-lg-fake-slot interface-element-one-item-slot-background-to-repeat' }, it),
        el('div', { class: 'mp-lg-fake-want' }, 'Chcę'),
        el('div', { class: 'mp-lg-fake-btns' }, el('div', { class: 'button small green' }, el('div', { class: 'label' }, '✓')), el('div', { class: 'button small red' }, el('div', { class: 'label' }, '✕'))));
    });
    const f = el('div', { class: 'c-window border-window mp-lg-fake' },
      el('div', { class: 'header-label-positioner' }, el('div', { class: 'header-label' }, el('div', { class: 'left-decor' }), el('div', { class: 'right-decor' }), el('div', { class: 'text' }, 'Łupy'))),
      el('div', { class: 'content' }, el('div', { class: 'inner-content' }, el('div', { class: 'mp-lg-fake-b' }, cards))),
      el('div', { class: 'c-window__bottom-bar mp-lg-fake-f' }, el('div', { class: 'interface-element-bottom-bar-background-stretch' }), el('span', null, '10 s'), el('div', { class: 'button small green' }, el('div', { class: 'label' }, 'Potwierdź')), el('span', null, '10 m')),
      el('div', { class: 'close-button-corner-decor' }, el('button', { class: 'close-button' })));
    (document.querySelector('.alerts-layer') || document.body).appendChild(f);
    return f;
  }

  /* ── Kasyno: legenda wyskakuje z okienka i kręci się jak moneta ── */
  function popItems(win, me) {
    for (const it of $$('.item', win).filter((x) => x.dataset.mpLg)) {
      let r = it.getBoundingClientRect(); if (!r.width && it.parentElement) r = it.parentElement.getBoundingClientRect(); if (!r.width) continue;
      const c = cloneItem(it);
      const box = el('div', { class: 'mp-lg-pop', style: { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' } }, c);
      Object.assign(c.style, { position: 'absolute', left: '0', top: '0', margin: '0' });
      document.body.appendChild(box);
      (me.pops = me.pops || []).push(box);
      it.style.opacity = '0';   // oryginał „wyskakuje" — na czas animacji niewidoczny (ale dalej można na niego najechać)
      const an = box.animate([
        { transform: 'translateY(0) scale(1) rotateY(0deg)', filter: 'drop-shadow(0 0 0 #ffd34d)' },
        { transform: 'translateY(-78px) scale(2) rotateY(540deg)', filter: 'drop-shadow(0 0 14px #ffd34d)', offset: 0.3 },
        { transform: 'translateY(-84px) scale(2) rotateY(1260deg)', filter: 'drop-shadow(0 0 20px #fff2a8)', offset: 0.72 },
        { transform: 'translateY(0) scale(1) rotateY(1800deg)', filter: 'drop-shadow(0 0 0 #ffd34d)' },
      ], { duration: 3400, easing: 'cubic-bezier(.3,.7,.4,1)' });
      an.onfinish = () => { box.remove(); it.style.opacity = ''; };
    }
  }

  async function play(styleKey, opts = {}) {
    stopFx();
    const st = STYLES[styleKey] ? styleKey : 'thor';
    const custom = st === 'wlasny';
    const cc = cfg.custom || {};
    const layers = custom ? ['shade'].concat((cc.layers || []).filter((l) => l !== 'flash' && l !== 'banner'), (cc.layers || []).includes('flash') ? ['flash'] : [], (cc.layers || []).includes('banner') ? ['banner'] : []) : PRESET_LAYERS[st];
    if (custom && (cc.layers || []).includes('ball') && !layers.includes('spots')) layers.splice(layers.indexOf('ball'), 0, 'spots');
    const dur = durOf();
    STRIKES = strikesFor(dur);
    let win = lootWindow(), fake = null;
    if (!win && opts.test) { fake = fakeLoot(); win = fake; }
    const rect = win ? win.getBoundingClientRect() : { left: innerWidth / 2 - 130, top: innerHeight / 2 - 80, width: 260, height: 160, right: innerWidth / 2 + 130, bottom: innerHeight / 2 + 80 };
    // tylna warstwa tuż pod oknem łupu (w tym samym kontekście warstw), żeby dym i światła były ZA oknem
    let zb = 2147480000;
    if (win) { zb = 0; try { const zz = parseInt(getComputedStyle(win).zIndex, 10); if (zz > 0) zb = zz - 1; } catch {} }
    const back = canvas(zb, win || null);
    const front = canvas(2147483000);
    const E = {
      W: innerWidth, H: innerHeight, r: { left: rect.left, top: rect.top, width: rect.width, height: rect.height, right: rect.left + rect.width, bottom: rect.top + rect.height },
      dur, col: custom ? (cc.color || '#7c5cff') : STYLES[st].col, name: '', layers, style: custom ? 'wlasny' : st, custom,
      fade: (t) => Math.min(1, t / 0.3) * Math.min(1, Math.max(0, (dur - t) / 0.9)),
      k: custom ? Math.max(0.3, Math.min(2.5, (Number(cc.intensity) || 100) / 100)) : 1,
      dim: custom ? Math.max(0, Math.min(0.85, (cc.dim ?? 35) / 100)) : 0.35,
    };
    const parts = layers.map((k) => L[k] && L[k](E)).filter(Boolean);   // „media" to element strony, nie warstwa płótna
    const bx = back.getContext('2d'), fx = front.getContext('2d');
    const me = { cvs: [back, front], fake, raf: 0, stopSnd: null, dim: !!opts.test, test: !!opts.test, win: win && !fake ? win : null };
    // okno łupu zostaje jak w grze — wyróżniamy tylko okienka z legendami (zostają do zamknięcia okna)
    if (win) {
      win.style.setProperty('--lgc', E.col);
      const before = new Set($$('.mp-lg-hl', win));
      markWindow(win);
      if (opts.test && !fake) $$('.mp-lg-hl', win).forEach((h) => { if (!before.has(h)) h.classList.add('test'); });
    }
    showMedia(E);
    if (win && fieldSpec().item === 'pop') FOUNTAINS(dur).forEach((ft) => setTimeout(() => { if (run === me) popItems(win, me); }, ft * 1000 + 250));
    // przy teście panel przygasa, żeby było widać cały efekt
    if (me.dim) $$('.mp-glass').forEach((g) => { g.style.transition = 'opacity .3s'; g.style.opacity = '0.12'; });
    run = me;
    try { await document.fonts.load('900 40px Cinzel'); await Promise.all(['40px Bungee', '40px Monoton'].map((f) => document.fonts.load(f))); } catch {}
    if (run !== me) return;
    playSound(st, dur * 1000).then((s) => { if (run === me) me.stopSnd = s; else s(); }).catch(() => {});
    const t0 = performance.now(); let last = t0;
    const frame = (n) => {
      if (run !== me) return;
      const t = (n - t0) / 1000, dt = Math.min(0.05, (n - last) / 1000); last = n;
      if (t > dur) { stopFx(); return; }
      bx.clearRect(0, 0, E.W, E.H); fx.clearRect(0, 0, E.W, E.H);
      for (const p of parts) { try { if (p.back) p.back(bx, t, dt); } catch (e) { console.warn('[L4Tools] legenda', e); } }
      for (const p of parts) { try { if (p.front) p.front(fx, t, dt); } catch (e) { console.warn('[L4Tools] legenda', e); } }
      me.raf = requestAnimationFrame(frame);
    };
    me.raf = requestAnimationFrame(frame);
  }

  /* ═════════════════ wykrywanie legendy w łupie ═════════════════ */
  const seen = new Map();
  function fresh(id) {
    const n = now();
    for (const [k, t] of seen) if (n - t > 15 * 60000) seen.delete(k);
    if (seen.has(id)) return false;
    seen.set(id, n); return true;
  }
  let pending = null;
  const legendIds = new Set();      // legendy znane z danych serwera — podświetlimy je, gdy okno łupu się pojawi
  function trigger(id, name, win) {
    if (!cfg.enabled || !fresh(String(id))) return;
    // kolejna legenda w tym samym oknie łupu, gdy efekt już trwa — tylko podświetlenie, bez restartu efektu
    if (run && run.win && win && run.win === win) return;
    if (pending) { pending.names.push(name); return; }
    pending = { names: [name] };
    // chwila na otwarcie okna łupu, żeby efekt wiedział, gdzie ono jest
    let tries = 0;
    const go = () => {
      if (!lootWindow() && tries++ < 8) { setTimeout(go, 120); return; }
      pending = null;
      play(cfg.style, {});
    };
    setTimeout(go, 60);
  }
  function isLegendNode(n) {
    const c = String(n.className || '');
    if (/\bt-leg\b|legendary|\blegend\b/i.test(c)) return true;
    const id = game.itemIdFromEl(n);
    const it = id ? game.itemById(id) : null;
    if (it && it.rarity === 'legendary') return true;
    try { const raw = id && E() && E().items && E().items.getItemById && E().items.getItemById(id); if (raw && /rarity=legendary/.test(String(raw.stat || ''))) return true; } catch {}
    return false;
  }
  /*
   * Wzór okna łupów: gdy w grze pojawi się prawdziwe okno łupów, zapamiętujemy jego budowę (bez przedmiotów).
   * Test buduje okno z tego wzoru — wygląda wtedy dokładnie jak okno gry (w każdym motywie i wymiarach).
   */
  let tplAt = 0;
  function captureTpl(w) {
    if (now() - tplAt < 60000 || w.closest('.mp-lg-fake')) return;
    const items = $$('.item', w); if (!items.length) return;
    tplAt = now();
    try {
      const card = cardOf(items[0]);
      card.setAttribute('data-mp-card', '1');
      const html = w.outerHTML;
      card.removeAttribute('data-mp-card');
      const r = w.getBoundingClientRect(), cr = card.getBoundingClientRect();
      const mt = MP.motywnik && MP.motywnik.current && MP.motywnik.current();
      const motyw = mt ? mt.name : 'Domyślny';
      const sizes = Object.assign({}, store.get('legenda:lootSizes', {}), { [motyw]: { okno: [Math.round(r.width), Math.round(r.height)], okienko: [Math.round(cr.width), Math.round(cr.height)], n: items.length } });
      store.set('legenda:lootSizes', sizes);
      if (html.length < 120000) store.set('legenda:lootTpl', { html, parent: String((w.parentElement && w.parentElement.className) || ''), t: now() });
    } catch {}
  }
  function scanDom() {
    for (const w of lootWindows()) captureTpl(w);
    if (!cfg.enabled) return;
    for (const w of lootWindows()) for (const it of $$('.item', w)) {
      if (it.dataset.mpLg) { if (!it.querySelector(':scope > .mp-lg-hl')) markItem(it); continue; }
      const id = game.itemIdFromEl(it);
      if (!id) continue;
      if (isLegendNode(it) || legendIds.has(String(id))) { it.dataset.mpLg = '1'; markItem(it); trigger(id, '', w); }
    }
  }
  function onData(d) {
    if (!cfg.enabled || !d || !d.item || typeof d.item !== 'object') return;
    const lootish = !!(d.loot || d.loots);
    for (const [id, it] of Object.entries(d.item)) {
      if (!it || typeof it !== 'object') continue;
      if (!(lootish || it.loc === 'l')) continue;
      if (!(/rarity=legendary/.test(String(it.stat || '')) || (it.stat && it.stat.rarity === 'legendary'))) continue;
      const lid = String(it.id || id);
      legendIds.add(lid);
      // efekt odpala się dopiero, gdy przedmiot pojawi się w oknie łupu (scanDom). Zapas: dane wprost mówią, że to łup
      // (loc „l"), a okna łupu nie widać — wtedy efekt i tak startuje.
      if (it.loc === 'l') setTimeout(() => { if (!seen.has(lid) && !lootWindow()) trigger(lid, ''); }, 1500);
    }
  }

  /* ═════════════════ panel ═════════════════ */
  const ICON = {
    thor: '<path d="M13 2 5 13h6l-1 9 8-12h-6l1-8z"/>',
    smoke: '<path d="M6 17a4 4 0 0 1 .5-8 5 5 0 0 1 9.6-1.4A4 4 0 1 1 18 17H6z"/><path d="M8 21h8" />',
    kasyno: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="5"/><path d="M12 9v6"/>',
    disco: '<path d="M12 1v4"/><circle cx="12" cy="13" r="7"/><path d="M5 13h14M12 6c2 2 2 12 0 14M12 6c-2 2-2 12 0 14"/>',
    wlasny: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
  };
  const svgI = (k) => el('span', { class: 'mp-lg-ico', html: `<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${ICON[k]}</svg>` });

  let lastSnd = null;
  const b64 = (buf) => { let s = ''; const u = new Uint8Array(buf); for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
  const unb64 = (str) => { const s = atob(str); const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u.buffer; };
  /** Eksport własnego efektu do pliku .json (ustawienia + Twoja animacja i dźwięk, jeśli są). */
  async function exportOwn() {
    const out = { l4tools: 'legenda', v: 1, custom: cfg.custom, dur: cfg.dur, volume: cfg.volume };
    const m = await idb.get('media:wlasny').catch(() => null); if (m && m.data) out.media = { name: m.name, type: m.type, data: b64(m.data) };
    const a = await idb.get('snd:wlasny').catch(() => null); if (a && a.data) out.sound = { name: a.name, size: a.size, data: b64(a.data) };
    const link = el('a', { href: URL.createObjectURL(new Blob([JSON.stringify(out)], { type: 'application/json' })), download: 'legendarny-lup-efekt.json' });
    document.body.appendChild(link); link.click(); link.remove();
  }
  function importOwn(done) {
    const inp = el('input', { type: 'file', accept: '.json,application/json', style: { display: 'none' } });
    inp.addEventListener('change', async () => {
      const f = inp.files && inp.files[0]; inp.remove(); if (!f) return;
      try {
        const o = JSON.parse(await f.text());
        if (!o || o.l4tools !== 'legenda' || !o.custom) throw new Error('to nie jest plik efektu Legendarnego Łupu');
        cfg.custom = Object.assign({}, cfg.custom, o.custom); if (o.dur) cfg.dur = o.dur;
        if (o.media) { await idb.put('media:wlasny', { name: o.media.name, type: o.media.type, data: unb64(o.media.data) }); if (mediaUrl) URL.revokeObjectURL(mediaUrl); mediaUrl = null; }
        if (o.sound) { await idb.put('snd:wlasny', { name: o.sound.name, size: o.sound.size, data: unb64(o.sound.data) }); delete bufCache.wlasny; }
        cfg.style = 'wlasny'; config.save(); toast('Legendarny Łup: zaimportowano efekt'); done();
      } catch (e) { toast('Legendarny Łup: nie udało się wczytać pliku — ' + e.message, 'warn'); }
    });
    document.body.appendChild(inp); inp.click();
  }
  function pickMedia(done) {
    const inp = el('input', { type: 'file', accept: 'image/*,video/mp4,video/webm,.gif,.png,.webp,.apng,.mp4,.webm', style: { display: 'none' } });
    inp.addEventListener('change', async () => {
      const f = inp.files && inp.files[0]; inp.remove(); if (!f) return;
      if (f.size > 25 * 1024 * 1024) { toast('Legendarny Łup: plik jest za duży (max 25 MB)', 'warn'); return; }
      await idb.put('media:wlasny', { name: f.name, type: f.type || (/\.(mp4)$/i.test(f.name) ? 'video/mp4' : /\.webm$/i.test(f.name) ? 'video/webm' : 'image/gif'), data: await f.arrayBuffer() });
      if (mediaUrl) URL.revokeObjectURL(mediaUrl); mediaUrl = null;
      const cc = cfg.custom; if (!cc.layers.includes('media')) cc.layers = cc.layers.concat('media');
      config.save(); toast(`Legendarny Łup: wgrano „${f.name}"`); done();
    });
    document.body.appendChild(inp); inp.click();
  }
  async function ownInfo(key) { try { const r = await idb.get('snd:' + key); return r ? { name: r.name, size: r.size } : null; } catch { return null; } }
  function pickFile(key, done) {
    const inp = el('input', { type: 'file', accept: 'audio/*,.mp3,.ogg,.wav,.m4a', style: { display: 'none' } });
    inp.addEventListener('change', async () => {
      const f = inp.files && inp.files[0]; inp.remove(); if (!f) return;
      if (f.size > 15 * 1024 * 1024) { toast('Legendarny Łup: plik jest za duży (max 15 MB)', 'warn'); return; }
      const data = await f.arrayBuffer();
      const a = ac(); const ok = a ? await a.decodeAudioData(data.slice(0)).then(() => true).catch(() => false) : false;
      if (!ok) { toast('Legendarny Łup: nie da się odtworzyć tego pliku — użyj mp3, ogg albo wav', 'warn'); return; }
      await idb.put('snd:' + key, { name: f.name, size: f.size, data });
      delete bufCache[key];
      cfg.sounds = cfg.sounds || {}; cfg.sounds[key] = 'own'; config.save();
      toast(`Legendarny Łup: wgrano „${f.name}"`);
      done();
    });
    document.body.appendChild(inp); inp.click();
  }

  defineAddon({
    id: 'legenda', name: 'Legendarny Łup', icon: 'legenda', color: ['#ff9a1f', '#ff3d6e'], renderFirst: true,
    desc: 'Gdy w łupie trafi się przedmiot legendarny — efekt na cały ekran z dźwiękiem: Thor, Smoke, Kasyno, Disco albo Twój własny. Każdy styl ma wbudowany dźwięk i może mieć Twój plik dźwiękowy. Przycisk „Test" pokazuje efekt od razu.',
    defaults: { enabled: false, style: 'thor', volume: 0.7, dur: 15, hlMode: 'ring', sounds: {}, custom: { layers: ['flash', 'glow', 'neon', 'banner'], color: '#ff9a1f', dur: 6.5, sound: 'kasyno' } },
    settings: [],
    notes: () => [{ type: 'info', text: 'Wymaga włączonej opcji gry <b>Podświetlenie okna łupów</b> (Konfiguracja → Ustawienia gry → Wygląd → Łupy). Efekt działa tylko dla przedmiotów <b>legendarnych</b>.' }],
    render(box, c, rerender) {
      // style
      const grid = el('div', { class: 'mp-lg-grid' });
      for (const [k, s] of Object.entries(STYLES)) {
        grid.appendChild(el('div', { class: 'mp-lg-card' + (c.style === k ? ' on' : ''), style: { '--a': s.grad[0], '--b': s.grad[1], '--c': s.col }, onclick: () => { c.style = k; config.save(); rerender(); } },
          el('div', { class: 'mp-lg-art ' + k }, svgI(k)),
          el('div', { class: 'mp-lg-name' }, s.name),
          el('div', { class: 'mp-lg-desc' }, s.desc),
          el('button', { class: 'mp-btn mp-lg-test', onclick: (e) => { e.stopPropagation(); play(k, { test: true }); } }, 'Test')));
      }
      box.appendChild(el('div', { class: 'mp-card' }, el('h3', null, 'Styl efektu'), grid));
      const HL = [['ring', 'Obwódka w okienku'], ['glow', 'Obwódka + poświata'], ['pulse', 'Pulsujące tło'], ['none', 'Bez wyróżnienia']];
      box.appendChild(el('div', { class: 'mp-card' }, el('h3', null, 'Wyróżnienie okienka z legendą'),
        el('div', { class: 'mp-dim', style: { marginBottom: '6px' } }, 'Okno łupu zostaje takie jak w grze — wyróżnione jest tylko okienko z legendą, w kolorach wybranego stylu. Wyróżnienie mieści się w okienku, więc kilka legend obok siebie nie nachodzi na siebie.'),
        el('div', { class: 'mp-btns' }, HL.map(([v, l]) => el('button', { class: 'mp-upchip' + ((c.hlMode || 'ring') === v ? ' on' : ''), onclick: () => { c.hlMode = v; config.save(); rerender(); } }, l)))));

      // dźwięk wybranego stylu
      const k = c.style, S = STYLES[k];
      const sc = el('div', { class: 'mp-card' }, el('h3', null, `Dźwięk — ${S.name}`));
      const vol = el('input', { class: 'mp-range', type: 'range', min: 0, max: 1, step: 0.05, value: c.volume ?? 0.7 });
      const paint = () => vol.style.setProperty('--p', vol.value * 100 + '%'); paint();
      vol.addEventListener('input', () => { paint(); c.volume = Number(vol.value); });
      vol.addEventListener('change', () => config.save());
      sc.appendChild(el('div', { class: 'mp-lg-row' }, el('span', { class: 'mp-dim', style: { width: '90px' } }, 'Głośność'), vol));
      const dr = el('input', { class: 'mp-range', type: 'range', min: 5, max: 20, step: 1, value: durOf() });
      const dOut = el('span', { class: 'mp-dim', style: { width: '40px', textAlign: 'right' } }, `${durOf()} s`);
      const pd = () => dr.style.setProperty('--p', ((dr.value - 5) / 15) * 100 + '%'); pd();
      dr.addEventListener('input', () => { pd(); dOut.textContent = dr.value + ' s'; c.dur = Number(dr.value); });
      dr.addEventListener('change', () => config.save());
      sc.appendChild(el('div', { class: 'mp-lg-row' }, el('span', { class: 'mp-dim', style: { width: '90px' } }, 'Czas trwania'), dr, dOut));
      if (k === 'wlasny') {
        const cc = c.custom = Object.assign({ layers: [], color: '#ff9a1f', dur: 6.5, sound: 'kasyno' }, c.custom || {});
        const sel = el('select', { class: 'mp-in' }, SOUND_KEYS.map(([v, l]) => { const o = el('option', { value: v }, l); if (cc.sound === v) o.selected = true; return o; }));
        sel.addEventListener('change', () => { cc.sound = sel.value; config.save(); rerender(); });
        sc.appendChild(el('div', { class: 'mp-lg-row' }, el('span', { class: 'mp-dim', style: { width: '90px' } }, 'Dźwięk'), sel));
      }
      const soundRow = el('div', { class: 'mp-lg-snd' });
      sc.appendChild(soundRow);
      const showOwn = k !== 'wlasny' || (c.custom && c.custom.sound === 'own');
      (async () => {
        const info = await ownInfo(k);
        const mode = (c.sounds && c.sounds[k]) || 'default';
        if (k !== 'wlasny') {
          soundRow.appendChild(el('div', { class: 'mp-btns' },
            el('button', { class: 'mp-upchip' + (mode !== 'own' || !info ? ' on' : ''), onclick: () => { c.sounds = c.sounds || {}; c.sounds[k] = 'default'; config.save(); rerender(); } }, 'Domyślny (wbudowany)'),
            info ? el('button', { class: 'mp-upchip' + (mode === 'own' ? ' on' : ''), onclick: () => { c.sounds = c.sounds || {}; c.sounds[k] = 'own'; config.save(); rerender(); } }, `Własny: ${info.name}`) : null));
        }
        if (showOwn) {
          soundRow.appendChild(el('div', { class: 'mp-btns' },
            el('button', { class: 'mp-btn', onclick: () => pickFile(k, rerender) }, info ? 'Zmień własny plik' : 'Wgraj własny plik'),
            info ? el('button', { class: 'mp-btn bad', onclick: async () => { await idb.del('snd:' + k).catch(() => {}); delete bufCache[k]; if (c.sounds) c.sounds[k] = 'default'; config.save(); toast('Legendarny Łup: usunięto własny dźwięk'); rerender(); } }, 'Usuń własny') : null));
          soundRow.appendChild(el('div', { class: 'mp-dim', style: { marginTop: '6px' } }, 'mp3, ogg lub wav (do 15 MB). Plik zostaje tylko w tej przeglądarce. Dźwięk wbudowany zostaje zawsze — możesz do niego wrócić.'));
        }
      })();
      sc.appendChild(el('div', { class: 'mp-btns' },
        el('button', { class: 'mp-btn pri', onclick: () => play(k, { test: true }) }, 'Test efektu'),
        el('button', { class: 'mp-btn', onclick: () => { stopFx(); playSound(k, durOf() * 1000).then((st) => { lastSnd = st; }); } }, 'Odsłuchaj dźwięk'),
        el('button', { class: 'mp-btn', onclick: () => { stopFx(); if (lastSnd) { lastSnd(); lastSnd = null; } } }, 'Zatrzymaj')));
      box.appendChild(sc);

      // własny styl
      if (k === 'wlasny') {
        const cc = c.custom;
        const chips = el('div', { class: 'mp-btns' }, LAYERS.map(([lk, ln]) => el('button', { class: 'mp-upchip' + (cc.layers.includes(lk) ? ' on' : ''), onclick: () => { cc.layers = cc.layers.includes(lk) ? cc.layers.filter((x) => x !== lk) : cc.layers.concat(lk); config.save(); rerender(); } }, ln)));
        const col = el('input', { class: 'mp-color', type: 'color', value: cc.color || '#ff9a1f' });
        col.addEventListener('change', () => { cc.color = col.value; config.save(); });
        const minfo = el('div', { class: 'mp-dim', style: { margin: '4px 0' } }, '…');
        idb.get('media:wlasny').then((m) => { minfo.textContent = m ? `Twoja animacja: ${m.name}` : 'Nie wgrano jeszcze animacji (GIF, PNG, WebP, MP4, WebM — do 25 MB).'; }).catch(() => {});
        const posSel = el('select', { class: 'mp-in' }, [['above', 'Nad oknem łupu'], ['center', 'Na środku ekranu'], ['full', 'Cały ekran']].map(([v, l]) => { const o = el('option', { value: v }, l); if ((cc.mediaPos || 'above') === v) o.selected = true; return o; }));
        posSel.addEventListener('change', () => { cc.mediaPos = posSel.value; config.save(); });
        const ms = el('input', { class: 'mp-range', type: 'range', min: 10, max: 100, step: 5, value: cc.mediaSize || 45 });
        const pm = () => ms.style.setProperty('--p', ((ms.value - 10) / 90) * 100 + '%'); pm();
        ms.addEventListener('input', () => { pm(); cc.mediaSize = Number(ms.value); }); ms.addEventListener('change', () => config.save());
        box.appendChild(el('div', { class: 'mp-card' }, el('h3', null, 'Twoje powiadomienie — import'),
          el('div', { class: 'mp-dim', style: { marginBottom: '6px' } }, 'Wgraj własną grafikę lub animację, która pojawi się przy legendzie (warstwa „Moja animacja”). Gotowy efekt możesz zapisać do pliku i wczytać na innym komputerze albo dać znajomym.'),
          minfo,
          el('div', { class: 'mp-btns' },
            el('button', { class: 'mp-btn', onclick: () => pickMedia(rerender) }, 'Wgraj animację / grafikę'),
            el('button', { class: 'mp-btn bad', onclick: async () => { await idb.del('media:wlasny').catch(() => {}); if (mediaUrl) URL.revokeObjectURL(mediaUrl); mediaUrl = null; cc.layers = cc.layers.filter((x) => x !== 'media'); config.save(); rerender(); } }, 'Usuń animację')),
          el('div', { class: 'mp-lg-row', style: { marginTop: '8px' } }, el('span', { class: 'mp-dim', style: { width: '90px' } }, 'Położenie'), posSel),
          el('div', { class: 'mp-lg-row' }, el('span', { class: 'mp-dim', style: { width: '90px' } }, 'Wielkość'), ms),
          el('div', { class: 'mp-btns' },
            el('button', { class: 'mp-btn', onclick: () => importOwn(rerender) }, 'Importuj efekt (.json)'),
            el('button', { class: 'mp-btn', onclick: exportOwn }, 'Eksportuj efekt (.json)'))));
        const selRow = (label, key, opts, def) => {
          const sel = el('select', { class: 'mp-in' }, opts.map(([v, l]) => { const o = el('option', { value: v }, l); if ((cc[key] || def) === v) o.selected = true; return o; }));
          sel.addEventListener('change', () => { cc[key] = sel.value; config.save(); });
          return el('div', { class: 'mp-lg-row' }, el('span', { class: 'mp-dim', style: { width: '120px' } }, label), sel);
        };
        const rangeRow = (label, key, min, max, step, def, unit) => {
          const r = el('input', { class: 'mp-range', type: 'range', min, max, step, value: cc[key] ?? def });
          const o = el('span', { class: 'mp-dim', style: { width: '46px', textAlign: 'right' } }, `${cc[key] ?? def}${unit}`);
          const pp = () => r.style.setProperty('--p', ((r.value - min) / (max - min)) * 100 + '%'); pp();
          r.addEventListener('input', () => { pp(); o.textContent = r.value + unit; cc[key] = Number(r.value); });
          r.addEventListener('change', () => config.save());
          return el('div', { class: 'mp-lg-row' }, el('span', { class: 'mp-dim', style: { width: '120px' } }, label), r, o);
        };
        const txt = el('input', { class: 'mp-in', type: 'text', maxlength: 24, value: cc.text || 'LEGENDA!', placeholder: 'LEGENDA!' });
        txt.addEventListener('change', () => { cc.text = txt.value.trim() || 'LEGENDA!'; config.save(); });
        box.appendChild(el('div', { class: 'mp-card' }, el('h3', null, 'Pole z legendą i napis'),
          selRow('Obwódka pola', 'ring', [['thor', 'Błyskawica (niebieska)'], ['smoke', 'Czarno-czerwona'], ['kasyno', 'Złota'], ['disco', 'Neonowa (tęcza)'], ['wlasny', 'W moim kolorze']], 'wlasny'),
          selRow('Efekt legendy', 'itemFx', [['glow', 'Świeci moim kolorem'], ['bolts', 'Pioruny w legendę'], ['fade', 'Pojawia się i znika'], ['pop', 'Wyskakuje i kręci się'], ['hue', 'Świeci zmieniając kolory']], 'glow'),
          el('div', { class: 'mp-lg-row' }, el('span', { class: 'mp-dim', style: { width: '120px' } }, 'Tekst napisu'), txt),
          selRow('Czcionka napisu', 'font', [['Cinzel', 'Klasyczna (Cinzel)'], ['Bungee', 'Kasynowa (Bungee)'], ['Monoton', 'Neonowa (Monoton)']], 'Cinzel'),
          rangeRow('Intensywność', 'intensity', 30, 250, 10, 100, '%'),
          rangeRow('Przyciemnienie', 'dim', 0, 85, 5, 35, '%')));
        box.appendChild(el('div', { class: 'mp-card' }, el('h3', null, 'Twój efekt'),
          el('div', { class: 'mp-dim', style: { marginBottom: '6px' } }, 'Warstwy efektu — włącz dowolne:'), chips,
          el('div', { class: 'mp-lg-row', style: { marginTop: '10px' } }, el('span', { class: 'mp-dim', style: { width: '90px' } }, 'Kolor'), col)));
      }
    },
    init(c) {
      cfg = c;
      c.sounds = c.sounds || {};
      if (!document.querySelector(`link[href="${FONTS}"]`)) document.head.appendChild(el('link', { rel: 'stylesheet', href: FONTS }));
      bus.on('data', onData);
      const scan = debounce(scanDom, 80);
      new MutationObserver(() => { if (cfg.enabled) scan(); }).observe(document.body, { childList: true, subtree: true });
      MP.legenda = { play, stop: stopFx, STYLES, SOUND, debug: () => { const t = store.get('legenda:lootTpl', null); return { rozmiary: store.get('legenda:lootSizes', {}), wzor: t ? t.html.slice(0, 9000) : null, rodzic: t && t.parent }; } };
    },
    onToggle(on) { if (!on) stopFx(); },
  });
})();

// ═══ src/addons/pogromca.js ═══
/* ───────── Pogromca Tytanów ─────────
 * Okienko w trakcie walki: jakie efekty działają na Twoją drużynę (albo na Ciebie solo) i na przeciwników,
 * ile tur im zostało, oraz kiedy tytan / kolos / mob uderzy naładowanym atakiem.
 * Pozytywne efekty — kolor „dobry", negatywne — czerwony; kolory dopasowane do Motywnika albo klasyczne.
 *
 * Skąd dane: gra nie opisuje efektów w jednym, znanym miejscu, więc czytamy kilka źródeł naraz:
 *   1) dane wojowników w walce (Engine.battle i pakiety walki „f.w") — szukamy list efektów z czasem trwania,
 *   2) dziennik walki („f.m") — komunikaty o nałożeniu efektu / ładowaniu ataku z liczbą tur.
 * Przycisk „Zbierz dane walki" zapisuje surowe dane z prawdziwej walki, żeby dopasować odczyt do gry.
 */
(() => {
  let cfg, win = null, preview = false, timer = null;
  const PACKETS = [];               // ostatnie pakiety walki (do diagnozy)
  const LOGS = [];                  // ostatnie linie dziennika walki
  let state = { round: 0, w: {}, fromLog: {}, charge: {}, acts: 0, casts: [], domTurn: 0 };
  const fresh = () => ({ round: 0, w: {}, fromLog: {}, charge: {}, acts: 0, casts: [], domTurn: 0 });

  /*
   * Umiejętności ostateczne tytanów i kolosów: [nazwa, pierwsza tura, co ile tur, opis].
   * Źródło: opisy postaci na margohelp.pl i margoworld.pl („Rzucany w X turze, co Y tur").
   */
  const BOSS = {
    'Zabójczy Królik': [['Rozszarpanie wrogów', 4, 12, 'obrażenia + głęboka rana na wszystkich'], ['Ugryzienie w ucho', 8, 12, 'ogłuszenie 1 tura + głęboka rana'], ['Żar tropików', 11, 11, 'ogień i trucizna na wszystkich'], ['Ucieczka i przegrupowanie', 16, 24, 'odrzut wszystkich o 2 rzędy']],
    'Renegat Baulus': [['Obezwładnienie', 1, 14, 'ogłuszenie wszystkich na 1 turę'], ['Manifestacja', 3, 14, 'obrażenia + trucizna na wszystkich'], ['Zamach łańcuchami', 8, 14, 'obrażenia + odrzut o 2 rzędy'], ['Miażdżące uderzenie', 10, 14, 'mocny cios w broniącego']],
    'Piekielny Arcymag': [['Ognisty podmuch', 1, 15, '3 ciosy ognia w losowych graczy'], ['Piekielna burza', 7, 15, 'ogień i błyskawice na wszystkich'], ['Odprawa niewtajemniczonych', 12, 15, 'obrażenia + odrzut o 2 rzędy'], ['Pirokineza', 20, 20, 'ogień na wszystkich']],
    'Versus Zoons': [['Ostre powitanie', 1, 100, 'losowa linia + głęboka rana'], ['Egzekucja', 5, 10, 'mocny cios w broniącego'], ['Grad zatrutych kul', 9, 10, 'obrażenia + trucizna na wszystkich'], ['Głębokie rany', 13, 10, 'obrażenia + głęboka rana na wszystkich']],
    'Łowczyni Wspomnień': [['Wiatrował', 2, 10, 'losowa linia graczy'], ['Sprzeciw mieszkańców lasu', 5, 10, 'obrażenia + głęboka rana na wszystkich'], ['Ukojenie', 8, 10, 'leczy się o 7% życia'], ['Gniew driad', 10, 10, 'obrażenia + trucizna na wszystkich']],
    'Przyzywacz Demonów': [['Wydarcie duszy', 1, 10, 'ogłuszenie celu na 4 tury'], ['Zaklęcie rozpraszające', 4, 10, 'ogłuszenie wszystkich na 1 turę'], ['Osłona otchłani', 7, 10, 'zdejmuje spowolnienia + ogień na wszystkich'], ['Pocałunek śmierci', 10, 10, 'ogień i zimno na wszystkich']],
    'Maddok Magua': [['Bagienny paraliż', 1, 12, 'ogłuszenie 1 tura + głęboka rana na wszystkich'], ['Salwa grzmiących włóczni', 5, 12, 'obrażenia + błyskawice na wszystkich'], ['Manifestacja cierpienia', 7, 12, 'odrzut wszystkich o 2 rzędy'], ['Klątwa króla mokradeł', 10, 12, 'błyskawice w losową linię']],
    'Tezcatlipoca': [['Krwawe wybroczyny', 1, 10, 'rana + ogłuszenie 1 tura na wszystkich'], ['Odzyskanie wigoru', 4, 10, 'zdejmuje spowolnienia, leczy 12%'], ['Deszcz meteorytów', 7, 10, 'ogień i błyskawice na wszystkich'], ['Księżycowe cięcie', 10, 10, 'cios z przebiciem i żywiołami']],
    'Barbatos Smoczy Strażnik': [['Kaleczące skrzydła Barbatosa', 1, 10, 'ogłuszenie linii broniącego na 2 tury'], ['Kamienne zdeptanie', 4, 10, '2 ciosy w broniącego'], ['Deszcz kryształowych odłamków', 7, 10, '2 ciosy ognia we wszystkich'], ['Pradawny ogień Hebrehotha', 10, 10, 'ogień w linię broniącego']],
    'Tanroth': [['Lodowy powiew', 1, 15, 'podwójne zimno na wszystkich'], ['Przebicie włócznią', 5, 15, 'cios z przebiciem i zimnem'], ['Wymrożenie', 8, 15, 'ogłuszenie wszystkich na 1 turę'], ['Lodowa burza', 11, 15, 'obrażenia + ogłuszenie wszystkich']],
    'Amaimon Soploręki': [['Chapnięcie', 3, 15, 'cios w broniącego'], ['Przeszycie do szpiku', 7, 15, 'cios z zimnem w broniącego'], ['Noc Perseidów', 10, 15, 'trucizna + ogłuszenie wszystkich 1 tura'], ['Lodowe Pandemonium', 15, 15, 'obrażenia + zimno w linię broniącego']],
    'Umibozu': [['Zesłanie Funayurei', 2, 36, 'ogłuszenie całej drużyny na 2 tury'], ['Gniewne wody', 4, 12, 'zimno na całą drużynę'], ['Dłoń Ośmiu Trygramów', 7, 12, 'cios + trucizna w broniącego'], ['Czarne wydzieliny', 10, 12, 'zimno, linia + trucizna']],
    'Vashkar': [['Donnerwelle', 1, 10, 'błyskawice na wszystkich'], ['Błyszczący trzepot', 4, 20, 'odrzut o rząd + zdejmuje spowolnienia'], ['Wielostrzał', 6, 10, '4 strzały w losowych graczy'], ['Lśniące Sanktuarium', 8, 10, 'błyskawice i strzały na wszystkich']],
    'Hydrokora Chimeryczna': [['Fuego llameante', 1, 12, 'ogień w linię broniącego'], ['Zanurzenie pazurów', 3, 12, 'cios z przebiciem w linię'], ['Wynaturzenie', 6, 18, 'ogień w losowego gracza'], ['Agresja trzech głów', 9, 12, 'potrójny cios w broniącego']],
    'Lulukav': [['Spaczenie', 1, 10, 'obrażenia + trucizna na wszystkich'], ['Pochłonięcie dusz', 6, 10, 'atak + leczy się o 20%'], ['Lulukavkavkavkav', 9, 10, 'błyskawice, trucizna i rana na wszystkich']],
    'Arachin Podstępny': [['Innovatis', 8, 14, 'zdejmuje swoje spowolnienia']],
    'Reuzen': [['Deszcz zatrutych gałęzi', 1, 10, 'obrażenia + trucizna na wszystkich'], ['Duszące mchy', 5, 10, 'ogłuszenie wszystkich na 2 tury'], ['Trzęsienie ziemi', 8, 10, 'obrażenia na wszystkich']],
  };
  const bossOf = (name) => { const n = String(name || '').toLowerCase(); return Object.keys(BOSS).find((k) => n.includes(k.toLowerCase())); };
  /** Najbliższe umiejętności ostateczne bossa od tury `turn` (włącznie). */
  function nextUlts(boss, turn) {
    return BOSS[boss].map(([n, first, every, d]) => {
      let at = first;
      if (turn > first) at = first + Math.ceil((turn - first) / every) * every;
      return { name: n, at, left: at - turn, desc: d };
    }).sort((a, b) => a.left - b.left);
  }
  /** Bieżąca tura: z danych walki, z okna walki albo z liczby Twoich ruchów — największa wiarygodna wartość. */
  const turnNow = () => Math.max(state.round || 0, state.domTurn || 0, state.acts || 0, 1);

  /* ── klasyfikacja efektów ── */
  const NEG = /osłab|oslab|trucizn|zatru|krwaw|ogłusz|oglusz|zamroż|zamroz|szadź|szadz|spowol|oślep|oslep|podpal|płon|plon|poraż|poraz|klątw|klatw|przebic|obniż|obniz|zmniejsz|redukc|unieruch|paraliż|paraliz|strach|rozbroj|wyzwani|prowok|kruch|rozdarc|zranien|odrętw|odretw|uśpien|uspien|chorob|-\s*\d/i;
  const POS = /wzmoc|aura|furi|tarcz|regener|lecz|przyspiesz|ochron|odporn|zwiększ|zwieksz|błogosł|blogosl|kontratak|unik|odbic|barier|osłon|oslon|inspir|zryw|szał|szal|moc |siła|sila|\+\s*\d/i;
  const kind = (name, hint) => {
    if (hint === true || /^(good|buff|pos|positive|1)$/i.test(String(hint))) return 'pos';
    if (hint === false || /^(bad|debuff|neg|negative|-1|0)$/i.test(String(hint))) return 'neg';
    return NEG.test(name) ? 'neg' : POS.test(name) ? 'pos' : 'neu';
  };

  /* ── odczyt ze struktur gry (heurystyka: obiekty z nazwą i czasem trwania) ── */
  const NAME_K = ['name', 'nazwa', 'n', 'label', 'title', 'txt', 'desc'];
  const DUR_K = ['duration', 'dur', 'turns', 'turn', 'rounds', 'round', 'left', 'rest', 'remain', 'remaining', 'ttl', 'tury', 'tura', 'time', 't', 'count', 'cnt'];
  const pick = (o, ks) => { for (const k of ks) if (o[k] !== undefined && o[k] !== null && o[k] !== '') return o[k]; return undefined; };
  function effectsIn(obj, depth = 0, out = [], seen = new Set()) {
    if (!obj || typeof obj !== 'object' || depth > 3 || seen.has(obj)) return out;
    seen.add(obj);
    const vals = Array.isArray(obj) ? obj : Object.values(obj);
    for (const v of vals) {
      if (!v || typeof v !== 'object') continue;
      const nm = pick(v, NAME_K), du = pick(v, DUR_K);
      if (typeof nm === 'string' && nm.length < 60 && du !== undefined && !isNaN(Number(du))) {
        out.push({ name: nm.replace(/<[^>]+>/g, '').trim(), left: Number(du), k: kind(nm, pick(v, ['good', 'positive', 'buff', 'type', 'kind', 'negative'])) });
      } else effectsIn(v, depth + 1, out, seen);
    }
    return out;
  }
  const CHARGE_K = /charge|special|spec|prepare|load|ultimate|countdown|attack_?in|nextattack|toattack/i;
  function chargeIn(d) {
    for (const [k, v] of Object.entries(d || {})) {
      if (!CHARGE_K.test(k)) continue;
      if (typeof v === 'number' && v >= 0 && v < 30) return { name: 'Naładowany atak', left: v };
      if (v && typeof v === 'object') { const du = pick(v, DUR_K); if (du !== undefined && !isNaN(Number(du))) return { name: String(pick(v, NAME_K) || 'Naładowany atak'), left: Number(du) }; }
    }
    return null;
  }

  /** Nazwa Twojej umiejętności po numerze (z danych gry albo z paska umiejętności w walce). */
  function skillName(id) {
    try {
      const S = E() && E().skills;
      const cand = S && (S.skills || S.list || S.d || S);
      const it = cand && (typeof cand.get === 'function' ? cand.get(id) : cand[id]);
      const n = it && (it.name || (it.d && it.d.name));
      if (n) return String(n);
    } catch {}
    const slot = document.querySelector(`[data-skill-id="${id}"], [data-id="${id}"].skill, .skill-${id}`);
    const t = slot && (slot.getAttribute('tip') || slot.title || slot.textContent || '').replace(/<[^>]+>/g, ' ').trim();
    return t ? t.split(/\s{2,}|\n/)[0].slice(0, 40) : `Umiejętność #${id}`;
  }
  /** Dziennik walki z okna gry (.battle-msg) i numer tury, jeśli okno go pokazuje. */
  const seenMsg = new WeakSet();
  function readDom() {
    const bw = document.querySelector('.battle-controller, .battle-window, .battle');
    if (!bw) return;
    const tm = (bw.textContent || '').match(/tura\s*:?\s*(\d{1,3})/i);
    if (tm) state.domTurn = Math.max(state.domTurn, Number(tm[1]));
    for (const m of bw.querySelectorAll('.battle-msg')) { if (seenMsg.has(m)) continue; seenMsg.add(m); parseLog(m.textContent || ''); }
  }

  /* ── odczyt z dziennika walki ── */
  const strip = (s) => String(s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  function parseLog(line) {
    const s = strip(line);
    if (!s) return;
    LOGS.push(s); if (LOGS.length > 80) LOGS.shift();
    const tr = s.match(/^\s*(?:tura|runda)\s*(\d{1,3})\b/i); if (tr) { state.domTurn = Math.max(state.domTurn, Number(tr[1])); return; }
    // „…(2 tury)" / „…na 3 tury" bez czasownika — efekt po nazwie przy ostatnio wspomnianej postaci
    const tt = s.match(/^(.+?)[:\-–]\s*([^()]{2,40}?)\s*\((\d+)\s*tur/i);
    if (tt) { const who = tt[1].trim(); (state.fromLog[who] = state.fromLog[who] || {})[tt[2].trim()] = { left: Number(tt[3]), at: turnNow() }; }
    // „X ładuje / przygotowuje / kumuluje potężny atak … (za) 3 tur(y)"
    let m = s.match(/^(.+?)\s+(?:ładuje|laduje|przygotowuje|kumuluje|szykuje|gromadzi)\b(.*?)(\d+)\s*(?:tur|rund)/i);
    if (m) { state.charge[m[1].trim()] = { name: (m[2].replace(/\b(za|do|się|sie|w ciągu)\b/gi, '').trim() || 'Naładowany atak').slice(0, 40), left: Number(m[3]), at: turnNow() }; return; }
    // „X … efekt Y … (na) 3 tur(y)" / „Y (3 tury)" przy imieniu
    m = s.match(/^(.+?)\s+(?:otrzymuje|zyskuje|dostaje|jest pod wpływem|zostaje objęty|zostaje objęta|ma)\s+(?:efekt\s+)?[„"']?([^„"'(]{2,40}?)[”"']?\s*(?:na|\(|przez)\s*(\d+)\s*(?:tur|rund)/i);
    if (m) { const who = m[1].trim(); (state.fromLog[who] = state.fromLog[who] || {})[m[2].trim()] = { left: Number(m[3]), at: turnNow() }; }
  }

  function onData(d) {
    if (!d || !d.f) return;
    const f = d.f;
    if (f.init || f.init === 0) state = fresh();
    PACKETS.push(JSON.parse(JSON.stringify(f, (k, v) => (typeof v === 'string' && v.length > 300 ? v.slice(0, 300) + '…' : v)))); if (PACKETS.length > 40) PACKETS.shift();
    const rnd = Number(f.round ?? f.r ?? f.turn ?? f.move);
    if (!isNaN(rnd) && rnd > state.round) state.round = rnd;
    if (f.w && typeof f.w === 'object') for (const [id, w] of Object.entries(f.w)) state.w[id] = Object.assign(state.w[id] || {}, w);
    const logs = Array.isArray(f.m) ? f.m : f.m && typeof f.m === 'object' ? Object.values(f.m) : [];
    logs.forEach(parseLog);
    if (win && cfg.enabled && !preview && game.inBattle()) render();
  }

  /** Lista wojowników z efektami — z Engine.battle i z pakietów. */
  function model() {
    const out = {};
    const h = game.hero();
    const b = E() && E().battle;
    let ws = b && (b.warriorsList || b.warriors);
    try { if (typeof ws === 'function') ws = ws.call(b); } catch { ws = null; }
    const arr = Array.isArray(ws) ? ws : Object.values(ws || {});
    const add = (id, d) => {
      if (!d) return;
      const o = out[id] = out[id] || { id, name: '', team: null, hpp: null, eff: [], charge: null };
      o.name = d.name || d.nick || o.name || String(id);
      if (d.team !== undefined) o.team = d.team;
      if (d.hpp !== undefined) o.hpp = Number(d.hpp);
      o.eff = o.eff.concat(effectsIn(d));
      o.charge = o.charge || chargeIn(d);
    };
    for (const w of arr) { const d = (w && (w.d || w)) || {}; add(String(d.id ?? w.id), Object.assign({}, d, w.d ? {} : w)); }
    for (const [id, d] of Object.entries(state.w)) add(String(id), d);
    // z dziennika: dopasowanie po imieniu
    for (const o of Object.values(out)) {
      const L = state.fromLog[o.name];
      if (L) for (const [nm, v] of Object.entries(L)) { const left = v.left - Math.max(0, turnNow() - v.at); if (left > 0 && !o.eff.some((e) => e.name === nm)) o.eff.push({ name: nm, left, k: kind(nm) }); }
      const C = state.charge[o.name];
      if (C && !o.charge) { const left = C.left - Math.max(0, turnNow() - C.at); if (left >= 0) o.charge = { name: C.name, left }; }
      // ten sam efekt z dwóch źródeł — jeden wpis
      const seen = new Set(); o.eff = o.eff.filter((e) => { const k = e.name.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
    }
    // tytan / kolos z bazy: najbliższa umiejętność ostateczna jako „ładowany atak" + lista kolejnych
    const turn = turnNow();
    for (const o of Object.values(out)) {
      const b = bossOf(o.name); if (!b) continue;
      const ul = nextUlts(b, turn);
      o.boss = b; o.ults = ul;
      if (!o.charge || o.charge.left > ul[0].left) o.charge = { name: ul[0].name, left: ul[0].left, desc: ul[0].desc };
    }
    // Twoje umiejętności rzucone na wojowników (np. Wyzwanie, Szadź): ile tur temu
    for (const c of state.casts) {
      const o = c.id != null ? out[String(c.id)] : null;
      if (!o) continue;
      const ago = turn - c.at;
      if (ago > 12) continue;
      const nm = `${c.name} (Ty)`;
      if (!o.eff.some((e) => e.name.toLowerCase().startsWith(c.name.toLowerCase()))) o.eff.push({ name: nm, left: null, ago, k: kind(c.name) === 'neu' ? (Number(o.id) < 0 ? 'neg' : 'pos') : kind(c.name) });
    }
    // drużyny: ta z bohaterem = „my"
    const me = h && out[String(h.id)];
    const myTeam = me ? me.team : null;
    const allies = [], enemies = [];
    for (const o of Object.values(out)) (myTeam !== null && o.team !== null ? (String(o.team) === String(myTeam) ? allies : enemies) : (Number(o.id) > 0 ? allies : enemies)).push(o);
    return { allies, enemies };
  }

  /* ── wygląd: kolory Motywnika albo klasyczne Margonem ── */
  function palette() {
    const t = MP.motywnik && MP.motywnik.current && MP.motywnik.current();
    if (t) return { bg: `linear-gradient(${t.bg2},${t.bg1})`, line: t.line, edge: t.m ? t.m[2] : t.line, text: t.text, dim: t.text2, head: t.head, pos: t.a1, neg: '#ff5a5a', neu: t.text2, chg: '#ffb020', glow: t.glow, chip: t.bg0 };
    return { bg: 'linear-gradient(#2c2016,#1b130c)', line: '#7a5a34', edge: '#4a3420', text: '#f1e3c6', dim: '#c2a97f', head: 'Georgia, serif', pos: '#7fd36a', neg: '#ff6a5a', neu: '#d9c7a3', chg: '#ffb43a', glow: 'rgba(255,190,90,.15)', chip: 'rgba(0,0,0,.35)' };
  }

  function ensureWin() {
    if (win && win.isConnected) return win;
    const pos = store.get('win:pogromca', { x: innerWidth - 330, y: 140 });
    win = el('div', { id: 'mp-pt', style: { left: pos.x + 'px', top: pos.y + 'px' } },
      el('div', { class: 'mp-pt-h' }, el('b', null, 'Pogromca Tytanów'), el('span', { class: 'mp-pt-r' }), el('button', { class: 'mp-pt-x', title: 'Zbierz dane walki (skopiuj i wklej w rozmowie)', onclick: () => collect() }, '⧉'), el('button', { class: 'mp-pt-x', title: 'Ukryj do końca walki', onclick: () => { win.style.display = 'none'; preview = false; } }, '×')),
      el('div', { class: 'mp-pt-b' }));
    document.body.appendChild(win);
    makeDraggable(win, win.querySelector('.mp-pt-h'), (p) => store.set('win:pogromca', p));
    return win;
  }

  function chip(e, P, warnAt) {
    const c = e.k === 'pos' ? P.pos : e.k === 'neg' ? P.neg : P.neu;
    const soon = e.left != null && e.left <= warnAt;
    return el('div', { class: 'mp-pt-e' + (soon ? ' soon' : ''), style: { '--c': c, background: P.chip } },
      el('span', { class: 'mp-pt-dot' }), el('span', { class: 'mp-pt-n' }, e.name), el('span', { class: 'mp-pt-t' }, e.left == null ? (e.ago === 0 ? 'teraz' : `${e.ago} t. temu`) : e.left === 1 ? '1 tura' : e.left > 1 && e.left < 5 ? `${e.left} tury` : `${e.left} tur`));
  }
  function row(o, P) {
    const box = el('div', { class: 'mp-pt-w' },
      el('div', { class: 'mp-pt-wn' }, el('span', null, o.name), o.hpp !== null && !isNaN(o.hpp) ? el('span', { class: 'mp-pt-hp' }, el('i', { style: { width: Math.max(0, Math.min(100, o.hpp)) + '%' } })) : null));
    if (o.charge) {
      const now1 = o.charge.left <= (cfg.warnAt ?? 1);
      box.appendChild(el('div', { class: 'mp-pt-c' + (now1 ? ' soon' : ''), style: { '--c': P.chg }, title: o.charge.desc || '' }, '⚡ ', el('b', null, o.charge.name), ' — ', o.charge.left <= 0 ? 'w TEJ turze' : `za ${o.charge.left} ${o.charge.left === 1 ? 'turę' : o.charge.left < 5 ? 'tury' : 'tur'}`, o.charge.desc ? el('div', { class: 'mp-pt-cd' }, o.charge.desc) : null));
    }
    if (o.ults && o.ults.length > 1) box.appendChild(el('div', { class: 'mp-pt-u', style: { color: P.dim } }, 'Dalej: ', o.ults.slice(1, 3).map((u, i) => el('span', null, i ? ' · ' : '', el('b', { style: { color: P.text } }, u.name), ` za ${u.left} t.`))));
    const eff = o.eff.slice().sort((a, b) => (a.left ?? 99) - (b.left ?? 99));
    if (eff.length) box.appendChild(el('div', { class: 'mp-pt-es' }, eff.map((e) => chip(e, P, cfg.warnAt ?? 1))));
    else if (!o.charge) box.appendChild(el('div', { class: 'mp-pt-none', style: { color: P.dim } }, 'brak efektów'));
    return box;
  }

  function render(data) {
    const w = ensureWin(), P = palette();
    Object.assign(w.style, { background: P.bg, borderColor: P.line, color: P.text, boxShadow: `0 0 0 1px ${P.edge}, 0 10px 28px rgba(0,0,0,.6), 0 0 18px ${P.glow}`, fontSize: (cfg.scale || 100) * 0.128 + 'px' });
    w.querySelector('.mp-pt-h b').style.fontFamily = P.head;
    w.querySelector('.mp-pt-h').style.borderColor = P.line;
    const { allies, enemies } = data || model();
    w.querySelector('.mp-pt-r').textContent = preview ? 'podgląd' : `tura ${turnNow()}`;
    const B = w.querySelector('.mp-pt-b'); B.textContent = '';
    const solo = allies.length <= 1;
    const sec = (title, list) => { if (!list.length) return; B.appendChild(el('div', { class: 'mp-pt-s', style: { color: P.dim, borderColor: P.line } }, title)); list.forEach((o) => B.appendChild(row(o, P))); };
    if (cfg.showAllies !== false) sec(solo ? 'Ty' : 'Twoja drużyna', allies);
    if (cfg.showEnemies !== false) sec('Przeciwnicy', enemies);
    if (!B.children.length) B.appendChild(el('div', { class: 'mp-pt-none', style: { color: P.dim } }, 'Brak danych o efektach w tej walce.'));
    w.style.display = '';
  }

  function sample() {
    return {
      allies: [
        { id: 1, name: 'Habiachi', hpp: 82, eff: [{ name: 'Aura ochrony', left: 3, k: 'pos' }, { name: 'Furia', left: 1, k: 'pos' }, { name: 'Trucizna', left: 2, k: 'neg' }] },
        { id: 2, name: 'Nakuemease', hpp: 57, eff: [{ name: 'Szadź', left: 1, k: 'neg' }] },
      ],
      enemies: [
        { id: -1, name: 'Piekielny Arcymag', hpp: 64, charge: { name: 'Piekielna burza', left: 2, desc: 'ogień i błyskawice na wszystkich' }, ults: [{ name: 'Piekielna burza', left: 2 }, { name: 'Odprawa niewtajemniczonych', left: 7 }, { name: 'Ognisty podmuch', left: 10 }], eff: [{ name: 'Wyzwanie (Ty)', left: null, ago: 1, k: 'neg' }, { name: 'Osłabienie', left: 4, k: 'neg' }, { name: 'Wzmocnienie', left: 1, k: 'pos' }] },
        { id: -2, name: 'Sługa tytana', hpp: 30, charge: { name: 'Naładowany atak', left: 1 }, eff: [] },
      ],
    };
  }

  function tick() {
    if (!cfg.enabled) return;
    if (preview) return;
    if (game.inBattle()) { readDom(); if (cfg.onlyBoss && !Object.values(model()).flat().some((o) => o.boss)) { if (win) win.style.display = 'none'; return; } render(); }
    else if (win && win.style.display !== 'none') { win.style.display = 'none'; }
  }

  function collect() {
    const b = E() && E().battle;
    const shape = (o, d = 0) => { if (!o || typeof o !== 'object' || d > 2) return typeof o; const r = {}; for (const k of Object.keys(o).slice(0, 60)) { const v = o[k]; r[k] = typeof v === 'function' ? 'fn' : v && typeof v === 'object' ? shape(v, d + 1) : v; } return r; };
    let ws = b && (b.warriorsList || b.warriors); try { if (typeof ws === 'function') ws = ws.call(b); } catch {}
    const arr = Array.isArray(ws) ? ws : Object.values(ws || {});
    const txt = JSON.stringify({ wersja: MP.version, wWalce: game.inBattle(), battleKeys: b ? Object.keys(b).slice(0, 120) : null, wojownicy: arr.slice(0, 6).map((w) => shape(w)), pakiety: PACKETS.slice(-25), dziennik: LOGS.slice(-40), tura: turnNow(), stan: { round: state.round, domTurn: state.domTurn, acts: state.acts, casts: state.casts }, komendy: (net.recent || []).slice(0, 25), skills: (() => { try { const S = E().skills; return S ? Object.keys(S).slice(0, 40) : null; } catch { return null; } })(), okno: (document.querySelector('.battle-controller, .battle-window') || {}).outerHTML?.slice(0, 4000) });
    const fallback = () => { const t = el('textarea', { style: { position: 'fixed', left: '-9999px' } }); t.value = txt; document.body.appendChild(t); t.select(); try { document.execCommand('copy'); } catch {} t.remove(); };
    try { navigator.clipboard.writeText(txt).catch(fallback); } catch { fallback(); }
    toast(`Pogromca Tytanów: skopiowano dane walki (${PACKETS.length} pakietów) — wklej je w rozmowie`, 'ok', 5000);
  }

  defineAddon({
    id: 'pogromca', name: 'Pogromca Tytanów', icon: 'pogromca', color: ['#ff6a3d', '#7a1fff'],
    desc: 'W walce pokazuje okienko z efektami na Twojej drużynie (albo na Tobie solo) i na przeciwnikach: nazwa efektu i za ile tur zniknie. Przy tytanach, kolosach i mobach — kto ładuje atak i za ile uderzy. Pomaga trafić z szadzią, furią, aurą czy wyzwaniem. Pozytywne efekty mają kolor stylu, negatywne — czerwony.',
    defaults: { enabled: false, showAllies: true, showEnemies: true, warnAt: 1, scale: 100 },
    settings: [
      { key: 'showAllies', type: 'bool', label: 'Pokazuj moją drużynę' },
      { key: 'showEnemies', type: 'bool', label: 'Pokazuj przeciwników' },
      { key: 'warnAt', type: 'number', label: 'Wyróżnij, gdy zostało tur', min: 0, max: 5, hint: 'Efekt lub atak, który kończy się za tyle tur (lub mniej), miga.' },
      { key: 'scale', type: 'range', label: 'Wielkość okienka (%)', min: 80, max: 140, step: 5 },
      { key: 'onlyBoss', type: 'bool', label: 'Tylko w walkach z tytanami i kolosami' },
    ],
    render(box) {
      box.appendChild(el('div', { class: 'mp-card' }, el('h3', null, 'Podgląd i dane'),
        el('div', { class: 'mp-dim', style: { marginBottom: '6px' } }, 'Okienko pokazuje się samo na czas walki i można je przesuwać. „Podgląd" pokazuje przykładowe efekty poza walką.'),
        el('div', { class: 'mp-btns' },
          el('button', { class: 'mp-btn pri', onclick: () => { preview = true; render(sample()); } }, 'Podgląd'),
          el('button', { class: 'mp-btn', onclick: () => { preview = false; if (win) win.style.display = 'none'; } }, 'Ukryj'),
          el('button', { class: 'mp-btn', onclick: collect }, 'Zbierz dane walki')),
        MP.note('info', 'Po pierwszej walce z efektami (najlepiej z tytanem lub kolosem) kliknij <b>Zbierz dane walki</b> jeszcze w trakcie walki i wklej wynik w rozmowie — dopasuję odczyt dokładnie do tego, jak gra przesyła efekty.')));
    },
    init(c) {
      cfg = c;
      bus.on('data', onData);
      bus.on('battle:start', () => { state = fresh(); preview = false; });
      // Twoje ruchy w walce = kolejne tury (zapas, gdy gra nie podaje numeru tury)
      bus.on('cmd', (t) => {
        const m = String(t || '').match(/^fight&a=(attack|spell|move|skip|wait|turn|use)(?:&s=(\d+))?(?:.*?&id=(-?\d+))?/);
        if (!m || !game.inBattle()) return;
        state.acts++;
        if (m[1] === 'spell' && m[2]) state.casts.push({ s: Number(m[2]), id: m[3] ? Number(m[3]) : null, at: turnNow(), name: skillName(Number(m[2])) });
        if (win && cfg.enabled && !preview) setTimeout(render, 50);
      });
      bus.on('battle:end', () => { if (win && !preview) win.style.display = 'none'; });
      timer = setInterval(tick, 500);
      MP.pogromca = { render, sample, collect, state: () => state, preview: () => { preview = true; render(sample()); } };
    },
    onToggle(on) { if (!on && win) win.style.display = 'none'; },
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
    if (now() - t0 > 120000) { console.warn('[L4Tools] Nie wykryto gry (nowy interfejs) — panel nie startuje.'); return; }
    await sleep(500);
  }
  await sleep(800);
  const h = game.hero();
  config.load(h && h.nick);
  config.data.global.dryRun = false;   // tryb próbny usunięty z panelu
  injectCSS();
  // zastrzeżenie — przy pierwszym uruchomieniu (i po każdej zmianie jego treści), dopóki nie zostanie zaakceptowane
  if (!store.get('disclaimer:v1', false)) {
    const ok = await confirmBox({
      title: 'L4Tools — ważne informacje przed użyciem',
      okText: 'Akceptuję', cancelText: 'Nie akceptuję', width: '520px',
      html: [
        '<p style="margin:0 0 8px"><b>L4Tools</b> to nieoficjalny zestaw dodatków do gry Margonem. Nie jest tworzony, wspierany ani zatwierdzony przez Garmory sp. z o.o. ani przez administrację gry.</p>',
        '<p style="margin:0 0 8px">Korzystanie z dodatków, które zmieniają działanie klienta gry lub wykonują czynności bez udziału gracza, może zostać uznane za naruszenie Regulaminu gry i skutkować sankcjami — w tym czasową lub trwałą blokadą konta.</p>',
        '<p style="margin:0 0 8px">Autor L4Tools <b>nie ponosi odpowiedzialności</b> za jakiekolwiek skutki korzystania z dodatków, w szczególności za kary nałożone przez administrację gry, utratę przedmiotów, waluty, postępów lub dostępu do konta. Dodatki udostępniane są w obecnej postaci, bez żadnych gwarancji działania.</p>',
        '<p style="margin:0">Klikając „Akceptuję", potwierdzasz, że zapoznałeś się z powyższym i korzystasz z dodatków <b>na własne ryzyko i odpowiedzialność</b>.</p>',
      ].join(''),
    });
    if (!ok) { toast('L4Tools nie został uruchomiony — warunki nie zostały zaakceptowane. Odśwież grę, aby zobaczyć je ponownie.', 'warn', 7000); return; }
    store.set('disclaimer:v1', true);
  }
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
  console.log(`%c[L4Tools] v${MP.version} gotowy — ${addons.list.length} dodatków. Panel: ${config.data.global.panelKey}`, 'color:#7c5cff;font-weight:bold');
  if (!store.get('welcomed', false)) {
    store.set('welcomed', true);
    toast(`L4Tools gotowy — kliknij ikonkę albo naciśnij ${config.data.global.panelKey}`, 'ok', 6000);
  }
})();

MP.version = "3.4.0";
})();
