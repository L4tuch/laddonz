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
  /*
   * Dane postaci (cele, przedmioty, kolejki, filtry…) — zawsze osobno dla każdej postaci, także gdy ustawienia są
   * „wspólne dla wszystkich postaci". Wspólne są tylko: włączone dodatki, przypisane klawisze i opcje.
   * Dodatek wskazuje takie pola w `charKeys`; trzymamy je pod kluczem priv:<świat>:<postać>.
   */
  priv: {},
  privKey: 'priv:global',
  privMigrate: false,
  charKeys: {},
  load(charName) {
    this.charName = charName || null;
    const g = store.get('cfg:global', null);
    const perChar = g?.global?.perCharacter !== false;
    this.key = perChar && charName ? `cfg:${this.worldName()}:${charName}` : 'cfg:global';
    const raw = store.get(this.key, null) || g || {};
    this.data = deepMerge(structuredClone(this.defaults), raw);
    this.privKey = charName ? `priv:${this.worldName()}:${charName}` : 'priv:global';
    const pv = store.get(this.privKey, null);
    // pierwszy raz po aktualizacji: przy osobnych ustawieniach każda postać zachowuje swoje dane; przy wspólnych —
    // dotychczasowe dane (np. przedmioty w Ulepszarce) dostaje tylko pierwsza postać, na którą wejdziesz, reszta zaczyna czysto
    this.privMigrate = !pv && (this.key !== 'cfg:global' || !store.get('priv:sharedTaken', false));
    if (!pv && this.key === 'cfg:global') store.set('priv:sharedTaken', true);
    this.priv = pv || {};
    return this.data;
  },
  /** Kopia ustawień bez danych postaci (do zapisu wspólnego / kopiowania na inne postacie). */
  shared() {
    const out = JSON.parse(JSON.stringify(this.data));
    for (const [id, ks] of Object.entries(this.charKeys)) { const a = out.addons && out.addons[id]; if (a) ks.forEach((k) => delete a[k]); }
    return out;
  },
  savePriv() {
    for (const [id, ks] of Object.entries(this.charKeys)) {
      const a = this.data.addons[id]; if (!a) continue;
      const o = {}; ks.forEach((k) => { if (k in a) o[k] = a[k]; });
      this.priv[id] = o;
    }
    store.set(this.privKey, this.priv);
  },

  save() {
    if (!this.data) return;
    this.savePriv();
    store.set(this.key, this.shared());
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
    if (!on) store.set('cfg:global', this.shared());   // wspólne: ustawienia w jednym miejscu (bez danych postaci)
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
    const g = this.shared();   // bez danych postaci — cele, przedmioty i filtry zostają przy swoich postaciach
    for (const c of list) store.set(c.key, g);
    store.set('cfg:global', g);
    return list.length;
  },

  addon(id, defaults, charKeys) {
    const a = (this.data.addons[id] = deepMerge(structuredClone(defaults || {}), this.data.addons[id] || {}));
    if (charKeys && charKeys.length) {
      this.charKeys[id] = charKeys.slice();
      const p = this.priv[id];
      for (const k of charKeys) {
        if (p && k in p) a[k] = structuredClone(p[k]);
        else if (!this.privMigrate) { if (defaults && k in defaults) a[k] = structuredClone(defaults[k]); else delete a[k]; }
      }
    }
    return a;
  },

  export() { return JSON.stringify(this.data, null, 2); },
  import(json) {
    const obj = JSON.parse(json);
    if (!obj || typeof obj !== 'object' || !obj.addons) throw new Error('To nie wygląda na plik konfiguracji L4Tools.');
    this.data = deepMerge(structuredClone(this.defaults), obj);
    this.save();
  },
  reset() { store.del(this.key); store.del(this.privKey); },
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
