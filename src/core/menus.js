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
    this.hookOthers();
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
