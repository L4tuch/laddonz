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
        } catch (e) { console.warn('[L4Scripts] menu', e); }
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
