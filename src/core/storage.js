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
      minInterval: 200 + Math.floor(Math.random() * 151), // losowo 200–350 ms
      panelKey: 'F8',       // skrót otwierający panel
      launcher: { x: 16, y: 120 },
      panelPos: null,
      accent: '#7c5cff',
      glass: 0.9,          // przezroczystość tła panelu
      menuSelector: '.popup-menu\n.menu-wrapper\n[class*="popup-menu"]\n[class*="context-menu"]', // menu prawego przycisku gry (zapas)
    },
    commands: {},           // nadpisania szablonów komend (patrz net.js)
    addons: {},
  },

  worldName() {
    const h = location.hostname.split('.')[0];
    return h || 'world';
  },

  charName: null,
  load(charName) {
    this.charName = charName || null;
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

  /** Przełączenie trybu zapisu od razu (bez odświeżania): wspólne dla wszystkich postaci albo osobne dla każdej. */
  setPerCharacter(on) {
    if (!this.data) return;
    this.data.global.perCharacter = !!on;
    this.key = on && this.charName ? `cfg:${this.worldName()}:${this.charName}` : 'cfg:global';
    this.save();
    if (!on) store.set('cfg:global', this.data);   // wspólne: pełne ustawienia w jednym miejscu
  },
  /** Lista postaci, które mają zapisane własne ustawienia (świat:postać). */
  savedCharacters() {
    const out = [];
    try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); const m = k && k.match(/^mp:cfg:([^:]+):(.+)$/); if (m) out.push({ key: k.slice(store.PREFIX.length), world: m[1], name: m[2] }); } } catch {}
    return out;
  },
  /** Te same ustawienia dla wszystkich postaci: kopiujemy obecne do każdej zapisanej postaci i do ustawień wspólnych. */
  copyToAll() {
    const list = this.savedCharacters();
    for (const c of list) store.set(c.key, this.data);
    const g = JSON.parse(JSON.stringify(this.data)); store.set('cfg:global', g);
    return list.length;
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
