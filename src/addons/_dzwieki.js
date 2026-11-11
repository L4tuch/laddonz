/* ───────── Wspólne: czat klanowy i dźwięki (wbudowany sygnał albo własny plik) ─────────
 * Używane przez dodatek „Wrogowie na mapie”.
 */
(() => {
  /** Wiadomość na czat (kanał: CLAN, GROUP, LOCAL…) — ta sama komenda, której używa czat gry. */
  function chat(channel, text) {
    const t = String(text || '').trim().slice(0, 200);
    if (!t) return;
    try { W._g(`chat&channel=${channel}`, false, { c: t }); } catch (e) { console.warn('[L4Tools] czat', e); }
  }
  const fill = (tpl, map) => String(tpl || '').replace(/\{([^}]+)\}/g, (m, k) => (map[k] !== undefined ? map[k] : m));

  /* ── dźwięki: wbudowany sygnał albo Twój plik (IndexedDB) ── */
  const sdb = {
    db: null,
    open() { if (this.db) return Promise.resolve(this.db); return new Promise((res, rej) => { const q = indexedDB.open('l4tools-snd', 1); q.onupgradeneeded = () => q.result.createObjectStore('s'); q.onsuccess = () => { this.db = q.result; res(this.db); }; q.onerror = () => rej(q.error); }); },
    async op(m, fn) { const db = await this.open(); return new Promise((res, rej) => { const tx = db.transaction('s', m); const r = fn(tx.objectStore('s')); tx.oncomplete = () => res(r && r.result); tx.onerror = () => rej(tx.error); }); },
    get(k) { return this.op('readonly', (s) => s.get(k)); },
    put(k, v) { return this.op('readwrite', (s) => s.put(v, k)); },
    del(k) { return this.op('readwrite', (s) => s.delete(k)); },
  };
  let AC = null;
  function chime(kind, vol) {
    try {
      AC = AC || new (W.AudioContext || W.webkitAudioContext)();
      if (AC.state === 'suspended') AC.resume();
      const t0 = AC.currentTime + 0.02, g = AC.createGain(); g.gain.value = vol; g.connect(AC.destination);
      const notes = kind === 'alarm' ? [[880, 0], [660, 0.18], [880, 0.36], [660, 0.54]] : [[784, 0], [1046.5, 0.12], [1318.5, 0.24]];
      notes.forEach(([f, d]) => {
        const o = AC.createOscillator(), e = AC.createGain(); o.type = kind === 'alarm' ? 'square' : 'triangle'; o.frequency.value = f;
        e.gain.setValueAtTime(0.0001, t0 + d); e.gain.exponentialRampToValueAtTime(kind === 'alarm' ? 0.18 : 0.35, t0 + d + 0.01); e.gain.exponentialRampToValueAtTime(0.0001, t0 + d + 0.32);
        o.connect(e).connect(g); o.start(t0 + d); o.stop(t0 + d + 0.35);
      });
    } catch {}
  }
  async function playSound(key, kind, vol = 0.7, mode = 'default') {
    if (mode === 'none') return;
    if (mode === 'own') {
      const r = await sdb.get(key).catch(() => null);
      if (r && r.data) { try { const a = new Audio(URL.createObjectURL(new Blob([r.data], { type: r.type || 'audio/mpeg' }))); a.volume = vol; await a.play(); return; } catch {} }
    }
    chime(kind, vol);
  }
  /** Ustawienia dźwięku (wbudowany / własny / brak + głośność + test) jako pole w panelu. */
  function soundField(key, kind) {
    return {
      key: '_snd', type: 'custom', render: (obj, save) => {
        const box = el('div', { class: 'mp-field', style: { flexDirection: 'column', alignItems: 'stretch', gap: '6px' } }, el('div', { class: 'lb' }, 'Dźwięk'));
        const draw = async () => {
          box.querySelectorAll('.mp-btns, .mp-dim').forEach((n) => n.remove());
          const own = await sdb.get(key).catch(() => null);
          const mode = obj.sound || 'default';
          box.appendChild(el('div', { class: 'mp-btns' },
            el('button', { class: 'mp-upchip' + (mode === 'default' ? ' on' : ''), onclick: () => { obj.sound = 'default'; save(); draw(); } }, 'Domyślny'),
            el('button', { class: 'mp-upchip' + (mode === 'own' ? ' on' : ''), onclick: () => { if (!own) return toast('Najpierw wgraj plik', 'warn'); obj.sound = 'own'; save(); draw(); } }, own ? `Własny: ${own.name}` : 'Własny (brak pliku)'),
            el('button', { class: 'mp-upchip' + (mode === 'none' ? ' on' : ''), onclick: () => { obj.sound = 'none'; save(); draw(); } }, 'Bez dźwięku')));
          box.appendChild(el('div', { class: 'mp-btns' },
            el('button', { class: 'mp-btn', onclick: () => playSound(key, kind, obj.volume ?? 0.7, obj.sound || 'default') }, 'Odsłuchaj'),
            el('button', { class: 'mp-btn', onclick: () => {
              const inp = el('input', { type: 'file', accept: 'audio/*', style: { display: 'none' } });
              inp.onchange = async () => { const f = inp.files[0]; inp.remove(); if (!f) return; if (f.size > 8e6) return toast('Plik za duży (max 8 MB)', 'warn'); await sdb.put(key, { name: f.name, type: f.type, data: await f.arrayBuffer() }); obj.sound = 'own'; save(); draw(); };
              document.body.appendChild(inp); inp.click();
            } }, own ? 'Zmień plik' : 'Wgraj własny plik'),
            own ? el('button', { class: 'mp-btn bad', onclick: async () => { await sdb.del(key).catch(() => {}); obj.sound = 'default'; save(); draw(); } }, 'Usuń plik') : null));
        };
        draw();
        return box;
      },
    };
  }
  
  MP.betaSound = MP.sound = { playSound, soundField, chat, fill };
})();
