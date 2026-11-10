/* ───────────────────────── util.js ─────────────────────────
 * Drobne narzędzia wspólne dla całego panelu.
 */
const W = window;
const MP = (W.__MargoPanel = W.__MargoPanel || {});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const now = () => Date.now();
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const rnd = (a, b) => a + Math.random() * (b - a);

function el(tag, attrs, ...kids) {
  const n = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') n.className = v;
      else if (k === 'style' && typeof v === 'object') { for (const [sk, sv] of Object.entries(v)) { if (sv == null) continue; if (sk.startsWith('--')) n.style.setProperty(sk, sv); else n.style[sk] = sv; } }
      else if (k === 'html') n.innerHTML = v;
      else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v === true ? '' : v);
    }
  }
  for (const k of kids.flat()) {
    if (k == null || k === false) continue;
    n.appendChild(typeof k === 'string' || typeof k === 'number' ? document.createTextNode(String(k)) : k);
  }
  return n;
}

function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** Czy użytkownik właśnie pisze (czat, pole tekstowe) — wtedy NIE reagujemy na skróty. */
function isTyping() {
  const a = document.activeElement;
  if (!a) return false;
  const tag = (a.tagName || '').toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || a.isContentEditable;
}

function isVisible(node) {
  if (!node || !node.isConnected) return false;
  const r = node.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return false;
  const cs = getComputedStyle(node);
  return cs.visibility !== 'hidden' && cs.display !== 'none' && cs.opacity !== '0';
}

/** Prosta szyna zdarzeń. */
const bus = {
  map: new Map(),
  on(ev, fn) { if (!this.map.has(ev)) this.map.set(ev, new Set()); this.map.get(ev).add(fn); return () => this.off(ev, fn); },
  off(ev, fn) { this.map.get(ev)?.delete(fn); },
  emit(ev, ...a) {
    for (const fn of this.map.get(ev) || []) {
      try { fn(...a); } catch (e) { console.warn('[L4Scripts] błąd w obsłudze', ev, e); }
    }
  },
};

MP.util = { sleep, now, $, $$, el, clamp, rnd, debounce, esc, isTyping, isVisible, bus };
