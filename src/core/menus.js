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
    // 1) prawy klik na przedmiocie w DOM
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
    const tick = setInterval(() => {
      this.hookPopup();
      this.hookOthers();
      if (this.hooked && this.otherHooked) clearInterval(tick);
    }, 1500);
  },

  hookPopup() {
    if (this.hooked) return;
    const I = E() && E().interface;
    if (!I || typeof I.showPopupMenu !== 'function') return;
    const orig = I.showPopupMenu;
    const self = this;
    I.showPopupMenu = function (menu, ...rest) {
      try {
        if (Array.isArray(menu)) {
          let tgt = self.last && now() - self.last.t < 700 ? self.last : null;
          if (!tgt) tgt = self.guessPlayerFromMenu(menu);
          if (tgt) {
            const add = self.entriesFor(tgt.type, tgt.id);
            add.forEach((x) => menu.push(self.toGameEntry(menu, x)));
          }
        }
      } catch (e) { console.warn('[laddonz] menu', e); }
      return orig.call(this, menu, ...rest);
    };
    this.hooked = true;
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

  /** Owijamy metody „menu" w prototypie innych graczy, żeby znać cel kliknięcia. */
  hookOthers() {
    if (this.otherHooked) return;
    try {
      const sample = game.others()[0];
      if (!sample || !sample.raw) return;
      const proto = Object.getPrototypeOf(sample.raw);
      if (!proto || proto.__mpMenu) { this.otherHooked = !!proto; return; }
      const self = this;
      let n = 0;
      for (const name of Object.getOwnPropertyNames(proto)) {
        if (!/menu|click|context/i.test(name)) continue;
        const d = Object.getOwnPropertyDescriptor(proto, name);
        if (!d || typeof d.value !== 'function') continue;
        const orig = d.value;
        proto[name] = function (...a) {
          try { const id = this.d && this.d.id; if (id) self.setLast('player', id); } catch {}
          return orig.apply(this, a);
        };
        n++;
      }
      proto.__mpMenu = true;
      this.otherHooked = n > 0;
    } catch {}
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
