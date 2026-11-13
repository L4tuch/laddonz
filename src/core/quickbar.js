/* ───────────────────────── quickbar.js ─────────────────────────
 * Pasek skrótów dodatków (domyślnie po prawej, przy ramce obok ekwipunku).
 *   • lewy klik  → szybkie okno ustawień tego dodatku
 *   • prawy klik → włącz / wyłącz dodatek
 * Pasek ma stałe miejsce wybierane w Ustawieniach (domyślnie po lewej od ekwipunku, w pionie) — nie da się go przeciągnąć.
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
  /** Na pasku: wybrane dodatki. Gdy nic nie wybrano — wszystkie włączone (żeby pasek nie był pusty po włączeniu skrótów). */
  enabledList() {
    const order = this.pinned();
    if (!order.length) return addons.list.filter((a) => a.id !== 'motywnik' && addons.on(a.id));
    return addons.list.filter((a) => order.includes(a.id));
  },

  layout() { const q = config.data.global.quickbar || {}; return ['pgp', 'lgp', 'lgh', 'ldh'].includes(q.layout) ? q.layout : 'pgp'; },
  /** Obszar mapy między kolumnami interfejsu gry. */
  area() {
    const vis = (sel, col) => [...document.querySelectorAll(sel)].map((n) => n.getBoundingClientRect()).find((r) => (col ? r.width > 20 && r.height > 50 : r.width > 200 && r.height > 8));
    const L = vis('.left-column.main-column', 1), R = vis('.right-column.main-column', 1);
    // górna / dolna belka: najniższa / najwyższa granica ze wszystkich pasujących elementów, zapamiętana do zmiany rozmiaru okna —
    // w trakcie i po walce gra potrafi chwilowo powiększyć belkę i pasek „zjeżdżał" w dół
    const rects = (sel) => [...document.querySelectorAll(sel)].map((n) => n.getBoundingClientRect()).filter((r) => r.width > 200 && r.height > 8);
    const tops = rects('.top.positioner').map((r) => r.bottom).filter((b) => b > 0 && b < innerHeight / 3);
    const bots = rects('.bottom.positioner').map((r) => r.top).filter((t) => t > innerHeight / 2 && t < innerHeight);
    let t = tops.length ? Math.min(...tops) : 0, b = bots.length ? Math.max(...bots) : innerHeight;
    const k = innerWidth + 'x' + innerHeight;
    if (this._areaKey !== k) { this._areaKey = k; this._t = null; this._b = null; }
    // zmiana w „gorszą" stronę przyjmowana dopiero, gdy utrzyma się dłużej niż minutę (chwilowe zmiany w walce ignorujemy)
    const T0 = Date.now();
    if (tops.length) {
      if (this._t == null || t <= this._t) { this._t = t; this._tUp = 0; }
      else if (!this._tUp) this._tUp = T0;
      else if (T0 - this._tUp > 60000) { this._t = t; this._tUp = 0; }
    }
    if (bots.length) {
      if (this._b == null || b >= this._b) { this._b = b; this._bDn = 0; }
      else if (!this._bDn) this._bDn = T0;
      else if (T0 - this._bDn > 60000) { this._b = b; this._bDn = 0; }
    }
    if (this._t != null) t = this._t;
    if (this._b != null) b = this._b;
    return { l: L ? L.right : 0, r: R ? R.left : innerWidth, t, b };
  },
  place() {
    if (!this.bar) return;
    const lay = this.layout(), A = this.area(), w = this.bar.offsetWidth || 36, h = this.bar.offsetHeight || 200, m = 8;
    this.bar.classList.toggle('hz', lay === 'lgh' || lay === 'ldh');
    let x, y;
    if (lay === 'pgp') { x = A.r - w - m; y = A.t + m; }
    else if (lay === 'lgp') { x = A.l + m; y = A.t + m; }
    else if (lay === 'lgh') { x = A.l + m; y = A.t + m; }
    else { x = A.l + m; y = A.b - h - m; }
    this.bar.style.left = Math.round(clamp(x, 0, innerWidth - w)) + 'px';
    this.bar.style.top = Math.round(clamp(y, 0, Math.max(0, innerHeight - h))) + 'px';
  },

  draw() {
    const q = (config.data.global.quickbar = config.data.global.quickbar || { show: true, pinned: [] });
    if (!Array.isArray(q.pinned)) q.pinned = [];
    if (q.show === undefined) q.show = true;
    if (!q.show || !this.enabledList().length) { this.bar && this.bar.remove(); this.bar = null; return; }
    if (!this.bar) {
      this.bar = el('div', { id: 'mp-qbar' });
      document.body.appendChild(this.bar);
      if (!this._iv) this._iv = setInterval(() => this.place(), 1500);   // gra przebudowuje interfejs — pilnujemy miejsca
    }
    this.bar.innerHTML = '';
    for (const a of this.enabledList()) {
      const on = addons.on(a.id);
      const t = el('div', { class: 'mp-qtile' + (on ? ' on' : ' off') + (this.popId === a.id ? ' sel' : ''), 'data-name': `${a.name} — ${on ? 'włączony' : 'wyłączony'}` }, icon(a.icon, 15));
      t.addEventListener('click', (e) => { e.stopPropagation(); if (on && typeof a.quick === 'function') { try { a.quick(); } catch (err) { console.warn('[L4Tools]', err); } return; } this.openPop(a.id, t); });
      t.addEventListener('contextmenu', async (e) => {
        e.preventDefault(); e.stopPropagation();
        const v = !addons.on(a.id);
        const ok = await ui.toggleAddon(a, v, null);
        if (ok !== false) toast(`${a.name}: ${v ? 'włączony' : 'wyłączony'}`);
        if (this.popId === a.id) this.openPop(a.id, null, true);
      });
      this.bar.appendChild(t);
    }
    this.bar.dataset.lay = this.layout();
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
      el('div', { class: 'l4-ico', style: { width: '30px', height: '30px' } }, icon(a.icon, 17)),
      el('div', { style: { flex: 1, minWidth: 0 } }, el('div', { class: 'mp-title', style: { fontSize: '14px' } }, a.name), el('div', { class: 'mp-sub' }, cfg.enabled ? 'włączony' : 'wyłączony')),
      sw,
      el('button', { class: 'mp-x', title: 'Usuń ze skrótów', onclick: () => { this.togglePin(id); this.closePop(); } }, icon('pin', 15)),
      el('button', { class: 'mp-x', title: 'Otwórz w pełnym panelu', onclick: () => { this.closePop(); ui.open(id); } }, icon('grid', 15)),
      el('button', { class: 'mp-x', title: 'Zamknij', onclick: () => this.closePop() }, icon('close', 16)));
    const body = el('div', { class: 'mp-qbody' });
    P.append(head, body);
    ui.renderAddon(body, id, () => this.openPop(id, null, true), true);
    body.scrollTop = st;
    // pozycja: obok paska, po stronie, gdzie jest miejsce
    if (this.bar) {
      const r = this.bar.getBoundingClientRect(), w = 360, lay = this.layout();
      const h = Math.min(P.scrollHeight, innerHeight * 0.78);
      if (lay === 'lgh' || lay === 'ldh') {
        const ar = anchor ? anchor.getBoundingClientRect() : r;
        P.style.left = clamp(ar.left - 10, 8, innerWidth - w - 8) + 'px';
        P.style.top = (lay === 'lgh' ? Math.min(r.bottom + 8, innerHeight - h - 8) : Math.max(8, r.top - h - 8)) + 'px';
      } else {
        P.style.left = (lay === 'pgp' ? Math.max(8, r.left - w - 8) : Math.min(innerWidth - w - 8, r.right + 8)) + 'px';
        const want = clamp(anchor ? anchor.getBoundingClientRect().top - 20 : (parseFloat(P.style.top) || r.top), 8, innerHeight - 200);
        P.style.top = Math.max(8, Math.min(want, innerHeight - h - 8)) + 'px';
      }
    }
    this.draw();
  },

  closePop() { this.pop && this.pop.remove(); this.pop = null; this.popId = null; this.draw(); },
};

MP.quickbar = quickbar;
