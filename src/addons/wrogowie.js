/* ───────── Wrogowie na mapie ─────────
 * Na czerwonych mapach (pełne PvP) pokazuje komunikat gry „Wróg na mapie: Nick", gdy pojawi się wróg:
 * gracz oznaczony jako wróg, członek wrogiego klanu, a opcjonalnie także gracze neutralni (bez relacji).
 * Nigdy: znajomi, klan, sojusznicy, członkowie grupy i gracze chronieni w Bratanie.
 * Ten sam gracz znowu dopiero, gdy zniknie z mapy i wróci (najwcześniej po minucie).
 */
(() => {
  let cfg, timer = null, mapId = 0;
  const seen = new Map();      // id → ostatnio widziany (ms)
  const told = new Map();      // id → kiedy powiadomiono (ms)

  /** Czerwona mapa = pełne PvP. Gra opisuje typ mapy liczbą (pole pvp). */
  function isRed() {
    const m = game.mapInfo();
    return (cfg.pvpCodes || [2]).map(Number).includes(Number(m.pvp));
  }
  function protectedByBratan(p) {
    try { const b = addons.cfg('bratan'); return !!(b && b.enabled && (b.nicks || []).some((n) => String(n).toLowerCase() === p.nick.toLowerCase())); } catch { return false; }
  }
  function isEnemy(p, party) {
    if (p.isFriend || p.isClan || p.isAlly || party.has(p.id) || protectedByBratan(p)) return false;
    const rel = String(p.relation || '');
    if (rel === '3') return !!cfg.personal;                  // osobisty wróg
    if (rel === '6' || rel === '8') return !!cfg.enemyClans;  // wrogi klan / frakcja
    if (p.isEnemyTagged) return true;
    return !!cfg.neutral;                                     // brak relacji — „random"
  }
  /** Komunikat gry w wybranym kolorze (tylko ten komunikat, inne zostają bez zmian). */
  function notify(text) {
    toast(text, 'warn', 5000);
    const paint = () => {
      const n = $$('.big-messages .message, .message, .mp-toast').reverse().find((x) => (x.textContent || '').trim() === text && !x.__mpWr);
      if (!n) return false;
      n.__mpWr = true;
      n.style.setProperty('color', cfg.color || '#ff4b3e', 'important');
      $$('*', n).forEach((c) => c.style.setProperty('color', cfg.color || '#ff4b3e', 'important'));
      return true;
    };
    if (!paint()) { requestAnimationFrame(() => { if (!paint()) setTimeout(paint, 60); }); }
  }
  function tick() {
    if (!cfg.enabled || !game.ready()) return;
    const m = game.mapInfo();
    if (m.id !== mapId) { mapId = m.id; seen.clear(); told.clear(); }
    if (!isRed()) return;
    const t = now();
    const party = new Set(game.partyMembers().map(Number));
    const fresh = [];
    for (const p of game.others()) {
      if (!isEnemy(p, party)) continue;
      const wasHere = seen.has(p.id) && t - seen.get(p.id) < 5000;
      seen.set(p.id, t);
      if (wasHere) continue;
      if (told.has(p.id) && t - told.get(p.id) < 60000) continue;
      told.set(p.id, t);
      fresh.push(p);
    }
    fresh.slice(0, 5).forEach((p) => {
      notify(`Wróg na mapie: ${p.nick}${cfg.showLvl ? ` (${p.lvl}${p.prof || ''})` : ''}${p.clanName ? ` [${p.clanName}]` : ''}`);
      // opcjonalnie: wiadomość na czat klanu (treść do edycji)
      if (cfg.clanChat && MP.betaSound) MP.betaSound.chat('CLAN', MP.betaSound.fill(cfg.text, { 'Nick Gracza': p.nick, 'Nazwa Klanu': p.clanName || 'brak klanu', 'Mapa': m.name, 'Poziom': p.lvl, 'Profesja': p.prof || '' }));
    });
    if (fresh.length && MP.betaSound) MP.betaSound.playSound('wrog', 'alarm', cfg.volume ?? 0.7, cfg.sound || 'default');
    if (fresh.length > 5) notify(`Wrogów na mapie: jeszcze ${fresh.length - 5}`);
  }

  defineAddon({
    id: 'wrogowie', name: 'Wrogowie na mapie', icon: 'wrogowie', color: ['#ff6a5c', '#c0392b'],
    desc: 'Na czerwonych mapach daje znać, gdy pojawi się wróg — z nickiem i klanem. Może też od razu napisać o tym na czacie klanowym i zagrać dźwięk. Znajomi, klan, sojusznicy i Twoja grupa nigdy nie są zgłaszani.',
    defaults: { personal: true, enemyClans: true, neutral: false, showLvl: false, pvpCodes: [2], color: '#ff4b3e', clanChat: false, text: 'Wróg! {Nick Gracza} z klanu {Nazwa Klanu} w lokalizacji {Mapa}', sound: 'default', volume: 0.7 },
    settings: [
      { key: 'enemyClans', type: 'bool', label: 'Wrogie klany' },
      { key: 'personal', type: 'bool', label: 'Gracze oznaczeni jako wrogowie' },
      { key: 'neutral', type: 'bool', label: 'Gracze neutralni (bez relacji) też jako wrogowie' },
      { key: 'showLvl', type: 'bool', label: 'Pokazuj poziom i profesję przy nicku' },
      { key: 'color', type: 'color', label: 'Kolor czcionki powiadomienia' },
      { key: 'clanChat', type: 'bool', label: 'Wysyłaj wiadomość na czat klanu' },
      { key: 'text', type: 'text', label: 'Treść wiadomości na klan', hint: 'Zmienne: {Nick Gracza} {Nazwa Klanu} {Mapa} {Poziom} {Profesja}' },
      { key: 'volume', type: 'range', label: 'Głośność dźwięku', min: 0, max: 1, step: 0.05 },
      { key: '_snd', type: 'custom', render: (o, s) => (MP.betaSound ? MP.betaSound.soundField('wrog', 'alarm').render(o, s) : el('span')) },
    ],
    init(c) {
      cfg = c;
      timer = setInterval(tick, 1000);
      MP.wrogowie = { debug: () => ({ mapa: game.mapInfo(), czerwona: isRed() }) };
    },
    onChange(k) { if (k === 'color') notify('Wróg na mapie: Przykład [Wrogi Klan]'); },
    onToggle(on) { if (on) { seen.clear(); told.clear(); mapId = 0; } },
  });
})();
