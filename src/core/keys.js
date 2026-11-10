/* ───────────────────────── keys.js ─────────────────────────
 * Skróty klawiszowe. Zasada legalności: JEDNO naciśnięcie = JEDNA akcja.
 * Przytrzymanie klawisza (auto-repeat) jest ignorowane, a skróty nie działają podczas pisania na czacie.
 */
function comboFromEvent(e) {
  const k = e.key;
  if (!k || ['Control', 'Shift', 'Alt', 'Meta'].includes(k)) return '';
  let key = k.length === 1 ? k.toUpperCase() : k;
  if (key === ' ') key = 'Space';
  const mods = [];
  if (e.ctrlKey) mods.push('Ctrl');
  if (e.altKey) mods.push('Alt');
  if (e.shiftKey && k.length !== 1) mods.push('Shift');
  if (e.shiftKey && k.length === 1) mods.push('Shift');
  return [...mods, key].join('+');
}

const keys = {
  binds: [],
  capturing: null,

  /** bind({ id, label, get: () => 'X', fn, when?: () => bool }) */
  bind(b) { this.binds.push(b); },

  conflicts() {
    const seen = {};
    const out = [];
    for (const b of this.binds) {
      const k = b.get();
      if (!k || (b.when && !b.when())) continue;
      if (seen[k]) out.push([seen[k], b.label, k]); else seen[k] = b.label;
    }
    return out;
  },

  start() {
    document.addEventListener('keydown', (e) => {
      if (this.capturing) {
        e.preventDefault(); e.stopPropagation();
        if (e.key === 'Escape') { this.capturing(null); this.capturing = null; return; }
        if (e.key === 'Backspace' || e.key === 'Delete') { this.capturing(''); this.capturing = null; return; }
        const c = comboFromEvent(e);
        if (!c) return;
        this.capturing(c); this.capturing = null;
        return;
      }
      if (e.repeat || isTyping()) return;
      const c = comboFromEvent(e);
      if (!c) return;
      for (const b of this.binds) {
        if (b.get() !== c) continue;
        if (b.when && !b.when()) continue;
        e.preventDefault(); e.stopPropagation();
        try { b.fn(e); } catch (err) { console.warn('[L4Scripts] skrót', b.label, err); }
        return;
      }
    }, true);
  },

  /** Czeka na naciśnięcie klawisza (do ustawiania skrótu w panelu). */
  capture() { return new Promise((res) => { this.capturing = res; }); },
};

/* ───────── Powiadomienia (toasty) — wygląd ustawia dodatek Hey WakeUP! ───────── */
function toast(msg, type = 'info', ms = 3200) {
  // Najpierw komunikat samej gry (żółty tekst na dole) — wygląda dokładnie jak w grze,
  // a Hey WakeUP! zmienia jego wygląd stylami. Własny zapasowy tylko, gdy gra nie ma funkcji message().
  try { if (typeof W.message === 'function' && !(config.data && config.data.global.ownToasts)) { W.message(String(msg)); return; } } catch {}
  let host = document.getElementById('mp-toasts');
  if (!host) { host = el('div', { id: 'mp-toasts' }); document.body.appendChild(host); }
  const t = el('div', { class: `mp-toast mp-toast-${type}` }, msg);
  host.appendChild(t);
  while (host.children.length > 4) host.firstChild.remove();
  requestAnimationFrame(() => t.classList.add('in'));
  setTimeout(() => { t.classList.remove('in'); setTimeout(() => t.remove(), 300); }, ms);
}

MP.keys = keys;
MP.toast = toast;
