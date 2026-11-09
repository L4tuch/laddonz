/* ───────────────────────── game.js ─────────────────────────
 * ADAPTER GRY (nowy interfejs). To JEDYNE miejsce, które dotyka wnętrzności gry
 * (window.Engine, window._g). Jeśli Garmory coś zmieni, poprawiasz tylko ten plik.
 *
 * Każda funkcja jest „defensywna": przy braku danych zwraca pustą wartość, nigdy nie rzuca.
 * Zakładka „Diagnostyka" w panelu pokazuje, które z tych punktów zaczepienia działają.
 */
const E = () => W.Engine;

const PROF_NAMES = { w: 'Wojownik', p: 'Paladyn', b: 'Tancerz ostrzy', m: 'Mag', t: 'Tropiciel', h: 'Łowca' };

// Kody relacji w NI (pole d.relation u innych graczy). Gdyby gra zmieniła kody, popraw tutaj.
const REL = {
  friend: ['fr'],
  clan: ['cl'],
  ally: ['cl-fr', 'fr-cl', 'clfr', 'ally'],
  enemy: ['en', 'cl-en', 'en-cl'],
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
  const rel = String(d.relation || '');
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
        if (typeof b.isShow === 'function') return !!b.isShow();
        if ('show' in b) return !!b.show;
        if ('isBattle' in b) return !!b.isBattle;
      }
    } catch {}
    const w = document.querySelector('.battle-controller, .battle-window, #battle');
    return !!(w && isVisible(w));
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
