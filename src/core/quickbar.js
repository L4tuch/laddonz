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

  /**
   * Dymki przedmiotów z gry zawsze nad paskiem skrótów i kafelkiem L4Tools (wcześniej pasek zasłaniał dymek).
   * 1) podnosimy dymek (i jego warstwę, jeśli ma własny z-index),
   * 2) gdy mimo to pasek dalej jest na wierzchu (dymek siedzi w warstwie gry), „wycinamy" z paska dokładnie
   *    miejsce pod dymkiem — wygląda to tak, jakby dymek zasłaniał pasek, a reszta paska zostaje widoczna.
   */
  liftTips() {
    const TOP = '2147483080';
    const OURS = ['#mp-qbar', '#mp-launcher', '#mp-qc'];
    let needCut = false;
    const ours = () => OURS.map((q) => document.querySelector(q)).filter(Boolean);
    const uncut = (n) => { if (n.__mpCut) { n.__mpCut = false; n.__mpCutV = ''; n.style.removeProperty('clip-path'); } };
    const inter = (a, b) => {
      const x1 = Math.max(a.left, b.left), x2 = Math.min(a.right, b.right), y1 = Math.max(a.top, b.top), y2 = Math.min(a.bottom, b.bottom);
      return x2 > x1 && y2 > y1 ? { x1, x2, y1, y2 } : null;
    };
    /** Wycina z paska podane prostokąty (dymek, panel statystyk…) — wygląda, jakby to one leżały na pasku. */
    const cutMany = (n, rects) => {
      const r = n.getBoundingClientRect();
      const holes = rects.map((tr) => inter(tr, r)).filter(Boolean);
      if (!holes.length) { uncut(n); return; }
      const W0 = -12, H0 = -12, W1 = r.width + 12, H1 = r.height + 12;
      const P = (x, y) => `${x.toFixed(1)}px ${y.toFixed(1)}px`;
      let v = `polygon(evenodd, ${P(W0, H0)}, ${P(W1, H0)}, ${P(W1, H1)}, ${P(W0, H1)}, ${P(W0, H0)}`;
      for (const i of holes) {
        const a = i.x1 - r.left, b = i.y1 - r.top, c = i.x2 - r.left, d = i.y2 - r.top;
        v += `, ${P(a, b)}, ${P(c, b)}, ${P(c, d)}, ${P(a, d)}, ${P(a, b)}, ${P(W0, H0)}`;
      }
      v += ')';
      if (n.__mpCutV === v) return;
      n.__mpCut = true; n.__mpCutV = v; n.style.setProperty('clip-path', v, 'important');
    };
    /*
     * Rozwinięty panel statystyk postaci (wiersze .stat-row) — ma być NAD paskiem skrótów.
     * Bierzemy przewijany kontener tych wierszy (a gdy go brak — ich rodzica).
     */
    const statsRects = () => {
      const out = [], seen = new Set();
      for (const row of document.querySelectorAll('.stat-row')) {
        if (row.closest('.mp-glass, #mp-qbar') || !isVisible(row)) continue;
        let box = null;
        for (let a = row.parentElement, k = 0; a && a !== document.body && k < 8; a = a.parentElement, k++) {
          const cs = getComputedStyle(a);
          if (/(auto|scroll)/.test(cs.overflowY) || /scroll-pane|scroll-wrapper/.test(a.className || '')) { box = a; break; }
        }
        box = box || row.parentElement;
        if (!box || seen.has(box)) continue;
        seen.add(box);
        const r = box.getBoundingClientRect();
        if (r.width > 0 && r.height > 0 && r.width < innerWidth * 0.6) out.push(r);
      }
      return out;
    };
    const lift = () => {
      const tips = Array.from(document.querySelectorAll('.tip-wrapper')).filter((t) => !t.closest('#mp-eqtip, .mp-host, .mp-glass') && isVisible(t));
      const holes = statsRects();
      if (tips.length) {
        const t = tips[tips.length - 1];
        if (t.style.zIndex !== TOP) t.style.setProperty('z-index', TOP, 'important');
        for (let a = t.parentElement; a && a !== document.body; a = a.parentElement) {
          if (a.classList.contains('c-window')) break;
          const cs = getComputedStyle(a);
          if (cs.position !== 'static' && cs.zIndex !== 'auto') { if (!a.querySelector('canvas') && !a.__mpLift) { a.__mpLift = true; a.style.setProperty('z-index', TOP, 'important'); } break; }
        }
        const tr = t.getBoundingClientRect();
        for (const n of ours()) {
          if (needCut) break;
          const i = inter(tr, n.getBoundingClientRect());
          if (!i) continue;
          const top = document.elementFromPoint((i.x1 + i.x2) / 2, (i.y1 + i.y2) / 2);
          if (top && n.contains(top)) needCut = true;
        }
        if (needCut) holes.push(tr);
      }
      for (const n of ours()) { if (holes.length) cutMany(n, holes); else uncut(n); }
    };
    let q = false;
    const kick = () => { if (q) return; q = true; requestAnimationFrame(() => { q = false; lift(); }); };
    const later = () => { kick(); setTimeout(kick, 60); setTimeout(kick, 250); };
    document.addEventListener('mouseover', later, true);
    document.addEventListener('mouseout', () => setTimeout(kick, 120), true);
    document.addEventListener('mousemove', () => { if (document.querySelector('.tip-wrapper')) kick(); }, true);
    document.addEventListener('click', () => { kick(); setTimeout(kick, 150); setTimeout(kick, 400); }, true);   // np. „Rozwiń” statystyk
    setInterval(kick, 500);
  },
  start() {
    this.liftTips();
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
