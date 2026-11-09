// ==UserScript==
// @name         laddonz — legalne dodatki (NI)
// @namespace    https://github.com/L4tuch/laddonz
// @version      1.4.0
// @description  Panel dodatków do Margonem (nowy interfejs): Napad, Bratan, Kto tu jest?, Kto złapie, Let's Cook Together i inne. Jedna akcja = jedno naciśnięcie, automaty domyślnie wyłączone.
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
      else if (k === 'style' && typeof v === 'object') Object.assign(n.style, v);
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
  if (item._cachedStats && typeof item._cachedStats === 'object') return item._cachedStats;
  const s = item.stat || item.stats || '';
  if (typeof s === 'object') return s;
  const out = {};
  String(s).split(';').forEach((p) => {
    if (!p) return;
    const i = p.indexOf('=');
    if (i < 0) out[p] = true; else out[p.slice(0, i)] = p.slice(i + 1);
  });
  return out;
}

function normItem(it) {
  if (!it) return null;
  const st = parseStats(it);
  const expires = st.expires != null ? Number(st.expires) : null;
  return {
    id: Number(it.id),
    name: it.name || '',
    cl: Number(it.cl) || 0,
    icon: it.icon || '',
    loc: it.loc || '',
    st: Number(it.st) || 0,           // 0 = w torbie, >0 = założony slot
    x: Number(it.x), y: Number(it.y),
    stats: st,
    rarity: String(st.rarity || (st.legendary ? 'legendary' : st.heroic ? 'heroic' : st.unique ? 'unique' : 'common')),
    legbon: st.legbon ? String(st.legbon).split(',')[0] : null,
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

  /** Członkowie grupy (id). Uzupełniane też z odpowiedzi serwera (net.js → partyCache). */
  partyMembers() {
    try {
      const p = E().party;
      if (p) {
        if (typeof p.getMembers === 'function') {
          const m = p.getMembers();
          const ids = (Array.isArray(m) ? m : Object.keys(m || {})).map((x) => Number(x && x.id ? x.id : x));
          if (ids.length) return ids.filter(Boolean);
        }
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
    if (/^https?:/.test(icon)) return icon;
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
  destroyItem:  { t: '', destructive: true, label: 'Usunięcie przedmiotu', how: 'Usuń ręcznie JEDEN bezwartościowy przedmiot.' },
  enhance:      { t: '', destructive: true, label: 'Ulepszenie przedmiotu', how: 'Ulepsz ręcznie przedmiot jednym składnikiem.' },
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
    setInterval(() => { if (game.ready()) this.set(game.inBattle()); }, 400);
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
  smieciara: '<path d="M4.5 6.5h15"/><path d="M9.5 6.5V4.5h5v2"/><path d="M6.5 6.5l1 13.5h9l1-13.5"/><path d="M10 10.5v6M14 10.5v6"/>',
  taxi: '<path d="M4 16v-3.5L6 8h12l2 4.5V16"/><path d="M3 16h18v2.5H3z"/><circle cx="7.5" cy="16" r="1.8"/><circle cx="16.5" cy="16" r="1.8"/><path d="M9.5 5h5v3h-5z"/>',
  autof: '<path d="M13 2.5L5 13.5h6l-1 8 8-11h-6z"/>',
  szybka: '<path d="M8 12.5V5.5a1.5 1.5 0 013 0V11"/><path d="M11 10V4a1.5 1.5 0 013 0v6.5"/><path d="M14 10.5V6a1.5 1.5 0 013 0v7.5c0 4-2.5 7-6 7-2.6 0-4.3-1.3-5.6-3.5L3.7 14a1.5 1.5 0 012.6-1.5l1.7 2.3"/>',
  ulepszarka: '<path d="M3 21l8.5-8.5"/><path d="M13.5 4.5l6 6"/><path d="M11 7l6 6-2 2-6-6z"/><path d="M19 3l.6 1.4L21 5l-1.4.6L19 7l-.6-1.4L17 5l1.4-.6z"/><path d="M5 4l.4 1 1 .4-1 .4L5 7l-.4-1.2-1-.4 1-.4z"/>',
  minichat: '<path d="M4 5h16v10.5H9l-5 4z"/><path d="M14 10.5h3.5M14 10.5v-3.5"/><path d="M8 8.5l2.5 2.5"/>',
  // interfejs
  logo: '<path d="M12 2.5l8.5 5v9L12 21.5l-8.5-5v-9z"/><path d="M10 7.8v8.4h5" stroke-width="2.3"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
  diag: '<path d="M3 12h4l2.5-6 5 12 2.5-6H21"/>',
  log: '<path d="M5 5h14M5 10h14M5 15h9M5 20h6"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M21.5 12h-3M5.5 12h-3M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1M18.7 18.7l-2.1-2.1M7.4 7.4L5.3 5.3"/>',
  grid: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
  warn: '<path d="M12 3.5l9.5 16.5h-19z"/><path d="M12 10v4.5M12 17.2v.3"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 018 0v3"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M17 6l3 3M15 8l2 2"/>',
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
:root{--mp-accent:#7c5cff;--mp-glass:.55;--mp-fg:#eef0ff;--mp-dim:#a6abc8;--mp-line:rgba(255,255,255,.10);--mp-ok:#3ddc97;--mp-warn:#ffb547;--mp-bad:#ff5d7a}
.mp-glass{background:rgba(16,17,28,var(--mp-glass));-webkit-backdrop-filter:blur(18px) saturate(160%);backdrop-filter:blur(18px) saturate(160%);border:1px solid rgba(255,255,255,.12);box-shadow:0 20px 60px rgba(0,0,0,.45),inset 0 1px 0 rgba(255,255,255,.08);color:var(--mp-fg);font:13px/1.45 "Segoe UI",system-ui,-apple-system,Roboto,sans-serif}
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

/* Hey WakeUP! — podglądy stylów */
.mp-wk-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px}
.mp-wk-prev{cursor:pointer;border-radius:12px;border:1px solid rgba(255,255,255,.1);overflow:hidden;background:rgba(0,0,0,.2)}
.mp-wk-prev:hover{border-color:rgba(255,255,255,.3)}
.mp-wk-prev.on{border-color:var(--mp-accent);box-shadow:0 0 0 2px color-mix(in srgb,var(--mp-accent) 45%,transparent)}
.mp-wk-stage{height:62px;display:flex;align-items:center;justify-content:center;background:repeating-linear-gradient(45deg,#4a3f52 0 10px,#43394b 10px 20px);overflow:hidden;padding:0 4px}
.mp-wk-msg{white-space:nowrap;transform:scale(.62);transform-origin:center}
.mp-wk-msg.gra{color:#ffe500;font:700 24px/1.3 Arial,sans-serif;text-shadow:2px 0 0 #000,-2px 0 0 #000,0 2px 0 #000,0 -2px 0 #000,1px 1px 0 #000,-1px -1px 0 #000,1px -1px 0 #000,-1px 1px 0 #000}
.mp-wk-name{padding:5px 8px;font-size:12px;font-weight:600;text-align:center}

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
#mp-ctx{position:fixed;z-index:2147483100;border-radius:12px;padding:5px;min-width:170px}
.mp-ctx-title{padding:5px 9px;color:var(--mp-dim);font-size:11.5px;border-bottom:1px solid var(--mp-line);margin-bottom:4px}
.mp-ctx-item{all:unset;display:block;width:100%;box-sizing:border-box;padding:7px 10px;border-radius:8px;cursor:pointer;font-size:12.5px}
.mp-ctx-item:hover{background:color-mix(in srgb,var(--mp-accent) 35%,transparent)}

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
.mp-ibadge.chance{bottom:-14px;left:50%;transform:translateX(-50%);color:#9dffcf;border-color:rgba(61,220,151,.5);font-size:10px}
.mp-ibadge.queued{top:-2px;left:-2px;color:#fff;background:var(--mp-accent);border-color:transparent}

/* Pokaż EQ */
#mp-eqtip{position:fixed;z-index:2147483150;border-radius:14px;padding:10px;width:290px;pointer-events:none}
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

  ORDER: ['napad', 'wakeup', 'bratan', 'ktotu', 'ktozlapie', 'cook', 'podpis', 'pokazeq', 'jakibon', 'smieciara', 'taxi', 'autof', 'szybka', 'ulepszarka', 'minichat'],

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
 *   • na graczu:      „⚔ Napad"
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
      if (id) this.setLast('item', id);
    }, true);
    document.addEventListener('contextmenu', (e) => {
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
    setInterval(() => this.hookOthers(), 1000);
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
          if (menu) self.inject(menu);
        } catch (e) { console.warn('[laddonz] menu', e); }
        return f.apply(this, args);
      };
      w.__mpMenu = true;
      try { I[n] = w; this.hooked = true; this.hookName = n; } catch {}
    }
  },

  inject(menu) {
    let tgt = this.last && now() - this.last.t < 800 ? this.last : null;
    if (!tgt) tgt = this.guessPlayerFromMenu(menu);
    if (!tgt) return;
    const add = this.entriesFor(tgt.type, tgt.id);
    add.forEach((x) => menu.push(this.toGameEntry(menu, x)));
    if (add.length) this.lastInject = now();
  },
  lastInject: 0,

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
    const m = el('div', { id: 'mp-ctx', class: 'mp-glass', style: { left: x + 'px', top: y + 'px' } },
      title ? el('div', { class: 'mp-ctx-title' }, title) : null,
      entries.map((e) => el('button', { class: 'mp-ctx-item', onclick: () => { m.remove(); e.fn(); } }, e.label)));
    document.body.appendChild(m);
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

  applyTheme() {
    const g = config.data.global;
    document.documentElement.style.setProperty('--mp-accent', g.accent || '#7c5cff');
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
          icon('pin', 14), quickbar.isPinned(a.id) ? 'W skrótach ✓' : 'Dodaj do skrótów') : null,
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
      { key: 'accent', type: 'color', label: 'Kolor akcentu' },
      { key: 'glass', type: 'range', label: 'Przezroczystość tła', min: 0.2, max: 0.95, step: 0.05 },
      { key: 'menuSelector', type: 'textarea', label: 'Selektor menu prawego przycisku w grze', hint: 'Zapas, gdy opcje (np. „⚔ Napad") nie pojawiają się w menu gracza.' },
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
    // klik poza oknem szybkich ustawień je zamyka
    document.addEventListener('mousedown', (e) => {
      if (!this.pop) return;
      if (this.pop.contains(e.target) || (this.bar && this.bar.contains(e.target)) || (e.target.closest && e.target.closest('.mp-modal-bg'))) return;
      this.closePop();
    }, true);
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
      P.style.top = clamp(anchor ? anchor.getBoundingClientRect().top - 20 : r.top, 8, innerHeight - 200) + 'px';
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
/* ───────── Napad ─────────
 * Atak pod klawisz na najbliższego wroga w zasięgu (bez gonienia), opcja „Napad" w menu gracza,
 * pamiętanie ochrony (nie marnuje ataków), zmiana zestawu, oraz tryb AUTO
 * (atakuje graczy, którzy wejdą w zasięg — wg tych samych filtrów). AUTO domyślnie wyłączone.
 */
(() => {
  const S = { last: 0, protectedUntil: {}, backoff: {}, autoTried: {}, lastSet: { id: null, t: 0 }, auto: false, timer: null };
  let cfg;

  const enemies = () => game.others().filter((p) => !isFriendly(p));

  function candidates(range, forAuto) {
    const h = game.hero(); if (!h) return [];
    let list = game.others().filter((p) => !isFriendly(p) && !nickIn(cfg.neverList, p.nick));
    if (cfg.targetMode === 'tagged') list = list.filter((p) => p.isEnemyTagged || nickIn(cfg.targetList, p.nick));
    if (forAuto && cfg.autoOnlyList) list = list.filter((p) => nickIn(cfg.targetList, p.nick));
    if (cfg.lvlMin) list = list.filter((p) => p.lvl >= cfg.lvlMin);
    if (cfg.lvlMax) list = list.filter((p) => p.lvl <= cfg.lvlMax);
    if (range > 0) list = list.filter((p) => game.dist(h, p) <= range + 0.01);
    const t = now();
    if (cfg.skipProtected) list = list.filter((p) => !(S.protectedUntil[p.id] > t));
    list = list.filter((p) => !(S.backoff[p.id] > t));
    return list.sort((a, b) => {
      const pa = nickIn(cfg.targetList, a.nick) ? 0 : 1, pb = nickIn(cfg.targetList, b.nick) ? 0 : 1;
      return pa - pb || game.dist(h, a) - game.dist(h, b);
    });
  }

  async function attack(p, why) {
    if (!p) return false;
    const t = now();
    if (t - S.last < Math.max(500, cfg.minInterval)) return false;
    if (game.inBattle()) return false;
    if (cfg.skipProtected && S.protectedUntil[p.id] > t) {
      toast(`${p.nick} ma jeszcze ochronę (${Math.ceil((S.protectedUntil[p.id] - t) / 1000)} s)`, 'warn', 1800);
      return false;
    }
    S.last = t;
    // zestaw zależny od profesji atakowanego (0 = nie zmieniaj)
    if (cfg.switchSet) {
      const setId = Number((cfg.setByProf || {})[p.prof]) || 0;
      const single = enemies().length === 1;
      if (setId && (!cfg.setOnlySingleEnemy || single) && !(S.lastSet.id === setId && t - S.lastSet.t < 15000)) {
        S.lastSet = { id: setId, t };
        net.send('eqSet', { id: setId }, { src: 'Napad', urgent: true });
      }
    }
    const r = await net.send('attackPlayer', { id: p.id }, {
      src: 'Napad',
      onResponse: (data) => {
        const sec = parseProtection(data);
        if (sec) {
          S.protectedUntil[p.id] = now() + sec * 1000;
          toast(`${p.nick}: ochrona ${sec} s — wstrzymuję ataki na niego`, 'warn', 2200);
        }
      },
    });
    if (!r.ok && !r.dry) S.backoff[p.id] = now() + 2000;
    if (why === 'key' && r.ok) toast(`⚔ Napad: ${p.nick} (${p.lvl})`, 'info', 1500);
    return r.ok;
  }

  function attackNearest() {
    if (game.inBattle()) return;
    const c = candidates(cfg.range, false);
    if (!c.length) { toast('Napad: brak celu w zasięgu', 'warn', 1500); return; }
    attack(c[0], 'key');
  }

  /* ── tryb AUTO: włączony w ustawieniach = działa od razu ── */
  function setAuto(on) {
    S.auto = !!on && cfg.enabled;
    clearInterval(S.timer);
    if (S.auto) S.timer = setInterval(autoTick, 250);
    indicator();
  }
  function autoTick() {
    if (!S.auto || !game.ready()) return;
    const t = now();
    const all = candidates(cfg.autoRange, true);
    S.target = all[0] || null;
    indicator();
    if (game.inBattle()) return;
    // ten sam cel nie częściej niż co 3 s (gdy atak się nie udał, nie męczymy serwera)
    const c = all.filter((p) => !(S.autoTried[p.id] > t - 3000));
    if (c.length && t - S.last >= Math.max(500, cfg.minInterval)) { S.autoTried[c[0].id] = t; attack(c[0], 'auto'); }
  }
  /** Wskaźnik: że AUTO działa + kto jest teraz celem w zasięgu. */
  function indicator() {
    let n = document.getElementById('mp-napad-ind');
    if (!S.auto || !cfg.showIndicator) { n && n.remove(); return; }
    if (!n) {
      const p = store.get('win:napad-ind', { x: innerWidth - 250, y: 70 });
      n = el('div', { id: 'mp-napad-ind', class: 'mp-glass', title: 'Kliknij, żeby wyłączyć AUTO', style: { position: 'fixed', zIndex: 2147482995, left: p.x + 'px', top: p.y + 'px', padding: '7px 12px', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '9px', cursor: 'pointer', border: '1px solid rgba(255,93,122,.55)', boxShadow: '0 0 18px rgba(255,93,122,.35)', minWidth: '190px' } });
      const moved = makeDraggable(n, n, (pos) => store.set('win:napad-ind', pos));
      n.addEventListener('click', () => { if (!moved()) { cfg.autoMode = false; config.save(); setAuto(false); toast('Napad AUTO wyłączony'); if (ui.panel) ui.renderMain(); } });
      document.body.appendChild(n);
    }
    const h = game.hero();
    const tg = S.target;
    const sig = tg ? tg.id + ':' + tg.x + ':' + tg.y : '-';
    if (n.dataset.sig === sig) return;
    n.dataset.sig = sig;
    n.innerHTML = '';
    n.append(el('div', { class: 'mp-tile', style: { width: '26px', height: '26px', borderRadius: '8px', background: grad(['#ff5d7a', '#b8325a']) } }, icon('napad', 15)),
      el('div', null,
        el('div', { style: { fontWeight: 800, fontSize: '12px', letterSpacing: '.5px' } }, 'NAPAD AUTO ', el('span', { class: 'mp-badc', style: { fontSize: '11px' } }, '● WŁĄCZONY')),
        el('div', { style: { fontSize: '11.5px', marginTop: '1px' } }, tg
          ? el('span', null, '🎯 ', el('b', { class: 'mp-badc' }, tg.nick), ` (${tg.lvl}${tg.prof}) · ${h ? game.dist(h, tg).toFixed(1) : '?'} kr.`)
          : el('span', { class: 'mp-dim' }, 'brak celu w zasięgu ' + cfg.autoRange + ' kr.'))));
  }
  function toggleAuto() {
    cfg.autoMode = !cfg.autoMode; config.save();
    setAuto(cfg.autoMode);
    toast(S.auto ? 'Napad AUTO: WŁĄCZONY' : 'Napad AUTO: wyłączony', S.auto ? 'bad' : 'ok');
    if (ui.panel) ui.renderMain();
  }

  defineAddon({
    id: 'napad', name: 'Napad', icon: 'napad', color: ['#ff5d7a', '#b8325a'], risk: 'auto',
    desc: 'Atak na najbliższego wroga pod klawisz (bez gonienia), opcja „Napad" po prawym kliknięciu na gracza, pamiętanie ochrony, zmiana zestawu i opcjonalny tryb AUTO.',
    defaults: {
      keyAttack: '', range: 2, minInterval: 1000, targetMode: 'enemies', lvlMin: 0, lvlMax: 0,
      targetList: [], neverList: [], skipProtected: true, menuEntry: true,
      switchSet: false, setByProf: { w: 0, p: 0, b: 0, m: 0, t: 0, h: 0 }, setOnlySingleEnemy: true,
      autoMode: false, autoKey: '', autoRange: 2, autoOnlyList: false, showIndicator: true,
    },
    keys: [
      { key: 'keyAttack', label: 'atak na najbliższego', fn: () => attackNearest() },
      { key: 'autoKey', label: 'włącz/wyłącz AUTO', fn: () => toggleAuto() },
    ],
    notes: (c) => [
      c.switchSet && !net.cmd('eqSet').t ? { type: 'warn', text: 'Zmiana zestawu wymaga podsłuchania komendy: przełącz zestaw ręcznie w grze, potem Diagnostyka → Podsłuch → „Zmiana zestawu".' } : null,
      c.autoMode ? { type: 'bad', text: 'Tryb AUTO atakuje bez Twojego kliknięcia — to automatyzacja, za którą najłatwiej o bana. Używasz na własne ryzyko. Gdy działa, na ekranie widać czerwony wskaźnik „NAPAD AUTO" z aktualnym celem (klik = wyłącz).' } : null,
    ],
    settings: [
      { group: 'Atak pod klawisz', key: 'keyAttack', type: 'key', label: 'Klawisz ataku', hint: 'Jedno naciśnięcie = jedna próba ataku na najbliższy cel.' },
      { group: 'Atak pod klawisz', key: 'range', type: 'number', label: 'Zasięg (kratki)', min: 0, max: 30, hint: '0 = cała mapa. Postać nie podchodzi do celu.' },
      { group: 'Atak pod klawisz', key: 'minInterval', type: 'number', label: 'Odstęp między atakami (ms)', min: 500, max: 10000 },
      { group: 'Atak pod klawisz', key: 'menuEntry', type: 'bool', label: 'Opcja „⚔ Napad" w menu gracza (prawy przycisk)' },
      { group: 'Cele', key: 'targetMode', type: 'select', label: 'Kogo atakować', options: [['enemies', 'Wszystkich poza klanem/znajomymi/sojuszem'], ['tagged', 'Tylko oznaczonych jako wróg + lista celów']] },
      { group: 'Cele', key: 'lvlMin', type: 'number', label: 'Poziom od', min: 0, max: 500, hint: '0 = bez limitu' },
      { group: 'Cele', key: 'lvlMax', type: 'number', label: 'Poziom do', min: 0, max: 500 },
      { group: 'Cele', key: 'targetList', type: 'list', label: 'Lista celów (priorytet)', placeholder: 'nick + Enter' },
      { group: 'Cele', key: 'neverList', type: 'list', label: 'Nigdy nie atakuj', placeholder: 'nick + Enter' },
      { group: 'Cele', key: 'skipProtected', type: 'bool', label: 'Nie marnuj ataków na graczy z ochroną', hint: 'Po komunikacie o ochronie panel czeka, aż minie.' },
      { group: 'Zestaw', key: 'switchSet', type: 'bool', label: 'Przełącz zestaw przed atakiem', rerender: true },
      { group: 'Zestaw', key: 'setByProf', type: 'custom', show: (c) => c.switchSet, render: (c, save) => {
        const grid = el('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 14px', padding: '6px 0' } });
        for (const [k, name] of Object.entries(game.PROF_NAMES)) {
          const sel = el('select', { class: 'mp-in' }, [[0, 'nie zmieniaj'], ...[1, 2, 3, 4, 5, 6].map((n) => [n, 'Zestaw ' + n])].map(([v, l]) => { const o = el('option', { value: v }, l); if (Number(c.setByProf[k]) === v) o.selected = true; return o; }));
          sel.onchange = () => { c.setByProf[k] = Number(sel.value); save(); };
          grid.appendChild(el('label', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' } }, el('span', null, name), sel));
        }
        return el('div', { class: 'mp-field', style: { flexDirection: 'column', alignItems: 'stretch' } }, el('div', { class: 'lb' }, 'Zestaw na profesję atakowanego'), grid);
      } },
      { group: 'Zestaw', key: 'setOnlySingleEnemy', type: 'bool', label: 'Tylko gdy na mapie jest 1 wróg', hint: 'Na ustawkach zestaw się nie zmienia.', show: (c) => c.switchSet },
      { group: 'Tryb AUTO', key: 'autoMode', type: 'bool', auto: true, label: 'Tryb AUTO — atakuj graczy wchodzących w zasięg', rerender: true, danger: true, countdown: 3,
        confirm: 'Tryb AUTO sam atakuje graczy, którzy wejdą w zasięg (według filtrów z sekcji „Cele"). To automatyzacja i może skończyć się banem. Działanie sygnalizuje czerwony wskaźnik z aktualnym celem.' },
      { group: 'Tryb AUTO', key: 'autoKey', type: 'key', label: 'Klawisz: włącz/wyłącz AUTO' },
      { group: 'Tryb AUTO', key: 'autoRange', type: 'number', label: 'Zasięg AUTO (kratki)', min: 1, max: 30, show: (c) => c.autoMode },
      { group: 'Tryb AUTO', key: 'autoOnlyList', type: 'bool', label: 'AUTO tylko na graczy z listy celów', hint: 'Wyłączone = każdy pasujący do filtrów „Cele".', show: (c) => c.autoMode },
      { group: 'Tryb AUTO', key: 'showIndicator', type: 'bool', label: 'Pokazuj wskaźnik „NAPAD AUTO"', show: (c) => c.autoMode },
    ],

    init(c) {
      cfg = c;
      menus.add('player', (id) => {
        if (!cfg.enabled || !cfg.menuEntry) return [];
        const p = game.otherById(id);
        if (!p || isFriendly(p)) return [];
        return [{ label: '⚔ Napad', fn: () => attack(game.otherById(id) || p, 'key') }];
      });
      bus.on('map:change', () => { S.protectedUntil = {}; S.backoff = {}; });
      MP.napad = { attack, candidates: (r) => candidates(r ?? cfg.range, false) };
      if (cfg.enabled && cfg.autoMode) setTimeout(() => setAuto(true), 1500);
    },
    onToggle(on) { setAuto(on && cfg.autoMode); },
    onChange(k) { if (k === 'autoMode') setAuto(cfg.autoMode); if (k === 'showIndicator') { const n = document.getElementById('mp-napad-ind'); n && n.remove(); indicator(); } },
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
 * Kliknięcie gracza → karta z informacjami i akcjami (EQ, Napad, zaproś, znajomi, Bratan…).
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
    const modeBtn = el('button', { class: 'mp-mini', title: cfg.minimal ? 'Pokaż filtry' : 'Tryb minimalny (sama lista)', onclick: () => { cfg.minimal = !cfg.minimal; config.save(); open(); } }, cfg.minimal ? '⚙ filtry' : '▭ minimalny');
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
        !isFriendly(p) ? btn('Napad', 'napad', () => MP.napad.attack(game.otherById(p.id) || p, 'key')) : null,
        btn('Zaproś', 'cook', () => net.send('partyInvite', { id: p.id }, { src: 'Kto tu jest?' }).then((r) => r.ok && toast(`Zaproszono ${p.nick}`, 'ok', 1500))),
        !p.isFriend ? btn('Znajomy', 'ktotu', () => net.send('friendAdd', { id: p.id, nick: p.nick }, { src: 'Kto tu jest?' }).then((r) => r.ok && toast(`Wysłano zaproszenie do znajomych: ${p.nick}`, 'ok', 1500)), 'Dodaj do znajomych') : null,
        btn(isProt ? 'Bratan ✓' : 'Bratan', 'bratan', () => togList(bcfg, 'nicks', p.nick, isProt), isProt ? 'Usuń z ochrony Bratana' : 'Chroń przed atakiem (Bratan)'),
        !isFriendly(p) ? btn(isTarget ? 'Cel ✓' : 'Cel', null, () => togList(ncfg, 'targetList', p.nick, isTarget), 'Lista celów Napadu') : null,
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
        el('span', { class: 'n', title: p.clanName ? `${p.nick} [${p.clanName}]` : p.nick }, `${p.nick} `, el('span', { class: 'mp-dim', style: { fontWeight: 400 } }, `(${p.lvl}${cfg.minimal ? p.prof : ''})`)),
        cls ? el('span', { class: 'tag ' + cls }, cfg.minimal ? tl[0].toUpperCase() : tl) : null,
        el('span', { class: 'mp-dim', style: { fontSize: '11px', width: '30px', textAlign: 'right' } }, p.d.toFixed(0)));
      row.addEventListener('mouseenter', (e) => MP.pokazEq && MP.pokazEq.show(p.id, e.clientX + 16, e.clientY));
      row.addEventListener('mouseleave', () => MP.pokazEq && MP.pokazEq.hide());
      listBox.appendChild(row);
      if (openId === p.id) listBox.appendChild(card(p));
    }
  }

  defineAddon({
    id: 'ktotu', name: 'Kto tu jest?', icon: 'ktotu', color: ['#3fa2ff', '#2a6fd6'],
    desc: 'Lista graczy na mapie z filtrami (nick, klan, poziom, profesja, relacja) i zapisywanymi zestawami. Tryb minimalny pokazuje samą listę po filtrach. Kliknij gracza, żeby zobaczyć jego kartę: EQ, Napad, zaproszenie do grupy i znajomych, Bratan.',
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
 * W oknie łupu pod każdym przedmiotem pokazuje szansę na złapanie przy biciu w grupie (≈ 1 / liczba chętnych).
 */
(() => {
  let cfg, obs = null, declined = new Set();

  function partyCount() {
    const ids = game.partyMembers();
    if (!ids.length) return 1;
    let n = ids.length;
    if (cfg.onlyOnMap) {
      const here = new Set(game.others().map((p) => p.id));
      const h = game.hero();
      n = ids.filter((id) => id === (h && h.id) || here.has(id)).length || 1;
    }
    return Math.max(1, n - declined.size);
  }

  function decorate() {
    const sel = cfg.lootSelector.split('\n').map((s) => s.trim()).filter(Boolean).join(',');
    if (!sel) return;
    const wins = $$(sel).filter(isVisible);
    document.querySelectorAll('.mp-ibadge.chance').forEach((b) => { if (!wins.some((w) => w.contains(b))) b.remove(); });
    if (!wins.length) return;
    const n = partyCount();
    const pct = Math.round(1000 / n) / 10;
    for (const w of wins) {
      for (const it of $$('.item', w)) {
        if (getComputedStyle(it).position === 'static') it.style.position = 'relative';
        let b = it.querySelector(':scope > .mp-ibadge.chance');
        if (!b) { b = el('div', { class: 'mp-ibadge chance' }); it.appendChild(b); }
        b.textContent = `${pct}%`;
        b.title = n === 1 ? 'Jesteś sam — przedmiot jest Twój' : `Przybliżenie: 1 / ${n} osób w grupie`;
      }
    }
  }

  defineAddon({
    id: 'ktozlapie', name: 'Kto złapie', icon: 'ktozlapie', color: ['#ffd84a', '#e0a400'],
    desc: 'Pod kafelkami łupu pokazuje Twoją szansę (%) na złapanie przedmiotu przy biciu w grupie.',
    defaults: { enabled: false, onlyOnMap: true, lootSelector: '.loot-wnd\n.loots-window\n.loot-window' },
    notes: () => [{ type: 'info', text: 'To przybliżenie: zakłada równą szansę dla wszystkich członków grupy (opcjonalnie tylko tych na tej samej mapie). Jeśli liczby się nie pojawiają, sprawdź selektor okna łupu (F12 → wskaż okno łupu).' }],
    settings: [
      { key: 'onlyOnMap', type: 'bool', label: 'Licz tylko członków grupy na tej samej mapie' },
      { key: 'lootSelector', type: 'textarea', label: 'Selektor okna łupu' },
    ],
    init(c) {
      cfg = c;
      const run = debounce(() => { if (cfg.enabled) decorate(); }, 120);
      obs = new MutationObserver(run);
      obs.observe(document.body, { childList: true, subtree: true });
      bus.on('battle:start', () => declined.clear());
    },
  });
})();

/* ───────── Let's Cook Together ─────────
 * Zaproszenia do grupy pod klawisz (znajomi / klan / sojusz / wszyscy na mapie), rozwiązanie grupy pod klawisz,
 * opcjonalnie automatyczne zapraszanie nowych osób na mapie (AUTOMAT, domyślnie wyłączony).
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

  function inviteAll(src = 'Cook') {
    const cool = src === 'auto' ? 10 * 60000 : 30000; // automat nie męczy tej samej osoby częściej niż co 10 min
    const l = eligible().filter((p) => !(invited[p.id] > now() - cool));
    const room = Math.max(0, cfg.maxParty - Math.max(1, game.partyMembers().length));
    const pick = l.slice(0, room || l.length);
    if (!pick.length) { if (src === 'Cook') toast('Let\'s Cook: nikogo do zaproszenia', 'warn', 1600); return; }
    pick.forEach((p) => { invited[p.id] = now(); net.send('partyInvite', { id: p.id }, { src: 'Let\'s Cook' }); });
    toast(`Let's Cook: zapraszam ${pick.length} os.`, 'ok', 1800);
  }

  async function disband() {
    if (!game.partyMembers().length) { toast('Nie masz grupy', 'warn', 1500); return; }
    await net.send('partyDisband', {}, { src: 'Let\'s Cook' });
    toast('Rozwiązuję grupę', 'ok', 1500);
  }
  MP.cook = { disband };

  defineAddon({
    id: 'cook', name: 'Let\'s Cook Together', icon: 'cook', color: ['#ff8a5c', '#e2533a'], risk: 'auto',
    desc: 'Zaproszenia do grupy pod klawisz dla znajomych, klanowiczów, sojuszników albo wszystkich na mapie oraz rozwiązanie grupy pod klawisz.',
    defaults: { keyInvite: '', keyDisband: '', friends: true, clan: true, allies: false, everyone: false, always: [], never: [], range: 0, maxParty: 10, auto: false },
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
      { group: 'Automat', key: 'auto', type: 'bool', auto: true, label: 'Automatycznie zapraszaj, gdy ktoś pasujący pojawi się na mapie', confirm: 'To automatyzacja — zaproszenia będą wysyłane bez Twojego kliknięcia. Na własne ryzyko.', countdown: 2 },
    ],
    render(box) {
      box.appendChild(el('div', { class: 'mp-btns' },
        el('button', { class: 'mp-btn pri', onclick: () => inviteAll() }, 'Zaproś teraz'),
        el('button', { class: 'mp-btn', onclick: () => disband() }, 'Rozwiąż grupę')));
    },
    init(c) {
      cfg = c;
      setInterval(() => { if (cfg.enabled && cfg.auto && game.ready() && !game.inBattle()) inviteAll('auto'); }, 3000);
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
 * Najechanie na gracza (na mapie albo w „Kto tu jest?") → jego ekwipunek + podsumowanie bonusów legendarnych.
 * Dane pobieramy tą samą funkcją co „Pokaż ekwipunek" w grze (okno gry jest na ten czas niewidoczne).
 */
(() => {
  let cfg, cache = {}, tip = null, hoverId = null, lastReq = 0;
  let busy = false, wanted = null;       // jeśli w trakcie pobierania najedziesz na innego gracza — pobierzemy jego zaraz potem

  function hide() { hoverId = null; wanted = null; if (tip) tip.style.display = 'none'; }

  async function fetchRaw(id) {
    const raw = game.otherRaw(id);
    if (!raw || typeof raw.showEq !== 'function') return null;
    const hideCss = el('style', null, '.showeq-window{visibility:hidden!important;pointer-events:none!important}');
    const already = $$('.showeq-window');
    document.head.appendChild(hideCss);
    let items = null;
    try {
      raw.showEq();
      const t0 = now();
      let w = null;
      while (now() - t0 < 3000) {
        await sleep(60);
        w = $$('.showeq-window').find((n) => !already.includes(n) && n.querySelector('[class*="-showeq"]'));
        if (w) { await sleep(80); break; }
      }
      if (w) {
        const ids = $$('[class*="item-id-"]', w).map((n) => { const m = String(n.className).match(/item-id-(\d+)-showeq/); return m ? Number(m[1]) : null; }).filter(Boolean);
        items = ids.map((iid) => { let it = null; try { it = E().items.getItemById(iid); } catch {} return it ? game.normItem(it) : null; }).filter(Boolean);
        const close = w.querySelector('.close-button, [class*="close-button"], .close, [class*="close"]');
        if (close) close.click(); else w.remove();
      }
    } catch (e) { console.warn('[laddonz] showEq', e); }
    finally { setTimeout(() => hideCss.remove(), 150); }
    return items;
  }

  async function fetchEq(id) {
    const c = cache[id];
    if (c && now() - c.t < cfg.cacheSec * 1000) return c.items;
    if (busy) { wanted = id; return 'wait'; }
    const gap = 700 - (now() - lastReq);            // nie częściej niż ~1,5 zapytania na sekundę
    if (gap > 0) await sleep(gap);
    if (hoverId !== id) return 'stale';
    busy = true; lastReq = now();
    let items = null;
    try { items = await fetchRaw(id); } finally { busy = false; }
    if (items) cache[id] = { t: now(), items };
    if (wanted && wanted !== id && hoverId === wanted) { const w = wanted; wanted = null; setTimeout(() => render(w), 0); }
    return items;
  }

  function place(x, y) {
    tip.style.left = clamp(x, 4, innerWidth - 300) + 'px';
    tip.style.top = clamp(y, 4, innerHeight - 280) + 'px';
  }

  async function render(id) {
    const p = game.otherById(id);
    tip.innerHTML = '';
    tip.appendChild(el('div', { style: { fontWeight: 700 } }, p ? `${p.nick} (${p.lvl}${p.prof})` : '#' + id, p && p.clanName ? el('span', { class: 'mp-dim', style: { fontWeight: 400 } }, ` [${p.clanName}]`) : null));
    const loading = el('div', { class: 'mp-dim' }, 'Wczytuję ekwipunek…');
    tip.appendChild(loading);
    const items = await fetchEq(id);
    if (hoverId !== id || items === 'wait' || items === 'stale') return;
    loading.remove();
    if (!items) { tip.appendChild(el('div', { class: 'mp-warnc' }, 'Nie udało się pobrać — spróbuj za chwilę.')); return; }
    if (!items.length) { tip.appendChild(el('div', { class: 'mp-dim' }, 'Brak przedmiotów.')); return; }
    const grid = el('div', { class: 'mp-eqgrid' }, items.slice(0, 18).map((it) => el('div', { class: 'mp-eqcell ' + it.rarity, title: `${it.name} (${it.rarity})` },
      el('img', { src: game.iconUrl(it.icon), alt: '' }), it.legbon ? el('div', { class: 'mp-ibadge bon' }, MP.legAbbr(it.legbon)) : null)));
    const sum = {};
    items.forEach((i) => { if (i.legbon) sum[i.legbon] = (sum[i.legbon] || 0) + 1; });
    tip.append(grid, el('div', { style: { fontSize: '12px' } },
      el('div', null, 'Legendy: ', el('b', null, String(items.filter((i) => i.rarity === 'legendary').length)), ' · Heroiki: ', el('b', null, String(items.filter((i) => i.rarity === 'heroic').length))),
      Object.keys(sum).length ? el('div', { style: { marginTop: '4px', display: 'flex', flexWrap: 'wrap', gap: '4px' } }, Object.entries(sum).map(([k, n]) => el('span', { class: 'mp-chip', style: { padding: '2px 8px' }, title: MP.legName(k) }, `${MP.legAbbr(k)} ×${n}`))) : el('div', { class: 'mp-dim' }, 'Brak bonusów legendarnych')));
  }

  function show(id, x, y, force) {
    if (!cfg.enabled && !force) return;
    if (!tip) { tip = el('div', { id: 'mp-eqtip', class: 'mp-glass' }); document.body.appendChild(tip); }
    place(x, y);
    tip.style.display = 'block';
    if (hoverId === id) return;          // ten sam gracz — tylko przesuwamy
    hoverId = id;
    render(id);
  }

  /*
   * Mapa: gra pokazuje własny dymek z nickiem gracza (.tip-wrapper.normal-tip — sprawdzone diagnostyką).
   * Gdy dymek z nickiem się pojawi → pokazujemy EQ; gdy zniknie albo zmieni się gracz → chowamy/podmieniamy.
   * Dodatkowo hak na onhover gracza, jeśli gra go wywołuje.
   */
  function watchHover() {
    let mx = 0, my = 0, shift = false, mapShown = false;
    document.addEventListener('mousemove', (e) => {
      mx = e.clientX; my = e.clientY; shift = e.shiftKey;
      if (tip && tip.style.display === 'block' && mapShown) place(mx + 18, my + 14);
    }, true);
    const fromMap = (id) => {
      if (!cfg.enabled || !cfg.mapHover) return;
      if (cfg.needShift && !shift) return;
      mapShown = true;
      show(id, mx + 18, my + 14);
    };
    const check = () => {
      if (!cfg.enabled || !cfg.mapHover) return;
      if (document.querySelector('.mp-prow:hover, .mp-pcard:hover')) return;   // obsługuje lista
      const tipSel = (cfg.tipSelector || '').split('\n').map((s) => s.trim()).filter(Boolean).join(',');
      const t = tipSel && $$(tipSel).find((n) => isVisible(n) && !n.closest('.mp-glass'));
      const txt = t ? t.textContent.toLowerCase() : '';
      const p = txt && game.others().find((o) => o.nick && txt.includes(o.nick.toLowerCase()));
      if (p) fromMap(p.id);
      else if (mapShown) { mapShown = false; hide(); }
    };
    new MutationObserver(debounce(check, 60)).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class'] });
    setInterval(check, 400);
  }

  MP.pokazEq = {
    show: (id, x, y) => (cfg.enabled && cfg.listHover ? show(id, x, y) : null),
    showForce: (id, x, y) => { show(id, x, y, true); setTimeout(() => document.addEventListener('mousedown', hide, { once: true, capture: true }), 50); },
    hide,
  };

  defineAddon({
    id: 'pokazeq', name: 'Pokaż EQ', icon: 'pokazeq', color: ['#b48cff', '#7c5cff'],
    desc: 'Po najechaniu na gracza (na mapie albo w „Kto tu jest?") pokazuje jego ekwipunek, a na dole podsumowanie bonusów legendarnych.',
    defaults: { enabled: false, mapHover: true, listHover: true, needShift: false, cacheSec: 120, tipSelector: '.tip-wrapper.normal-tip' },
    notes: () => [{ type: 'info', text: 'Podgląd korzysta z tej samej funkcji co „Pokaż ekwipunek" w grze, więc pierwszy podgląd danego gracza trwa tyle, ile odpowiedź serwera. Kolejne przez 2 minuty są natychmiastowe.' }],
    settings: [
      { key: 'mapHover', type: 'bool', label: 'Najechanie na gracza na mapie' },
      { key: 'listHover', type: 'bool', label: 'Najechanie na gracza w „Kto tu jest?"' },
      { key: 'needShift', type: 'bool', label: 'Na mapie tylko z wciśniętym Shift' },
      { key: 'cacheSec', type: 'number', label: 'Pamiętaj wynik przez (s)', min: 10, max: 1800 },
      { key: 'tipSelector', type: 'text', label: 'Selektor dymka gracza w grze', hint: 'Domyślnie .tip-wrapper.normal-tip' },
    ],
    init(c) {
      cfg = c;
      // migracja ustawień z wcześniejszych wersji
      if (!c._v12) { c._v12 = true; c.needShift = false; c.tipSelector = '.tip-wrapper.normal-tip'; config.save(); }
      watchHover();
    },
    onToggle(on) { if (!on) hide(); },
  });
})();

// ═══ src/addons/auto_items.js ═══
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
    defaults: { key: '', auto: true, queue: [], partySelector: '.widget-party\n[class*="widget-party"]\n.party-icon' },
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
      if (!/widget-party/.test(cfg.partySelector || '')) { cfg.partySelector = '.widget-party\n[class*="widget-party"]\n' + (cfg.partySelector || ''); config.save(); }
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

// ═══ src/main.js ═══
/* ───────────────────────── main.js ─────────────────────────
 * Start: czekamy aż gra się wczyta, potem uruchamiamy panel.
 */
(async function boot() {
  if (W.__MargoPanelStarted) return;
  W.__MargoPanelStarted = true;
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

MP.version = "1.4.0";
})();
