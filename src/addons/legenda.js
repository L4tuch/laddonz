/* ───────── Legendarny Łup ─────────
 * Gdy w oknie łupu pojawia się przedmiot legendarny — efekt na cały ekran z dźwiękiem.
 * Style: Thor (błyskawice i grzmoty), Smoke (czarny dym za oknem łupu), Kasyno (złote monety),
 * Disco (kula disco, światła, neony i muzyka) oraz Własny (sam składasz warstwy, kolor i dźwięk).
 * Każdy styl ma wbudowany dźwięk (syntezowany w przeglądarce — nie da się go usunąć) i może mieć własny
 * plik dźwiękowy (trzymany w IndexedDB przeglądarki).
 *
 * Rysowanie: dwa płótna — „tył" (za oknem łupu: dym, promienie, poświata) i „przód" (nad wszystkim:
 * błyskawice, monety, kula disco, neony, napis). Oba bez przechwytywania kliknięć.
 */
(() => {
  let cfg;
  const LOOT_SEL = '.loot-wnd, .loots-window, .loot-window, [class*="loot-window"], [class*="loots-window"], .c-window[class*="loot"]';
  const FONTS = 'https://fonts.googleapis.com/css2?family=Cinzel:wght@700;900&family=Bungee&family=Monoton&display=swap';

  const STYLES = {
    thor: { name: 'Thor', desc: 'Burza nad ekranem: błyskawice biją w okno łupu, grzmoty przetaczają się po głośnikach.', col: '#8fc4ff', grad: ['#16244a', '#3c6fd1'], dur: 6200 },
    smoke: { name: 'Smoke', desc: 'Z okna łupu bucha czarny dym, który wznosi się i rozpływa po całym ekranie.', col: '#cfd3d8', grad: ['#0c0c0e', '#3a3d44'], dur: 7200 },
    kasyno: { name: 'Kasyno', desc: 'Jackpot! Fontanna i deszcz złotych monet z brzękiem, złote światła za oknem.', col: '#ffd34d', grad: ['#3a2600', '#d39a14'], dur: 6600 },
    disco: { name: 'Disco', desc: 'Nad oknem łupu zjeżdża kula disco, światła wirują, latają neony i gra muzyka.', col: '#ff4fd8', grad: ['#2a0a3e', '#ff2bd6'], dur: 9000 },
    wlasny: { name: 'Własny', desc: 'Złóż efekt sam: wybierz warstwy, kolor i dźwięk.', col: '#7c5cff', grad: ['#1d1640', '#7c5cff'], dur: 6500 },
  };
  const LAYERS = [
    ['flash', 'Rozbłysk'], ['bolts', 'Błyskawice'], ['smoke', 'Dym'], ['coins', 'Monety'],
    ['ball', 'Kula disco'], ['beams', 'Światła'], ['neon', 'Neony'], ['glow', 'Poświata'], ['banner', 'Napis'], ['media', 'Moja animacja'],
  ];
  const PRESET_LAYERS = {
    thor: ['storm', 'bolts', 'flash', 'banner'],
    smoke: ['shade', 'smoke', 'banner'],
    kasyno: ['glow', 'sunburst', 'coins', 'banner'],
    disco: ['shade', 'beams', 'spots', 'ball', 'neon', 'pulse', 'banner'],
  };
  /** Uderzenia piorunów (sekundy) — wspólne dla obrazu i grzmotów; mocne otwarcie, potem burza do końca efektu. */
  function strikesFor(dur) {
    const out = [0.1, 0.82, 1.5, 1.95, 3.05, 3.9];
    let t = 3.9;
    while (true) { t += R(1.1, 2.2); if (t > dur - 1.6) break; out.push(+t.toFixed(2)); if (Math.random() < 0.3 && t + 0.4 < dur - 1.6) out.push(+(t + R(0.25, 0.45)).toFixed(2)); }
    return out.filter((x) => x < dur - 1);
  }
  let STRIKES = [0.1, 0.82, 1.5, 1.95, 3.05, 3.9];
  /** Fontanny monet w Kasynie (sekundy) — wspólne dla obrazu i dźwięku. */
  const FOUNTAINS = (dur) => { const o = [0]; for (let t = 4.6; t < dur - 3; t += 4.6) o.push(t); return o; };
  const durOf = () => Math.max(5, Math.min(20, Number(cfg && cfg.dur) || 15));

  /* ═════════════════ narzędzia ═════════════════ */
  const R = (a, b) => a + Math.random() * (b - a);
  const ease = { out: (p) => 1 - Math.pow(1 - p, 3), back: (p) => { const c = 1.6; return 1 + (c + 1) * Math.pow(p - 1, 3) + c * Math.pow(p - 1, 2); } };
  const hexRgb = (h) => { h = String(h || '#ffffff').replace('#', ''); if (h.length === 3) h = h.split('').map((c) => c + c).join(''); const n = parseInt(h, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const rgba = (h, a) => { const [r, g, b] = hexRgb(h); return `rgba(${r},${g},${b},${a})`; };

  /* ── IndexedDB na własne pliki dźwiękowe ── */
  const idb = {
    db: null,
    open() {
      if (this.db) return Promise.resolve(this.db);
      return new Promise((res, rej) => {
        const q = indexedDB.open('l4tools', 1);
        q.onupgradeneeded = () => q.result.createObjectStore('audio');
        q.onsuccess = () => { this.db = q.result; res(this.db); };
        q.onerror = () => rej(q.error);
      });
    },
    async op(mode, fn) { const db = await this.open(); return new Promise((res, rej) => { const tx = db.transaction('audio', mode); const r = fn(tx.objectStore('audio')); tx.oncomplete = () => res(r && r.result); tx.onerror = () => rej(tx.error); }); },
    get(k) { return this.op('readonly', (s) => s.get(k)); },
    put(k, v) { return this.op('readwrite', (s) => s.put(v, k)); },
    del(k) { return this.op('readwrite', (s) => s.delete(k)); },
  };

  /* ═════════════════ dźwięk (Web Audio) ═════════════════ */
  let AC = null;
  function ac() {
    if (!AC) { const C = W.AudioContext || W.webkitAudioContext; if (!C) return null; AC = new C(); }
    if (AC.state === 'suspended') AC.resume().catch(() => {});
    return AC;
  }
  function noiseBuf(a, sec, brown) {
    const b = a.createBuffer(2, Math.floor(a.sampleRate * sec), a.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c); let last = 0;
      for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; if (brown) { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w; }
    }
    return b;
  }
  const env = (g, t0, a, peak, d, end = 0.0001) => { g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(peak, t0 + a); g.gain.exponentialRampToValueAtTime(end, t0 + a + d); };
  function src(a, buf) { const s = a.createBufferSource(); s.buffer = buf; return s; }

  const SOUND = {
    /** Grzmot: suchy trzask + przetaczający się pomruk, rozłożony w stereo. */
    thor(a, out, t0, dur = 15) {
      const white = noiseBuf(a, 1.2), brown = noiseBuf(a, 6, true);
      STRIKES.forEach((s, i) => {
        const t = t0 + s, big = i % 2 === 0;
        // trzask
        const n = src(a, white), hp = a.createBiquadFilter(), g = a.createGain(), p = a.createStereoPanner();
        hp.type = 'highpass'; hp.frequency.value = 1200; p.pan.value = R(-0.6, 0.6);
        env(g, t, 0.004, big ? 0.55 : 0.32, 0.22);
        n.connect(hp).connect(g).connect(p).connect(out); n.start(t); n.stop(t + 0.5);
        // pomruk
        const r = src(a, brown), lp = a.createBiquadFilter(), g2 = a.createGain(), p2 = a.createStereoPanner();
        lp.type = 'lowpass'; lp.frequency.setValueAtTime(900, t + 0.05); lp.frequency.exponentialRampToValueAtTime(120, t + 2.6);
        p2.pan.setValueAtTime(p.pan.value, t); p2.pan.linearRampToValueAtTime(-p.pan.value, t + 2.8);
        g2.gain.setValueAtTime(0.0001, t); g2.gain.exponentialRampToValueAtTime(big ? 0.95 : 0.55, t + 0.12);
        for (let k = 1; k < 8; k++) g2.gain.exponentialRampToValueAtTime((big ? 0.8 : 0.45) * R(0.35, 1) / (1 + k * 0.45), t + 0.12 + k * 0.33);
        g2.gain.exponentialRampToValueAtTime(0.0001, t + 3.4);
        r.connect(lp).connect(g2).connect(p2).connect(out); r.start(t, R(0, 2)); r.stop(t + 3.5);
      });
      // deszcz w tle
      const rain = src(a, white), bp = a.createBiquadFilter(), gr = a.createGain(); rain.loop = true;
      bp.type = 'bandpass'; bp.frequency.value = 5000; bp.Q.value = 0.4;
      gr.gain.setValueAtTime(0.0001, t0); gr.gain.exponentialRampToValueAtTime(0.06, t0 + 1); gr.gain.setValueAtTime(0.06, t0 + dur - 1.2); gr.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      rain.connect(bp).connect(gr).connect(out); rain.start(t0); rain.stop(t0 + dur + 0.1);
    },
    /** Dym: głęboki wybuch powietrza, potem szum rozchodzący się na boki. */
    smoke(a, out, t0, dur = 15) {
      const white = noiseBuf(a, 8), brown = noiseBuf(a, 8, true), D = dur;
      const boom = src(a, brown), lp = a.createBiquadFilter(), gb = a.createGain();
      lp.type = 'lowpass'; lp.frequency.setValueAtTime(400, t0); lp.frequency.exponentialRampToValueAtTime(60, t0 + 1.6);
      env(gb, t0, 0.03, 1.8, 1.8); boom.connect(lp).connect(gb).connect(out); boom.start(t0); boom.stop(t0 + 2);
      [-0.75, 0.75, 0].forEach((pan, i) => {
        const n = src(a, white), bp = a.createBiquadFilter(), g = a.createGain(), p = a.createStereoPanner();
        bp.type = 'bandpass'; bp.Q.value = 0.9;
        bp.frequency.setValueAtTime(220, t0); bp.frequency.exponentialRampToValueAtTime(1400 + i * 300, t0 + 0.7); bp.frequency.exponentialRampToValueAtTime(380, t0 + D * 0.5); bp.frequency.exponentialRampToValueAtTime(240, t0 + D);
        p.pan.setValueAtTime(0, t0); p.pan.linearRampToValueAtTime(pan, t0 + 3);
        g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(i === 2 ? 0.5 : 0.35, t0 + 0.35); g.gain.exponentialRampToValueAtTime(0.16, t0 + 3); g.gain.setValueAtTime(0.16, t0 + D - 3); g.gain.exponentialRampToValueAtTime(0.0001, t0 + D);
        n.loop = true; n.connect(bp).connect(g).connect(p).connect(out); n.start(t0, i); n.stop(t0 + D + 0.1);
      });
      const hiss = src(a, white), hp = a.createBiquadFilter(), gh = a.createGain();
      hp.type = 'highpass'; hp.frequency.value = 6000; env(gh, t0 + 0.1, 0.4, 0.05, D - 0.6);
      hiss.loop = true; hiss.connect(hp).connect(gh).connect(out); hiss.start(t0 + 0.1); hiss.stop(t0 + D);
      // kolejne kłęby: miękkie „puff" co kilka sekund, w rytm nowych chmur na ekranie
      for (let tt = 3.2; tt < D - 2.5; tt += R(2.4, 3.4)) {
        const pf = src(a, brown), lp2 = a.createBiquadFilter(), g3 = a.createGain(), pp = a.createStereoPanner();
        lp2.type = 'lowpass'; lp2.frequency.setValueAtTime(700, t0 + tt); lp2.frequency.exponentialRampToValueAtTime(90, t0 + tt + 1.4); pp.pan.value = R(-0.7, 0.7);
        env(g3, t0 + tt, 0.08, 0.7, 1.4); pf.connect(lp2).connect(g3).connect(pp).connect(out); pf.start(t0 + tt, R(0, 5)); pf.stop(t0 + tt + 1.6);
      }
    },
    /** Monety: dzwonek „jackpot" i kaskada metalicznych brzęknięć. */
    kasyno(a, out, t0, dur = 15) {
      const ding = (tt) => [1046.5, 1318.5, 1568, 2093].forEach((f, i) => {
        const o = a.createOscillator(), g = a.createGain(); o.type = 'triangle'; o.frequency.value = f;
        env(g, tt + i * 0.07, 0.005, 0.22, 1.1); o.connect(g).connect(out); o.start(tt + i * 0.07); o.stop(tt + i * 0.07 + 1.3);
      });
      FOUNTAINS(dur).forEach((f) => ding(t0 + f));
      const clink = (t, f, v, pan) => {
        const p = a.createStereoPanner(); p.pan.value = pan; p.connect(out);
        [1, 2.76, 5.4, 8.93].forEach((m, k) => {
          const o = a.createOscillator(), g = a.createGain(); o.type = 'sine'; o.frequency.value = f * m;
          env(g, t, 0.002, v / (1 + k * 1.3), R(0.12, 0.35)); o.connect(g).connect(p); o.start(t); o.stop(t + 0.45);
        });
      };
      const span = Math.max(3, dur - 2.5);
      for (let i = 0; i < Math.round(22 * span); i++) { const t = t0 + 0.15 + Math.random() * span; clink(t, R(2100, 4200), R(0.04, 0.13), R(-0.8, 0.8)); }
      FOUNTAINS(dur).forEach((f) => { for (let i = 0; i < 8; i++) clink(t0 + f + 0.05 + i * 0.045, R(2600, 3400), 0.2, R(-0.3, 0.3)); });
    },
    /** Disco: 4 takty 120 BPM — stopa, hi-hat, klaśnięcie, oktawowy bas, akordy i smyczki na wejście. */
    disco(a, out, t0, dur = 15) {
      const bpm = 120, beat = 60 / bpm, bars = Math.max(2, Math.floor(dur / (beat * 4)));
      const comp = a.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 4; comp.connect(out);
      const white = noiseBuf(a, 1);
      const fadeT = t0 + bars * 4 * beat;
      const master = a.createGain(); master.gain.setValueAtTime(1, t0); master.gain.setValueAtTime(1, fadeT - 0.8); master.gain.linearRampToValueAtTime(0.0001, fadeT + 0.2); master.connect(comp);
      const kick = (t) => { const o = a.createOscillator(), g = a.createGain(); o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.12); env(g, t, 0.002, 0.8, 0.28); o.connect(g).connect(master); o.start(t); o.stop(t + 0.32); };
      const hat = (t, open) => { const n = src(a, white), hp = a.createBiquadFilter(), g = a.createGain(); hp.type = 'highpass'; hp.frequency.value = 7500; env(g, t, 0.002, open ? 0.22 : 0.12, open ? 0.2 : 0.05); n.connect(hp).connect(g).connect(master); n.start(t); n.stop(t + 0.3); };
      const clap = (t) => { const bp = a.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1500; bp.Q.value = 0.8; bp.connect(master); [0, 0.011, 0.022].forEach((d) => { const n = src(a, white), g = a.createGain(); env(g, t + d, 0.001, 0.5, d === 0.022 ? 0.16 : 0.02); n.connect(g).connect(bp); n.start(t + d); n.stop(t + d + 0.2); }); };
      const CH = [[57, [57, 60, 64, 67]], [62, [62, 66, 69, 72]], [55, [55, 59, 62, 66]], [60, [60, 64, 67, 71]]]; // Am7 D9 Gmaj7 Cmaj7 (MIDI)
      const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
      const bass = (t, m) => { const o = a.createOscillator(), f = a.createBiquadFilter(), g = a.createGain(); o.type = 'sawtooth'; o.frequency.value = hz(m - 24); f.type = 'lowpass'; f.frequency.setValueAtTime(900, t); f.frequency.exponentialRampToValueAtTime(220, t + 0.2); env(g, t, 0.005, 0.32, 0.2); o.connect(f).connect(g).connect(master); o.start(t); o.stop(t + 0.26); };
      const stab = (t, notes) => { const f = a.createBiquadFilter(), g = a.createGain(); f.type = 'lowpass'; f.frequency.setValueAtTime(3200, t); f.frequency.exponentialRampToValueAtTime(700, t + 0.18); env(g, t, 0.004, 0.09, 0.2); f.connect(g).connect(master); notes.forEach((m) => [-6, 6].forEach((det) => { const o = a.createOscillator(); o.type = 'sawtooth'; o.frequency.value = hz(m); o.detune.value = det; o.connect(f); o.start(t); o.stop(t + 0.25); })); };
      // smyczkowy „swoosh" na wejście
      const sw = a.createBiquadFilter(), sg = a.createGain(); sw.type = 'lowpass'; sw.frequency.setValueAtTime(300, t0); sw.frequency.exponentialRampToValueAtTime(5000, t0 + 1.2); sg.gain.setValueAtTime(0.0001, t0); sg.gain.exponentialRampToValueAtTime(0.12, t0 + 1); sg.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.8); sw.connect(sg).connect(master);
      [69, 72, 76, 81].forEach((m) => [-8, 8].forEach((d) => { const o = a.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(hz(m - 12), t0); o.frequency.exponentialRampToValueAtTime(hz(m), t0 + 1.2); o.detune.value = d; o.connect(sw); o.start(t0); o.stop(t0 + 1.9); }));
      for (let bar = 0; bar < bars; bar++) {
        const [root, notes] = CH[bar % 4];
        for (let b = 0; b < 4; b++) {
          const t = t0 + (bar * 4 + b) * beat;
          kick(t); hat(t + beat / 2, true); hat(t + beat / 4); hat(t + beat * 3 / 4);
          if (b % 2 === 1) clap(t);
          bass(t, root); bass(t + beat / 2, root + 12);
          if (b === 1 || b === 3) stab(t + beat / 2, notes);
        }
      }
    },
  };
  const SOUND_KEYS = [['thor', 'Grzmoty (Thor)'], ['smoke', 'Dym (Smoke)'], ['kasyno', 'Monety (Kasyno)'], ['disco', 'Muzyka disco (Disco)'], ['own', 'Własny plik'], ['none', 'Bez dźwięku']];

  const bufCache = {};
  async function ownBuffer(key) {
    if (bufCache[key]) return bufCache[key];
    const rec = await idb.get('snd:' + key).catch(() => null);
    if (!rec || !rec.data) return null;
    const a = ac(); if (!a) return null;
    const buf = await a.decodeAudioData(rec.data.slice(0)).catch(() => null);
    if (buf) bufCache[key] = buf;
    return buf;
  }
  /** Gra dźwięk stylu: własny plik (jeśli wybrany i jest) albo wbudowany. Zwraca funkcję zatrzymującą. */
  async function playSound(styleKey, durMs) {
    const a = ac(); if (!a) return () => {};
    const vol = Math.max(0, Math.min(1, Number(cfg.volume ?? 0.7)));
    // ogranicznik na wyjściu: głośne grzmoty i stopa disco nie przesterują
    const lim = a.createDynamicsCompressor(); lim.threshold.value = -6; lim.knee.value = 4; lim.ratio.value = 12; lim.attack.value = 0.002; lim.release.value = 0.2; lim.connect(a.destination);
    const master = a.createGain(); master.gain.value = vol; master.connect(lim);
    const stop = () => { try { master.gain.cancelScheduledValues(a.currentTime); master.gain.setValueAtTime(master.gain.value, a.currentTime); master.gain.linearRampToValueAtTime(0.0001, a.currentTime + 0.6); setTimeout(() => { master.disconnect(); lim.disconnect(); }, 800); } catch {} };
    let which = styleKey;
    if (styleKey === 'wlasny') which = (cfg.custom && cfg.custom.sound) || 'thor';
    const useOwn = which === 'own' || (cfg.sounds && cfg.sounds[styleKey] === 'own');
    if (which === 'none') return stop;
    const t0 = a.currentTime + 0.03;
    if (useOwn) {
      const buf = await ownBuffer(styleKey);
      if (buf) {
        const s = a.createBufferSource(); s.buffer = buf; s.connect(master); s.start(t0);
        const end = t0 + durMs / 1000;
        master.gain.setValueAtTime(vol, Math.max(t0, end - 1)); master.gain.linearRampToValueAtTime(0.0001, end);
        s.stop(end + 0.05);
        return stop;
      }
      if (which === 'own') return stop;
    }
    const fn = SOUND[which] || SOUND.thor;
    if (!run) STRIKES = strikesFor(durMs / 1000);
    fn(a, master, t0, durMs / 1000);
    return stop;
  }

  /* ═════════════════ grafika ═════════════════ */
  /** Kafelki dymu: miękkie, nieregularne kłęby (kilka wariantów). */
  let smokeSprites = null;
  function getSmoke() {
    if (smokeSprites) return smokeSprites;
    smokeSprites = [0, 1, 2].map(() => {
      const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d');
      x.filter = 'blur(10px)';
      for (let i = 0; i < 34; i++) {
        const ang = R(0, 6.3), d = Math.pow(Math.random(), 0.7) * 62, r = R(22, 60) * (1 - d / 120);
        const px = 128 + Math.cos(ang) * d, py = 128 + Math.sin(ang) * d;
        const g = x.createRadialGradient(px, py, 0, px, py, r);
        const v = Math.floor(R(8, 38));
        g.addColorStop(0, `rgba(${v},${v},${v + 4},${R(0.22, 0.4)})`); g.addColorStop(0.6, `rgba(${v},${v},${v + 4},${R(0.1, 0.18)})`); g.addColorStop(1, `rgba(${v},${v},${v},0)`);
        x.fillStyle = g; x.beginPath(); x.arc(px, py, r, 0, 7); x.fill();
      }
      // jaśniejsze, „podświetlone" krawędzie kłębów
      x.globalCompositeOperation = 'source-atop';
      const hl = x.createLinearGradient(0, 40, 0, 220); hl.addColorStop(0, 'rgba(120,120,128,.22)'); hl.addColorStop(0.5, 'rgba(0,0,0,0)'); x.fillStyle = hl; x.fillRect(0, 0, 256, 256);
      return c;
    });
    return smokeSprites;
  }
  /** Moneta: awers (jaśniejszy) i rewers (ciemniejszy) — przy obrocie rysowane ze ściśnięciem w poziomie. */
  let coinSprites = null;
  function getCoins() {
    if (coinSprites) return coinSprites;
    coinSprites = [0, 1].map((back) => {
      const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
      const g = x.createRadialGradient(24, 22, 4, 32, 32, 31);
      if (back) { g.addColorStop(0, '#e9b93a'); g.addColorStop(0.7, '#a8740e'); g.addColorStop(1, '#5e3c02'); } else { g.addColorStop(0, '#fff6c4'); g.addColorStop(0.45, '#ffd34d'); g.addColorStop(0.85, '#c88d10'); g.addColorStop(1, '#7a4f04'); }
      x.fillStyle = g; x.beginPath(); x.arc(32, 32, 30, 0, 7); x.fill();
      x.strokeStyle = back ? '#6b4503' : '#9a6a08'; x.lineWidth = 2.4; x.beginPath(); x.arc(32, 32, 22, 0, 7); x.stroke();
      x.strokeStyle = 'rgba(255,255,255,.45)'; x.lineWidth = 1.2; x.beginPath(); x.arc(32, 32, 28.5, -2.6, -0.9); x.stroke();
      x.fillStyle = back ? '#7a5105' : '#a87410'; x.font = '900 26px Cinzel, Georgia, serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('L', 32, 34);
      x.fillStyle = 'rgba(255,255,255,.35)'; x.fillText('L', 31, 32.5);
      return c;
    });
    return coinSprites;
  }
  /** Piorun: przemieszczenie punktu środkowego + odnogi. */
  function bolt(x0, y0, x1, y1, disp, branches) {
    let pts = [[x0, y0], [x1, y1]];
    for (let it = 0; it < 8; it++) {
      const n = [pts[0]];
      for (let i = 1; i < pts.length; i++) {
        const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
        const dx = bx - ax, dy = by - ay, l = Math.hypot(dx, dy) || 1;
        const off = R(-disp, disp);
        n.push([(ax + bx) / 2 + (-dy / l) * off, (ay + by) / 2 + (dx / l) * off], [bx, by]);
      }
      pts = n; disp *= 0.55;
    }
    const out = [{ pts, w: 1 }];
    if (branches) for (let i = 8; i < pts.length - 20; i += 6) {
      if (Math.random() > 0.16) continue;
      const [px, py] = pts[i], ang = Math.atan2(y1 - y0, x1 - x0) + R(-0.9, 0.9), len = R(60, 180);
      out.push(...bolt(px, py, px + Math.cos(ang) * len, py + Math.sin(ang) * len, len * 0.18, false).map((b) => ({ pts: b.pts, w: 0.45 })));
    }
    return out;
  }
  function strokeBolt(x, b, a) {
    x.lineJoin = 'round'; x.lineCap = 'round';
    for (const { pts, w } of b) {
      x.beginPath(); x.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) x.lineTo(pts[i][0], pts[i][1]);
      x.shadowColor = 'rgba(120,170,255,1)'; x.shadowBlur = 34;
      x.strokeStyle = `rgba(110,160,255,${0.3 * a})`; x.lineWidth = 16 * w; x.stroke();
      x.shadowBlur = 14; x.strokeStyle = `rgba(170,210,255,${0.9 * a})`; x.lineWidth = 5.5 * w; x.stroke();
      x.shadowBlur = 0; x.strokeStyle = `rgba(255,255,255,${a})`; x.lineWidth = 2.2 * w; x.stroke();
    }
  }
  function star4(x, cx, cy, r, a, col = '#fff') {
    x.save(); x.globalAlpha = a; x.fillStyle = col; x.beginPath();
    x.moveTo(cx, cy - r); x.quadraticCurveTo(cx, cy, cx + r, cy); x.quadraticCurveTo(cx, cy, cx, cy + r); x.quadraticCurveTo(cx, cy, cx - r, cy); x.quadraticCurveTo(cx, cy, cx, cy - r);
    x.fill(); x.restore();
  }

  /*
   * Warstwy efektu. Każda: make(E) → { back(x,t,dt), front(x,t,dt) }.
   * E = { W, H, r: prostokąt okna łupu, dur (s), col, name, fade(t) — 0..1 wejście/wyjście }.
   */
  const L = {
    storm(E) {
      const sheets = Array.from({ length: Math.round(E.dur * 1.2) }, () => ({ at: R(0.3, E.dur - 1.2), x: R(0.1, 0.9), y: R(0.05, 0.4) }));
      return { back(x, t) {
        const a = E.fade(t);
        const g = x.createRadialGradient(E.W / 2, E.H * 0.3, 60, E.W / 2, E.H / 2, Math.max(E.W, E.H) * 0.75);
        g.addColorStop(0, `rgba(14,24,52,${a * 0.42})`); g.addColorStop(1, `rgba(3,6,18,${a * 0.72})`); x.fillStyle = g; x.fillRect(0, 0, E.W, E.H);
        // błyski w chmurach (rozproszone światło za horyzontem)
        for (const s of sheets.concat(STRIKES.map((at) => ({ at, x: 0.5, y: 0.1 })))) {
          const d = t - s.at; if (d < 0 || d > 0.35) continue;
          const k = (1 - d / 0.35) * (0.6 + 0.4 * Math.sin(d * 60));
          const gx = s.x * E.W, gy = s.y * E.H, rr = Math.max(E.W, E.H) * 0.45;
          const lg = x.createRadialGradient(gx, gy, 0, gx, gy, rr); lg.addColorStop(0, `rgba(150,180,255,${0.28 * k * a})`); lg.addColorStop(1, 'rgba(150,180,255,0)');
          x.fillStyle = lg; x.fillRect(0, 0, E.W, E.H);
        }
      } };
    },
    shade(E) {
      return { back(x, t) { x.fillStyle = `rgba(0,0,0,${0.35 * E.fade(t)})`; x.fillRect(0, 0, E.W, E.H); } };
    },
    bolts(E) {
      const { r } = E;
      const strikes = STRIKES.filter((s) => s < E.dur - 1).map((s, i) => {
        const toWin = i % 2 === 0;
        const x1 = toWin ? R(r.left + r.width * 0.15, r.right - r.width * 0.15) : R(E.W * 0.05, E.W * 0.95);
        const y1 = toWin ? r.top + 4 : R(E.H * 0.45, E.H * 0.9);
        const x0 = x1 + R(-E.W * 0.25, E.W * 0.25);
        return { at: s, b: bolt(x0, -10, x1, y1, Math.hypot(x1 - x0, y1) * 0.16, true), end: [x1, y1], toWin, sparks: null };
      });
      return {
        front(x, t, dt) {
          x.save(); x.globalCompositeOperation = 'lighter';
          for (const s of strikes) {
            const p = (t - s.at) / 0.6;
            if (p < 0 || p > 1) continue;
            const a = Math.pow(1 - p, 1.4) * (0.55 + 0.45 * Math.abs(Math.sin(p * 38)));
            strokeBolt(x, s.b, a);
            if (!s.sparks) s.sparks = Array.from({ length: s.toWin ? 34 : 14 }, () => ({ x: s.end[0], y: s.end[1], vx: R(-260, 260), vy: R(-320, -40), l: R(0.35, 0.8), a: 0 }));
          }
          for (const s of strikes) if (s.sparks) for (const k of s.sparks) {
            k.a += dt; if (k.a > k.l) continue;
            k.vy += 900 * dt; const nx = k.x + k.vx * dt, ny = k.y + k.vy * dt;
            x.strokeStyle = `rgba(190,225,255,${1 - k.a / k.l})`; x.lineWidth = 1.6; x.beginPath(); x.moveTo(k.x, k.y); x.lineTo(nx, ny); x.stroke();
            k.x = nx; k.y = ny;
          }
          x.restore();
        },
      };
    },
    flash(E) {
      const times = E.layers.includes('bolts') ? STRIKES : [0.05];
      return { front(x, t) {
        let a = 0;
        for (const s of times) { const d = t - s; if (d >= 0 && d < 0.14) a += 0.42 * (1 - d / 0.14); const d2 = d - 0.09; if (d2 >= 0 && d2 < 0.1) a += 0.25 * (1 - d2 / 0.1); }
        if (a > 0) { x.fillStyle = E.custom ? rgba(E.col, Math.min(0.6, a)) : `rgba(205,225,255,${Math.min(0.6, a)})`; x.fillRect(0, 0, E.W, E.H); }
      } };
    },
    smoke(E) {
      const sp = getSmoke(), { r } = E, cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const P = []; let acc = 0;
      const spawn = (n, burst) => { for (let i = 0; i < n; i++) {
        const side = Math.floor(Math.random() * 4);
        const px = side === 0 ? R(r.left, r.right) : side === 1 ? r.right : side === 2 ? R(r.left, r.right) : r.left;
        const py = side === 0 ? r.top : side === 1 ? R(r.top, r.bottom) : side === 2 ? r.bottom : R(r.top, r.bottom);
        const dx = px - cx, dy = py - cy, l = Math.hypot(dx, dy) || 1, v = burst ? R(160, 340) : R(50, 140);
        P.push({ x: px, y: py, vx: (dx / l) * v * 1.4 + R(-25, 25), vy: (dy / l) * v - R(30, 90), r0: R(26, 50), r1: R(150, 300), rot: R(0, 6.3), vr: R(-0.6, 0.6), life: R(3, 4.6), age: 0, s: sp[i % 3], ph: R(0, 6), op: R(0.8, 1) });
      } };
      return { back(x, t, dt) {
        if (t < 0.05 && !P.length) spawn(70, true);
        if (t < E.dur - 3) { acc += dt * 38; const n = Math.floor(acc); acc -= n; spawn(n, false); }
        for (let i = P.length - 1; i >= 0; i--) {
          const p = P[i]; p.age += dt; if (p.age > p.life) { P.splice(i, 1); continue; }
          const k = p.age / p.life;
          p.vx *= 1 - 0.35 * dt; p.vy = p.vy * (1 - 0.3 * dt) - 26 * dt;
          p.x += (p.vx + Math.sin(t * 0.9 + p.ph) * 14) * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
          const rad = p.r0 + (p.r1 - p.r0) * ease.out(k), a = (k < 0.1 ? k / 0.1 : 1 - Math.pow((k - 0.1) / 0.9, 0.8)) * p.op;
          x.save(); x.globalAlpha = Math.max(0, a); x.translate(p.x, p.y); x.rotate(p.rot); x.drawImage(p.s, -rad, -rad, rad * 2, rad * 2); x.restore();
        }
      } };
    },
    glow(E) {
      const { r } = E, col = E.custom ? E.col : '#ffc83a';
      return { back(x, t) {
        const a = E.fade(t) * (0.55 + 0.15 * Math.sin(t * 6));
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2, rad = Math.max(r.width, r.height) * 1.3;
        const g = x.createRadialGradient(cx, cy, Math.min(r.width, r.height) * 0.3, cx, cy, rad);
        g.addColorStop(0, rgba(col, 0.55 * a)); g.addColorStop(1, rgba(col, 0));
        x.fillStyle = g; x.fillRect(cx - rad, cy - rad, rad * 2, rad * 2);
      } };
    },
    sunburst(E) {
      const { r } = E;
      return { back(x, t) {
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2, len = Math.max(E.W, E.H), a = E.fade(t) * 0.16;
        x.save(); x.translate(cx, cy); x.rotate(t * 0.25); x.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 16; i++) {
          x.rotate((Math.PI * 2) / 16);
          const g = x.createLinearGradient(0, 0, len, 0); g.addColorStop(0, `rgba(255,214,90,${a})`); g.addColorStop(1, 'rgba(255,214,90,0)');
          x.fillStyle = g; x.beginPath(); x.moveTo(0, 0); x.lineTo(len, -len * 0.07); x.lineTo(len, len * 0.07); x.closePath(); x.fill();
        }
        x.restore();
      } };
    },
    coins(E) {
      const sp = getCoins(), { r } = E, C = [], G = []; let acc = 0, fi = 0; const fq = FOUNTAINS(E.dur);
      const add = (o) => C.push(Object.assign({ ph: R(0, 6.3), vph: R(7, 15), tilt: R(-0.5, 0.5), sz: R(11, 18), b: 0, dead: 0 }, o));
      return { front(x, t, dt) {
        while (fi < fq.length && t >= fq[fi]) { fi++; const cx = r.left + r.width / 2; for (let i = 0; i < 70; i++) add({ x: cx + R(-20, 20), y: r.top + 8, vx: R(-420, 420), vy: R(-1050, -520), g: 1500 }); }
        if (t < E.dur - 3) { acc += dt * (t < 3.2 ? 64 : 26); const n = Math.floor(acc); acc -= n; for (let i = 0; i < n; i++) add({ x: R(0, E.W), y: R(-60, -20), vx: R(-40, 40), vy: R(180, 380), g: 700 }); }
        for (let i = C.length - 1; i >= 0; i--) {
          const c = C[i];
          c.vy += c.g * dt; c.x += c.vx * dt; c.y += c.vy * dt; c.ph += c.vph * dt;
          if (c.y > E.H - c.sz && c.vy > 0) { if (c.b < 1) { c.vy *= -0.38; c.vx *= 0.6; c.b++; c.y = E.H - c.sz; } else c.dead += dt * 2; }
          if (c.dead >= 1 || c.y > E.H + 60) { C.splice(i, 1); continue; }
          const cs = Math.cos(c.ph), w = Math.max(0.1, Math.abs(cs));
          x.save(); x.globalAlpha = (1 - c.dead) * Math.min(1, E.fade(t) * 1.5); x.translate(c.x, c.y); x.rotate(c.tilt);
          if (w < 0.35) { x.fillStyle = '#8a5a05'; x.fillRect(-c.sz * 0.12, -c.sz, c.sz * 0.24, c.sz * 2); }
          x.drawImage(sp[cs < 0 ? 1 : 0], -c.sz * w, -c.sz, c.sz * 2 * w, c.sz * 2);
          x.restore();
          if (Math.random() < 0.012) G.push({ x: c.x + R(-6, 6), y: c.y + R(-6, 6), a: 0 });
        }
        for (let i = G.length - 1; i >= 0; i--) { const g = G[i]; g.a += dt / 0.35; if (g.a >= 1) { G.splice(i, 1); continue; } star4(x, g.x, g.y, 9 * Math.sin(g.a * Math.PI), Math.sin(g.a * Math.PI), '#fffbe0'); }
      } };
    },
    ball(E) {
      const { r } = E, R0 = 50, cx = r.left + r.width / 2, ty = Math.max(R0 + 30, r.top - R0 - 34);
      E.ballPos = () => ({ x: cx, y: ty });
      const ROWS = 14, COLS = 26;
      return { front(x, t) {
        const p = Math.min(1, t / 0.8), cy = -R0 + (ty + R0) * ease.back(p), a = E.fade(t);
        E.ballPos = () => ({ x: cx, y: cy });
        x.save(); x.globalAlpha = a;
        // linka
        x.strokeStyle = 'rgba(200,200,210,.7)'; x.lineWidth = 1.4; x.beginPath(); x.moveTo(cx, 0); x.lineTo(cx, cy - R0); x.stroke();
        x.fillStyle = '#9aa0a8'; x.fillRect(cx - 5, cy - R0 - 6, 10, 7);
        // kula: kafelki-lustra na obracającej się sferze
        x.save(); x.beginPath(); x.arc(cx, cy, R0, 0, 7); x.clip();
        x.fillStyle = '#2a2c33'; x.fillRect(cx - R0, cy - R0, R0 * 2, R0 * 2);
        const rot = t * 0.9, light = [-0.5, 0.6, 0.62];
        for (let i = 0; i < ROWS; i++) {
          const la0 = -Math.PI / 2 + (i / ROWS) * Math.PI, la1 = la0 + Math.PI / ROWS;
          for (let j = 0; j < COLS; j++) {
            const lo0 = (j / COLS) * Math.PI * 2 + rot, lo1 = lo0 + (Math.PI * 2) / COLS;
            const lm = (la0 + la1) / 2, om = (lo0 + lo1) / 2;
            const nz = Math.cos(lm) * Math.cos(om); if (nz <= 0.02) continue;
            const pt = (la, lo) => [cx + R0 * Math.cos(la) * Math.sin(lo), cy - R0 * Math.sin(la)];
            const q = [pt(la0 + 0.02, lo0 + 0.02), pt(la0 + 0.02, lo1 - 0.02), pt(la1 - 0.02, lo1 - 0.02), pt(la1 - 0.02, lo0 + 0.02)];
            const nx = Math.cos(lm) * Math.sin(om), ny = Math.sin(lm);
            let b = 0.28 + 0.6 * Math.max(0, nx * light[0] + ny * light[1] + nz * light[2]);
            const hsh = Math.sin(i * 12.9898 + j * 78.233 + Math.floor(t * 9) * 3.1) * 43758.5453; const sp = hsh - Math.floor(hsh);
            const hue = (t * 70 + j * 14 + i * 9) % 360;
            x.fillStyle = sp > 0.965 ? '#ffffff' : `hsl(${hue},${sp > 0.86 ? 75 : 12}%,${Math.round(b * 78)}%)`;
            x.beginPath(); x.moveTo(q[0][0], q[0][1]); for (let k = 1; k < 4; k++) x.lineTo(q[k][0], q[k][1]); x.closePath(); x.fill();
          }
        }
        const sh = x.createRadialGradient(cx - R0 * 0.35, cy - R0 * 0.4, R0 * 0.1, cx, cy, R0);
        sh.addColorStop(0, 'rgba(255,255,255,.28)'); sh.addColorStop(0.6, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(0,0,0,.55)');
        x.fillStyle = sh; x.fillRect(cx - R0, cy - R0, R0 * 2, R0 * 2);
        x.restore();
        for (let k = 0; k < 3; k++) { const g = (t * 1.7 + k * 0.33) % 1; star4(x, cx + Math.cos(k * 2.1 + t) * R0 * 0.6, cy + Math.sin(k * 1.7 + t * 1.3) * R0 * 0.5, 10 * Math.sin(g * Math.PI), Math.sin(g * Math.PI)); }
        x.restore();
      } };
    },
    beams(E) {
      const cols = ['#ff2bd6', '#00e5ff', '#ffe600', '#7cff4f', '#a35bff', '#ff7a1a'];
      return { back(x, t) {
        const b = E.ballPos ? E.ballPos() : { x: E.W / 2, y: 60 }, len = Math.hypot(E.W, E.H), a = E.fade(t) * 0.22;
        x.save(); x.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 9; i++) {
          const ang = t * (i % 2 ? 0.7 : -0.55) + i * 0.7 + Math.sin(t * 0.8 + i) * 0.4;
          if (Math.sin(ang) < -0.2) continue;
          const g = x.createLinearGradient(b.x, b.y, b.x + Math.cos(ang) * len, b.y + Math.sin(ang) * len);
          const c = cols[i % cols.length]; g.addColorStop(0, rgba(c, a)); g.addColorStop(0.8, rgba(c, 0));
          x.fillStyle = g; x.beginPath(); x.moveTo(b.x, b.y);
          x.lineTo(b.x + Math.cos(ang - 0.05) * len, b.y + Math.sin(ang - 0.05) * len); x.lineTo(b.x + Math.cos(ang + 0.05) * len, b.y + Math.sin(ang + 0.05) * len); x.closePath(); x.fill();
        }
        x.restore();
      } };
    },
    spots(E) {
      const S = Array.from({ length: 46 }, (_, i) => ({ d: R(0.15, 1), a0: R(0, 6.3), s: R(3, 8), h: (i * 47) % 360 }));
      return { back(x, t) {
        const b = E.ballPos ? E.ballPos() : { x: E.W / 2, y: 60 }, a = E.fade(t), m = Math.max(E.W, E.H) * 0.75;
        x.save(); x.globalCompositeOperation = 'lighter';
        for (const s of S) {
          const ang = s.a0 + t * 0.55, px = b.x + Math.cos(ang) * s.d * m, py = b.y + Math.abs(Math.sin(ang)) * s.d * m * 0.9 + 30;
          const g = x.createRadialGradient(px, py, 0, px, py, s.s * 3); g.addColorStop(0, `hsla(${(s.h + t * 60) % 360},100%,75%,${0.75 * a})`); g.addColorStop(1, 'hsla(0,0%,0%,0)');
          x.fillStyle = g; x.beginPath(); x.arc(px, py, s.s * 3, 0, 7); x.fill();
        }
        x.restore();
      } };
    },
    neon(E) {
      const N = []; let acc = 0;
      const hues = E.custom ? [null] : [320, 190, 55, 280, 140];
      return { front(x, t, dt) {
        if (t < E.dur - 1.2) { acc += dt * 4.2; while (acc >= 1) { acc--; const fromLeft = Math.random() < 0.5; N.push({ x: fromLeft ? -40 : E.W + 40, y: R(E.H * 0.08, E.H * 0.92), vx: (fromLeft ? 1 : -1) * R(520, 900), vy: R(-120, 120), w: R(0, 6), f: R(2, 5), h: hues[Math.floor(Math.random() * hues.length)], tr: [] }); } }
        x.save(); x.globalCompositeOperation = 'lighter'; x.lineCap = 'round'; x.lineJoin = 'round';
        for (let i = N.length - 1; i >= 0; i--) {
          const n = N[i]; n.w += dt * n.f; n.x += n.vx * dt; n.y += (n.vy + Math.sin(n.w * 3) * 160) * dt;
          n.tr.push([n.x, n.y]); if (n.tr.length > 16) n.tr.shift();
          if (n.x < -300 || n.x > E.W + 300) { N.splice(i, 1); continue; }
          const col = n.h === null ? E.col : `hsl(${n.h},100%,62%)`;
          x.beginPath(); x.moveTo(n.tr[0][0], n.tr[0][1]); for (const p of n.tr) x.lineTo(p[0], p[1]);
          x.shadowColor = col; x.shadowBlur = 16; x.strokeStyle = col; x.globalAlpha = 0.85 * E.fade(t); x.lineWidth = 4; x.stroke();
          x.shadowBlur = 0; x.strokeStyle = '#fff'; x.lineWidth = 1.4; x.stroke();
        }
        x.restore();
      } };
    },
    pulse(E) {
      const { r } = E;
      return { front(x, t) {
        const beat = 0.5, k = (t % beat) / beat, hue = (Math.floor(t / beat) * 67) % 360, a = (1 - k) * E.fade(t) * 0.9, g = k * 26;
        x.save(); x.strokeStyle = `hsl(${hue},100%,62%)`; x.shadowColor = x.strokeStyle; x.shadowBlur = 18; x.globalAlpha = a; x.lineWidth = 3;
        const rr = (xx, yy, w, h, rad) => { x.beginPath(); x.moveTo(xx + rad, yy); x.arcTo(xx + w, yy, xx + w, yy + h, rad); x.arcTo(xx + w, yy + h, xx, yy + h, rad); x.arcTo(xx, yy + h, xx, yy, rad); x.arcTo(xx, yy, xx + w, yy, rad); x.closePath(); };
        rr(r.left - 6 - g, r.top - 6 - g, r.width + 12 + g * 2, r.height + 12 + g * 2, 10 + g / 2); x.stroke();
        x.restore();
      } };
    },
    /** Napis „LEGENDA!" + nazwa przedmiotu, w stylu efektu. */
    banner(E) {
      const { r } = E, cx = r.left + r.width / 2;
      const top = E.layers.includes('ball') ? Math.max(36, r.top - 200) : Math.max(46, r.top - 58);
      const st = E.style;
      return { front(x, t) {
        const p = Math.min(1, Math.max(0, (t - 0.25) / 0.55)); if (p <= 0) return;
        const a = E.fade(t) * Math.min(1, p * 1.6), sc = 0.6 + 0.4 * ease.back(p);
        const big = st === 'kasyno' ? 'JACKPOT!' : 'LEGENDA!';
        x.save(); x.translate(cx, top); x.scale(sc, sc); x.globalAlpha = a; x.textAlign = 'center'; x.textBaseline = 'middle';
        if (st === 'thor') {
          x.font = '900 46px Cinzel, Georgia, serif';
          const fl = 0.75 + 0.25 * Math.abs(Math.sin(t * 23));
          x.shadowColor = '#6fb2ff'; x.shadowBlur = 26 * fl; x.fillStyle = '#e8f4ff'; x.fillText(big, 0, 0);
          x.shadowBlur = 0; x.lineWidth = 1.2; x.strokeStyle = '#7fb8ff'; x.strokeText(big, 0, 0);
        } else if (st === 'smoke') {
          x.font = '900 46px Cinzel, Georgia, serif';
          x.filter = `blur(${Math.max(0, (1 - p) * 8)}px)`;
          x.shadowColor = 'rgba(0,0,0,.9)'; x.shadowBlur = 18; x.fillStyle = '#e9ecef'; x.fillText(big, 0, 0);
          x.filter = 'none';
        } else if (st === 'kasyno') {
          x.font = '46px Bungee, Impact, sans-serif';
          const g = x.createLinearGradient(0, -24, 0, 24); g.addColorStop(0, '#fff6c4'); g.addColorStop(0.45, '#ffd34d'); g.addColorStop(0.55, '#e0a10e'); g.addColorStop(1, '#8a5a05');
          x.lineWidth = 7; x.strokeStyle = '#3b2400'; x.strokeText(big, 0, 0);
          x.shadowColor = 'rgba(255,200,60,.8)'; x.shadowBlur = 22; x.fillStyle = g; x.fillText(big, 0, 0); x.shadowBlur = 0;
          const sw = ((t * 0.9) % 1.4) * 520 - 260;
          x.globalCompositeOperation = 'source-atop'; const sg = x.createLinearGradient(sw - 40, 0, sw + 40, 0); sg.addColorStop(0, 'rgba(255,255,255,0)'); sg.addColorStop(0.5, 'rgba(255,255,255,.75)'); sg.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = sg; x.fillText(big, 0, 0); x.globalCompositeOperation = 'source-over';
        } else if (st === 'disco') {
          x.font = '44px Monoton, Impact, sans-serif';
          const on = Math.sin(t * 31) > -0.85 || t > 1.4;
          const hue = (300 + Math.sin(t * 2) * 40) % 360;
          x.shadowColor = `hsl(${hue},100%,60%)`; x.shadowBlur = on ? 28 : 4; x.fillStyle = on ? `hsl(${hue},100%,78%)` : `hsl(${hue},40%,30%)`; x.fillText(big, 0, 0);
          x.shadowBlur = 0; x.lineWidth = 1; x.strokeStyle = 'rgba(0,229,255,.8)'; x.strokeText(big, 0, 0);
        } else {
          x.font = '900 44px Cinzel, Georgia, serif';
          x.shadowColor = E.col; x.shadowBlur = 24; x.fillStyle = '#fff'; x.fillText(big, 0, 0); x.shadowBlur = 0; x.lineWidth = 1.4; x.strokeStyle = E.col; x.strokeText(big, 0, 0);
        }
        if (E.name) {
          x.font = '700 15px Cinzel, Georgia, serif'; x.shadowColor = 'rgba(0,0,0,.95)'; x.shadowBlur = 6;
          x.fillStyle = st === 'kasyno' ? '#ffe9a6' : st === 'disco' ? '#bff8ff' : st === 'thor' ? '#cfe6ff' : '#ffb35c';
          x.fillText(E.name, 0, 36);
        }
        x.restore();
      } };
    },
  };

  /* ── własna grafika / animacja (GIF, PNG, WebP, MP4, WebM) — warstwa „Moja animacja" ── */
  let mediaUrl = null, mediaType = '';
  async function loadMedia() {
    if (mediaUrl) return mediaUrl;
    const rec = await idb.get('media:wlasny').catch(() => null);
    if (!rec || !rec.data) return null;
    mediaType = rec.type || '';
    mediaUrl = URL.createObjectURL(new Blob([rec.data], { type: rec.type }));
    return mediaUrl;
  }
  async function showMedia(E) {
    if (!(E.custom && E.layers.includes('media'))) return;
    const url = await loadMedia(); if (!url || !run) return;
    const cc = cfg.custom || {}, size = Math.max(10, Math.min(100, Number(cc.mediaSize) || 45)) / 100, pos = cc.mediaPos || 'above';
    const vid = /^video\//.test(mediaType);
    const m = el(vid ? 'video' : 'img', { class: 'mp-lg-media', src: url });
    if (vid) { m.muted = true; m.loop = true; m.playsInline = true; m.autoplay = true; }
    const r = E.r, w = pos === 'full' ? E.W : Math.round(E.W * size);
    Object.assign(m.style, { position: 'fixed', zIndex: '2147483001', pointerEvents: 'none', width: w + 'px', height: pos === 'full' ? '100vh' : 'auto', objectFit: pos === 'full' ? 'cover' : 'contain', opacity: '0', transition: 'opacity .5s, transform .6s cubic-bezier(.2,1.4,.4,1)', transform: 'scale(.7)' });
    if (pos === 'full') Object.assign(m.style, { left: '0', top: '0', mixBlendMode: cc.mediaBlend ? 'screen' : 'normal' });
    else if (pos === 'center') Object.assign(m.style, { left: (E.W - w) / 2 + 'px', top: '50%', translate: '0 -50%' });
    else Object.assign(m.style, { left: Math.max(0, Math.min(E.W - w, r.left + r.width / 2 - w / 2)) + 'px', bottom: (E.H - r.top + 8) + 'px' });
    document.body.appendChild(m);
    run.media = m;
    requestAnimationFrame(() => { m.style.opacity = '1'; m.style.transform = 'scale(1)'; });
    if (vid) m.play().catch(() => {});
    setTimeout(() => { if (m.isConnected) m.style.opacity = '0'; }, Math.max(500, E.dur * 1000 - 700));
  }

  /* ═════════════════ odtwarzanie ═════════════════ */
  let run = null;
  /** Okna łupu gry: po klasie albo po nagłówku „Łup…" (okno gry .c-window). */
  function lootWindows() {
    const set = new Set($$(LOOT_SEL));
    for (const w of $$('.c-window')) { const h = w.querySelector('.header-label .text, .header-label'); if (h && /^\s*łup/i.test(h.textContent || '')) set.add(w); }
    return [...set].filter((w) => isVisible(w) && !w.closest('#mp-panel, .mp-glass, .mp-lg-fake'));
  }
  function lootWindow() { const ws = lootWindows(); return ws[ws.length - 1] || null; }

  /* ── podświetlenie legendarnych przedmiotów w oknie łupu (zostaje, dopóki okno jest otwarte) ── */
  function hlClass() { return 'mp-lg-hl ' + (STYLES[cfg.style] ? cfg.style : 'thor') + ' m-' + (cfg.hlMode || 'ring'); }
  /** „Okienko" przedmiotu w oknie łupu: największy przodek kafelka, który zawiera tylko ten jeden przedmiot. */
  function cardOf(it) {
    let n = it;
    const iw = it.getBoundingClientRect().width || 32;
    while (n.parentElement) {
      const p = n.parentElement;
      if (p.matches('.c-window, .content, .inner-content, .mp-lg-fake, .mp-lg-fake-b, [class*="scroll"], body') || $$('.item', p).length > 1) break;
      if (p.getBoundingClientRect().width > iw * 4.5) break;
      n = p;
    }
    return n;
  }
  function markItem(it) {
    if (!it) return;
    if ((cfg.hlMode || 'ring') === 'none') return;
    const card = cardOf(it);
    let h = card.querySelector(':scope > .mp-lg-hl');
    if (!h) {
      if (getComputedStyle(card).position === 'static') card.style.position = 'relative';
      h = el('div'); card.appendChild(h);
    }
    h.className = hlClass();
    h.style.setProperty('--lgc', cfg.style === 'wlasny' ? ((cfg.custom && cfg.custom.color) || '#ff9a1f') : STYLES[cfg.style] ? STYLES[cfg.style].col : '#8fc4ff');
  }
  function markWindow(win, test) {
    if (!win) return;
    const items = $$('.item', win);
    let any = false;
    for (const it of items) if (it.dataset.mpLg) { markItem(it); any = true; }
    if (!any && test && items[0]) markItem(items[0]);
  }
  function canvas(z, before) {
    const c = el('canvas', { class: 'mp-lg-cv', style: { position: 'fixed', left: '0', top: '0', width: '100vw', height: '100vh', pointerEvents: 'none', zIndex: String(z) } });
    c.width = innerWidth; c.height = innerHeight;
    if (before && before.parentElement) before.parentElement.insertBefore(c, before); else document.body.appendChild(c);
    return c;
  }
  function stopFx() {
    if (!run) return;
    cancelAnimationFrame(run.raf); run.cvs.forEach((c) => c.remove()); if (run.fake) run.fake.remove();
    if (run.media) run.media.remove();
    if (run.win) run.win.classList.remove('mp-lg-win', 'thor', 'smoke', 'kasyno', 'disco', 'wlasny');
    if (run.test) $$('.mp-lg-hl.test').forEach((h) => h.remove());
    if (run.dim) $$('.mp-glass').forEach((g) => { g.style.transition = 'opacity .4s'; g.style.opacity = ''; });
    try { run.stopSnd && run.stopSnd(); } catch {}
    run = null;
  }
  /** Okno łupu „na niby" do testu: kilka losowych przedmiotów (zwykłe, unikaty, heroiki, legendy), jak w grze. */
  const RAR = { common: ['Zwykły', '#9a9a9a'], unique: ['Unikatowy', '#e6c13b'], heroic: ['Heroiczny', '#3fa2ff'], legendary: ['Legendarny', '#ff8a1f'] };
  function fakeLoot() {
    const n = 3 + Math.floor(Math.random() * 3);
    const rars = Array.from({ length: n }, () => ['common', 'common', 'unique', 'heroic', 'legendary'][Math.floor(Math.random() * 5)]);
    if (!rars.includes('legendary')) rars[Math.floor(Math.random() * n)] = 'legendary';
    const cards = rars.map((r) => {
      const it = el('div', { class: 'item mp-lg-fake-item', style: { '--rc': RAR[r][1] }, title: RAR[r][0] });
      if (r === 'legendary') it.dataset.mpLg = '1';
      return el('div', { class: 'mp-lg-fake-card' }, it, el('div', { class: 'mp-lg-fake-want' }, 'Chcę'), el('div', { class: 'mp-lg-fake-btns' }, el('i', null, '✓'), el('i', null, '✕')));
    });
    const f = el('div', { class: 'mp-lg-fake' }, el('div', { class: 'mp-lg-fake-h' }, 'Łupy'), el('div', { class: 'mp-lg-fake-b' }, cards), el('div', { class: 'mp-lg-fake-f' }, el('span', null, '10 s'), el('b', null, 'Potwierdź'), el('span', null, '10 m')));
    document.body.appendChild(f);
    return f;
  }

  async function play(styleKey, opts = {}) {
    stopFx();
    const st = STYLES[styleKey] ? styleKey : 'thor';
    const custom = st === 'wlasny';
    const cc = cfg.custom || {};
    const layers = custom ? ['shade'].concat((cc.layers || []).filter((l) => l !== 'flash' && l !== 'banner'), (cc.layers || []).includes('flash') ? ['flash'] : [], (cc.layers || []).includes('banner') ? ['banner'] : []) : PRESET_LAYERS[st];
    if (custom && (cc.layers || []).includes('ball') && !layers.includes('spots')) layers.splice(layers.indexOf('ball'), 0, 'spots');
    const dur = durOf();
    STRIKES = strikesFor(dur);
    let win = lootWindow(), fake = null;
    if (!win && opts.test) { fake = fakeLoot(); win = fake; }
    const rect = win ? win.getBoundingClientRect() : { left: innerWidth / 2 - 130, top: innerHeight / 2 - 80, width: 260, height: 160, right: innerWidth / 2 + 130, bottom: innerHeight / 2 + 80 };
    // tylna warstwa tuż pod oknem łupu (w tym samym kontekście warstw), żeby dym i światła były ZA oknem
    let zb = 2147480000;
    if (win && !fake) { zb = 0; try { const zz = parseInt(getComputedStyle(win).zIndex, 10); if (zz > 0) zb = zz - 1; } catch {} }
    const back = canvas(zb, win && !fake ? win : null);
    const front = canvas(2147483000);
    const E = {
      W: innerWidth, H: innerHeight, r: { left: rect.left, top: rect.top, width: rect.width, height: rect.height, right: rect.left + rect.width, bottom: rect.top + rect.height },
      dur, col: custom ? (cc.color || '#7c5cff') : STYLES[st].col, name: '', layers, style: custom ? 'wlasny' : st, custom,
      fade: (t) => Math.min(1, t / 0.3) * Math.min(1, Math.max(0, (dur - t) / 0.9)),
    };
    const parts = layers.map((k) => L[k] && L[k](E)).filter(Boolean);   // „media" to element strony, nie warstwa płótna
    const bx = back.getContext('2d'), fx = front.getContext('2d');
    const me = { cvs: [back, front], fake, raf: 0, stopSnd: null, dim: !!opts.test, test: !!opts.test, win: win && !fake ? win : null };
    // okno łupu zostaje jak w grze — wyróżniamy tylko okienka z legendami (zostają do zamknięcia okna)
    if (win) {
      win.style.setProperty('--lgc', E.col);
      const before = new Set($$('.mp-lg-hl', win));
      markWindow(win, !!opts.test);
      if (opts.test && !fake) $$('.mp-lg-hl', win).forEach((h) => { if (!before.has(h)) h.classList.add('test'); });
    }
    showMedia(E);
    // przy teście panel przygasa, żeby było widać cały efekt
    if (me.dim) $$('.mp-glass').forEach((g) => { g.style.transition = 'opacity .3s'; g.style.opacity = '0.12'; });
    run = me;
    try { await document.fonts.load('900 40px Cinzel'); await Promise.all(['40px Bungee', '40px Monoton'].map((f) => document.fonts.load(f))); } catch {}
    if (run !== me) return;
    playSound(st, dur * 1000).then((s) => { if (run === me) me.stopSnd = s; else s(); }).catch(() => {});
    const t0 = performance.now(); let last = t0;
    const frame = (n) => {
      if (run !== me) return;
      const t = (n - t0) / 1000, dt = Math.min(0.05, (n - last) / 1000); last = n;
      if (t > dur) { stopFx(); return; }
      bx.clearRect(0, 0, E.W, E.H); fx.clearRect(0, 0, E.W, E.H);
      for (const p of parts) { try { if (p.back) p.back(bx, t, dt); } catch (e) { console.warn('[L4Tools] legenda', e); } }
      for (const p of parts) { try { if (p.front) p.front(fx, t, dt); } catch (e) { console.warn('[L4Tools] legenda', e); } }
      me.raf = requestAnimationFrame(frame);
    };
    me.raf = requestAnimationFrame(frame);
  }

  /* ═════════════════ wykrywanie legendy w łupie ═════════════════ */
  const seen = new Map();
  function fresh(id) {
    const n = now();
    for (const [k, t] of seen) if (n - t > 15 * 60000) seen.delete(k);
    if (seen.has(id)) return false;
    seen.set(id, n); return true;
  }
  let pending = null;
  const legendIds = new Set();      // legendy znane z danych serwera — podświetlimy je, gdy okno łupu się pojawi
  function trigger(id, name, win) {
    if (!cfg.enabled || !fresh(String(id))) return;
    // kolejna legenda w tym samym oknie łupu, gdy efekt już trwa — tylko podświetlenie, bez restartu efektu
    if (run && run.win && win && run.win === win) return;
    if (pending) { pending.names.push(name); return; }
    pending = { names: [name] };
    // chwila na otwarcie okna łupu, żeby efekt wiedział, gdzie ono jest
    let tries = 0;
    const go = () => {
      if (!lootWindow() && tries++ < 8) { setTimeout(go, 120); return; }
      pending = null;
      play(cfg.style, {});
    };
    setTimeout(go, 60);
  }
  function isLegendNode(n) {
    const c = String(n.className || '');
    if (/\bt-leg\b|legendary|\blegend\b/i.test(c)) return true;
    const id = game.itemIdFromEl(n);
    const it = id ? game.itemById(id) : null;
    if (it && it.rarity === 'legendary') return true;
    try { const raw = id && E() && E().items && E().items.getItemById && E().items.getItemById(id); if (raw && /rarity=legendary/.test(String(raw.stat || ''))) return true; } catch {}
    return false;
  }
  function scanDom() {
    if (!cfg.enabled) return;
    for (const w of lootWindows()) for (const it of $$('.item', w)) {
      if (it.dataset.mpLg) { if (!it.querySelector(':scope > .mp-lg-hl')) markItem(it); continue; }
      const id = game.itemIdFromEl(it);
      if (!id) continue;
      if (isLegendNode(it) || legendIds.has(String(id))) { it.dataset.mpLg = '1'; markItem(it); trigger(id, '', w); }
    }
  }
  function onData(d) {
    if (!cfg.enabled || !d || !d.item || typeof d.item !== 'object') return;
    const lootish = !!(d.loot || d.loots);
    for (const [id, it] of Object.entries(d.item)) {
      if (!it || typeof it !== 'object') continue;
      if (!(lootish || it.loc === 'l')) continue;
      if (!(/rarity=legendary/.test(String(it.stat || '')) || (it.stat && it.stat.rarity === 'legendary'))) continue;
      const lid = String(it.id || id);
      legendIds.add(lid);
      // efekt odpala się dopiero, gdy przedmiot pojawi się w oknie łupu (scanDom). Zapas: dane wprost mówią, że to łup
      // (loc „l"), a okna łupu nie widać — wtedy efekt i tak startuje.
      if (it.loc === 'l') setTimeout(() => { if (!seen.has(lid) && !lootWindow()) trigger(lid, ''); }, 1500);
    }
  }

  /* ═════════════════ panel ═════════════════ */
  const ICON = {
    thor: '<path d="M13 2 5 13h6l-1 9 8-12h-6l1-8z"/>',
    smoke: '<path d="M6 17a4 4 0 0 1 .5-8 5 5 0 0 1 9.6-1.4A4 4 0 1 1 18 17H6z"/><path d="M8 21h8" />',
    kasyno: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="5"/><path d="M12 9v6"/>',
    disco: '<path d="M12 1v4"/><circle cx="12" cy="13" r="7"/><path d="M5 13h14M12 6c2 2 2 12 0 14M12 6c-2 2-2 12 0 14"/>',
    wlasny: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
  };
  const svgI = (k) => el('span', { class: 'mp-lg-ico', html: `<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${ICON[k]}</svg>` });

  let lastSnd = null;
  const b64 = (buf) => { let s = ''; const u = new Uint8Array(buf); for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
  const unb64 = (str) => { const s = atob(str); const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u.buffer; };
  /** Eksport własnego efektu do pliku .json (ustawienia + Twoja animacja i dźwięk, jeśli są). */
  async function exportOwn() {
    const out = { l4tools: 'legenda', v: 1, custom: cfg.custom, dur: cfg.dur, volume: cfg.volume };
    const m = await idb.get('media:wlasny').catch(() => null); if (m && m.data) out.media = { name: m.name, type: m.type, data: b64(m.data) };
    const a = await idb.get('snd:wlasny').catch(() => null); if (a && a.data) out.sound = { name: a.name, size: a.size, data: b64(a.data) };
    const link = el('a', { href: URL.createObjectURL(new Blob([JSON.stringify(out)], { type: 'application/json' })), download: 'legendarny-lup-efekt.json' });
    document.body.appendChild(link); link.click(); link.remove();
  }
  function importOwn(done) {
    const inp = el('input', { type: 'file', accept: '.json,application/json', style: { display: 'none' } });
    inp.addEventListener('change', async () => {
      const f = inp.files && inp.files[0]; inp.remove(); if (!f) return;
      try {
        const o = JSON.parse(await f.text());
        if (!o || o.l4tools !== 'legenda' || !o.custom) throw new Error('to nie jest plik efektu Legendarnego Łupu');
        cfg.custom = Object.assign({}, cfg.custom, o.custom); if (o.dur) cfg.dur = o.dur;
        if (o.media) { await idb.put('media:wlasny', { name: o.media.name, type: o.media.type, data: unb64(o.media.data) }); if (mediaUrl) URL.revokeObjectURL(mediaUrl); mediaUrl = null; }
        if (o.sound) { await idb.put('snd:wlasny', { name: o.sound.name, size: o.sound.size, data: unb64(o.sound.data) }); delete bufCache.wlasny; }
        cfg.style = 'wlasny'; config.save(); toast('Legendarny Łup: zaimportowano efekt'); done();
      } catch (e) { toast('Legendarny Łup: nie udało się wczytać pliku — ' + e.message, 'warn'); }
    });
    document.body.appendChild(inp); inp.click();
  }
  function pickMedia(done) {
    const inp = el('input', { type: 'file', accept: 'image/*,video/mp4,video/webm,.gif,.png,.webp,.apng,.mp4,.webm', style: { display: 'none' } });
    inp.addEventListener('change', async () => {
      const f = inp.files && inp.files[0]; inp.remove(); if (!f) return;
      if (f.size > 25 * 1024 * 1024) { toast('Legendarny Łup: plik jest za duży (max 25 MB)', 'warn'); return; }
      await idb.put('media:wlasny', { name: f.name, type: f.type || (/\.(mp4)$/i.test(f.name) ? 'video/mp4' : /\.webm$/i.test(f.name) ? 'video/webm' : 'image/gif'), data: await f.arrayBuffer() });
      if (mediaUrl) URL.revokeObjectURL(mediaUrl); mediaUrl = null;
      const cc = cfg.custom; if (!cc.layers.includes('media')) cc.layers = cc.layers.concat('media');
      config.save(); toast(`Legendarny Łup: wgrano „${f.name}"`); done();
    });
    document.body.appendChild(inp); inp.click();
  }
  async function ownInfo(key) { try { const r = await idb.get('snd:' + key); return r ? { name: r.name, size: r.size } : null; } catch { return null; } }
  function pickFile(key, done) {
    const inp = el('input', { type: 'file', accept: 'audio/*,.mp3,.ogg,.wav,.m4a', style: { display: 'none' } });
    inp.addEventListener('change', async () => {
      const f = inp.files && inp.files[0]; inp.remove(); if (!f) return;
      if (f.size > 15 * 1024 * 1024) { toast('Legendarny Łup: plik jest za duży (max 15 MB)', 'warn'); return; }
      const data = await f.arrayBuffer();
      const a = ac(); const ok = a ? await a.decodeAudioData(data.slice(0)).then(() => true).catch(() => false) : false;
      if (!ok) { toast('Legendarny Łup: nie da się odtworzyć tego pliku — użyj mp3, ogg albo wav', 'warn'); return; }
      await idb.put('snd:' + key, { name: f.name, size: f.size, data });
      delete bufCache[key];
      cfg.sounds = cfg.sounds || {}; cfg.sounds[key] = 'own'; config.save();
      toast(`Legendarny Łup: wgrano „${f.name}"`);
      done();
    });
    document.body.appendChild(inp); inp.click();
  }

  defineAddon({
    id: 'legenda', name: 'Legendarny Łup', icon: 'legenda', color: ['#ff9a1f', '#ff3d6e'], renderFirst: true,
    desc: 'Gdy w łupie trafi się przedmiot legendarny — efekt na cały ekran z dźwiękiem: Thor, Smoke, Kasyno, Disco albo Twój własny. Każdy styl ma wbudowany dźwięk i może mieć Twój plik dźwiękowy. Przycisk „Test" pokazuje efekt od razu.',
    defaults: { enabled: false, style: 'thor', volume: 0.7, dur: 15, hlMode: 'ring', sounds: {}, custom: { layers: ['flash', 'glow', 'neon', 'banner'], color: '#ff9a1f', dur: 6.5, sound: 'kasyno' } },
    settings: [],
    notes: () => [{ type: 'info', text: 'Wymaga włączonej opcji gry <b>Podświetlenie okna łupów</b> (Konfiguracja → Ustawienia gry → Wygląd → Łupy). Efekt działa tylko dla przedmiotów <b>legendarnych</b>.' }],
    render(box, c, rerender) {
      // style
      const grid = el('div', { class: 'mp-lg-grid' });
      for (const [k, s] of Object.entries(STYLES)) {
        grid.appendChild(el('div', { class: 'mp-lg-card' + (c.style === k ? ' on' : ''), style: { '--a': s.grad[0], '--b': s.grad[1], '--c': s.col }, onclick: () => { c.style = k; config.save(); rerender(); } },
          el('div', { class: 'mp-lg-art ' + k }, svgI(k)),
          el('div', { class: 'mp-lg-name' }, s.name),
          el('div', { class: 'mp-lg-desc' }, s.desc),
          el('button', { class: 'mp-btn mp-lg-test', onclick: (e) => { e.stopPropagation(); play(k, { test: true }); } }, 'Test')));
      }
      box.appendChild(el('div', { class: 'mp-card' }, el('h3', null, 'Styl efektu'), grid));
      const HL = [['ring', 'Obwódka w okienku'], ['glow', 'Obwódka + poświata'], ['pulse', 'Pulsujące tło'], ['none', 'Bez wyróżnienia']];
      box.appendChild(el('div', { class: 'mp-card' }, el('h3', null, 'Wyróżnienie okienka z legendą'),
        el('div', { class: 'mp-dim', style: { marginBottom: '6px' } }, 'Okno łupu zostaje takie jak w grze — wyróżnione jest tylko okienko z legendą, w kolorach wybranego stylu. Wyróżnienie mieści się w okienku, więc kilka legend obok siebie nie nachodzi na siebie.'),
        el('div', { class: 'mp-btns' }, HL.map(([v, l]) => el('button', { class: 'mp-upchip' + ((c.hlMode || 'ring') === v ? ' on' : ''), onclick: () => { c.hlMode = v; config.save(); rerender(); } }, l)))));

      // dźwięk wybranego stylu
      const k = c.style, S = STYLES[k];
      const sc = el('div', { class: 'mp-card' }, el('h3', null, `Dźwięk — ${S.name}`));
      const vol = el('input', { class: 'mp-range', type: 'range', min: 0, max: 1, step: 0.05, value: c.volume ?? 0.7 });
      const paint = () => vol.style.setProperty('--p', vol.value * 100 + '%'); paint();
      vol.addEventListener('input', () => { paint(); c.volume = Number(vol.value); });
      vol.addEventListener('change', () => config.save());
      sc.appendChild(el('div', { class: 'mp-lg-row' }, el('span', { class: 'mp-dim', style: { width: '90px' } }, 'Głośność'), vol));
      const dr = el('input', { class: 'mp-range', type: 'range', min: 5, max: 20, step: 1, value: durOf() });
      const dOut = el('span', { class: 'mp-dim', style: { width: '40px', textAlign: 'right' } }, `${durOf()} s`);
      const pd = () => dr.style.setProperty('--p', ((dr.value - 5) / 15) * 100 + '%'); pd();
      dr.addEventListener('input', () => { pd(); dOut.textContent = dr.value + ' s'; c.dur = Number(dr.value); });
      dr.addEventListener('change', () => config.save());
      sc.appendChild(el('div', { class: 'mp-lg-row' }, el('span', { class: 'mp-dim', style: { width: '90px' } }, 'Czas trwania'), dr, dOut));
      if (k === 'wlasny') {
        const cc = c.custom = Object.assign({ layers: [], color: '#ff9a1f', dur: 6.5, sound: 'kasyno' }, c.custom || {});
        const sel = el('select', { class: 'mp-in' }, SOUND_KEYS.map(([v, l]) => { const o = el('option', { value: v }, l); if (cc.sound === v) o.selected = true; return o; }));
        sel.addEventListener('change', () => { cc.sound = sel.value; config.save(); rerender(); });
        sc.appendChild(el('div', { class: 'mp-lg-row' }, el('span', { class: 'mp-dim', style: { width: '90px' } }, 'Dźwięk'), sel));
      }
      const soundRow = el('div', { class: 'mp-lg-snd' });
      sc.appendChild(soundRow);
      const showOwn = k !== 'wlasny' || (c.custom && c.custom.sound === 'own');
      (async () => {
        const info = await ownInfo(k);
        const mode = (c.sounds && c.sounds[k]) || 'default';
        if (k !== 'wlasny') {
          soundRow.appendChild(el('div', { class: 'mp-btns' },
            el('button', { class: 'mp-upchip' + (mode !== 'own' || !info ? ' on' : ''), onclick: () => { c.sounds = c.sounds || {}; c.sounds[k] = 'default'; config.save(); rerender(); } }, 'Domyślny (wbudowany)'),
            info ? el('button', { class: 'mp-upchip' + (mode === 'own' ? ' on' : ''), onclick: () => { c.sounds = c.sounds || {}; c.sounds[k] = 'own'; config.save(); rerender(); } }, `Własny: ${info.name}`) : null));
        }
        if (showOwn) {
          soundRow.appendChild(el('div', { class: 'mp-btns' },
            el('button', { class: 'mp-btn', onclick: () => pickFile(k, rerender) }, info ? 'Zmień własny plik' : 'Wgraj własny plik'),
            info ? el('button', { class: 'mp-btn bad', onclick: async () => { await idb.del('snd:' + k).catch(() => {}); delete bufCache[k]; if (c.sounds) c.sounds[k] = 'default'; config.save(); toast('Legendarny Łup: usunięto własny dźwięk'); rerender(); } }, 'Usuń własny') : null));
          soundRow.appendChild(el('div', { class: 'mp-dim', style: { marginTop: '6px' } }, 'mp3, ogg lub wav (do 15 MB). Plik zostaje tylko w tej przeglądarce. Dźwięk wbudowany zostaje zawsze — możesz do niego wrócić.'));
        }
      })();
      sc.appendChild(el('div', { class: 'mp-btns' },
        el('button', { class: 'mp-btn pri', onclick: () => play(k, { test: true }) }, 'Test efektu'),
        el('button', { class: 'mp-btn', onclick: () => { stopFx(); playSound(k, durOf() * 1000).then((st) => { lastSnd = st; }); } }, 'Odsłuchaj dźwięk'),
        el('button', { class: 'mp-btn', onclick: () => { stopFx(); if (lastSnd) { lastSnd(); lastSnd = null; } } }, 'Zatrzymaj')));
      box.appendChild(sc);

      // własny styl
      if (k === 'wlasny') {
        const cc = c.custom;
        const chips = el('div', { class: 'mp-btns' }, LAYERS.map(([lk, ln]) => el('button', { class: 'mp-upchip' + (cc.layers.includes(lk) ? ' on' : ''), onclick: () => { cc.layers = cc.layers.includes(lk) ? cc.layers.filter((x) => x !== lk) : cc.layers.concat(lk); config.save(); rerender(); } }, ln)));
        const col = el('input', { class: 'mp-color', type: 'color', value: cc.color || '#ff9a1f' });
        col.addEventListener('change', () => { cc.color = col.value; config.save(); });
        const minfo = el('div', { class: 'mp-dim', style: { margin: '4px 0' } }, '…');
        idb.get('media:wlasny').then((m) => { minfo.textContent = m ? `Twoja animacja: ${m.name}` : 'Nie wgrano jeszcze animacji (GIF, PNG, WebP, MP4, WebM — do 25 MB).'; }).catch(() => {});
        const posSel = el('select', { class: 'mp-in' }, [['above', 'Nad oknem łupu'], ['center', 'Na środku ekranu'], ['full', 'Cały ekran']].map(([v, l]) => { const o = el('option', { value: v }, l); if ((cc.mediaPos || 'above') === v) o.selected = true; return o; }));
        posSel.addEventListener('change', () => { cc.mediaPos = posSel.value; config.save(); });
        const ms = el('input', { class: 'mp-range', type: 'range', min: 10, max: 100, step: 5, value: cc.mediaSize || 45 });
        const pm = () => ms.style.setProperty('--p', ((ms.value - 10) / 90) * 100 + '%'); pm();
        ms.addEventListener('input', () => { pm(); cc.mediaSize = Number(ms.value); }); ms.addEventListener('change', () => config.save());
        box.appendChild(el('div', { class: 'mp-card' }, el('h3', null, 'Twoje powiadomienie — import'),
          el('div', { class: 'mp-dim', style: { marginBottom: '6px' } }, 'Wgraj własną grafikę lub animację, która pojawi się przy legendzie (warstwa „Moja animacja”). Gotowy efekt możesz zapisać do pliku i wczytać na innym komputerze albo dać znajomym.'),
          minfo,
          el('div', { class: 'mp-btns' },
            el('button', { class: 'mp-btn', onclick: () => pickMedia(rerender) }, 'Wgraj animację / grafikę'),
            el('button', { class: 'mp-btn bad', onclick: async () => { await idb.del('media:wlasny').catch(() => {}); if (mediaUrl) URL.revokeObjectURL(mediaUrl); mediaUrl = null; cc.layers = cc.layers.filter((x) => x !== 'media'); config.save(); rerender(); } }, 'Usuń animację')),
          el('div', { class: 'mp-lg-row', style: { marginTop: '8px' } }, el('span', { class: 'mp-dim', style: { width: '90px' } }, 'Położenie'), posSel),
          el('div', { class: 'mp-lg-row' }, el('span', { class: 'mp-dim', style: { width: '90px' } }, 'Wielkość'), ms),
          el('div', { class: 'mp-btns' },
            el('button', { class: 'mp-btn', onclick: () => importOwn(rerender) }, 'Importuj efekt (.json)'),
            el('button', { class: 'mp-btn', onclick: exportOwn }, 'Eksportuj efekt (.json)'))));
        box.appendChild(el('div', { class: 'mp-card' }, el('h3', null, 'Twój efekt'),
          el('div', { class: 'mp-dim', style: { marginBottom: '6px' } }, 'Warstwy efektu — włącz dowolne:'), chips,
          el('div', { class: 'mp-lg-row', style: { marginTop: '10px' } }, el('span', { class: 'mp-dim', style: { width: '90px' } }, 'Kolor'), col)));
      }
    },
    init(c) {
      cfg = c;
      c.sounds = c.sounds || {};
      if (!document.querySelector(`link[href="${FONTS}"]`)) document.head.appendChild(el('link', { rel: 'stylesheet', href: FONTS }));
      bus.on('data', onData);
      const scan = debounce(scanDom, 80);
      new MutationObserver(() => { if (cfg.enabled) scan(); }).observe(document.body, { childList: true, subtree: true });
      MP.legenda = { play, stop: stopFx, STYLES, SOUND };
    },
    onToggle(on) { if (!on) stopFx(); },
  });
})();
