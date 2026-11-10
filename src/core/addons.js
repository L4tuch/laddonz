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

  ORDER: ['napad', 'wakeup', 'bratan', 'wrogowie', 'ktotu', 'ktozlapie', 'cook', 'podpis', 'pokazeq', 'jakibon', 'taxi', 'autof', 'szybka', 'ulepszarka', 'minichat', 'legenda', 'motywnik'],

  initAll() {
    this.list.sort((a, b) => this.ORDER.indexOf(a.id) - this.ORDER.indexOf(b.id));
    for (const a of this.list) {
      const cfg = config.addon(a.id, Object.assign({ enabled: false }, a.defaults));
      for (const k of a.keys || []) {
        keys.bind({ label: `${a.name}: ${k.label}`, get: () => (cfg.enabled ? cfg[k.key] || '' : ''), fn: k.fn });
      }
      try { a.init && a.init(cfg); } catch (e) { console.warn('[L4Tools] init', a.id, e); }
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
function confirmBox({ title, html, items, okText = 'Potwierdź', cancelText = 'Anuluj', danger = false, countdown = 0, width = null }) {
  return new Promise((resolve) => {
    const body = el('div', { class: 'mp-wbody' });
    if (html) body.appendChild(el('div', { html }));
    if (items && items.length) body.appendChild(el('ul', { style: { margin: '8px 0 0', paddingLeft: '18px' } }, items.map((t) => el('li', null, t))));
    const ok = el('button', { class: 'mp-btn ' + (danger ? 'bad' : 'pri') }, okText);
    const cancel = el('button', { class: 'mp-btn' }, cancelText);
    const bg = el('div', { class: 'mp-modal-bg' }, el('div', { class: 'mp-modal mp-glass', style: width ? { width } : null }, el('h3', null, title), body, el('div', { class: 'mp-btns', style: { justifyContent: 'flex-end' } }, cancel, ok)));
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
