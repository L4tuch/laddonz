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

  enabledList() {
    const q = config.data.global.quickbar || {};
    return addons.list.filter((a) => !(q.hidden || []).includes(a.id));
  },

  defaultPos() {
    // spróbuj przykleić się do lewej krawędzi prawej kolumny interfejsu (okolice ekwipunku)
    const cands = ['.right-column', '.right-main-column', '.interface-layer .right', '.bags-navigation', '.inventory-layer', '.right-container'];
    for (const s of cands) {
      const n = document.querySelector(s);
      if (n && isVisible(n)) { const r = n.getBoundingClientRect(); return { x: Math.max(0, r.left - 34), y: Math.max(60, r.top + 40) }; }
    }
    return { x: innerWidth - 40, y: Math.round(innerHeight * 0.25) };
  },

  place() {
    if (!this.bar) return;
    const p = (config.data.global.quickbar || {}).pos || this.defaultPos();
    this.bar.style.left = clamp(p.x, 0, innerWidth - 44) + 'px';
    this.bar.style.top = clamp(p.y, 0, innerHeight - 80) + 'px';
  },

  draw() {
    const q = (config.data.global.quickbar = config.data.global.quickbar || { show: true, hidden: [], pos: null });
    if (!q.show) { this.bar && this.bar.remove(); this.bar = null; return; }
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
