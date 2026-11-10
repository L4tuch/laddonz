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
    fresh.slice(0, 5).forEach((p) => toast(`Wróg na mapie: ${p.nick}${cfg.showLvl ? ` (${p.lvl}${p.prof || ''})` : ''}`, 'warn', 5000));
    if (fresh.length > 5) toast(`Wrogów na mapie: jeszcze ${fresh.length - 5}`, 'warn', 5000);
  }

  defineAddon({
    id: 'wrogowie', name: 'Wrogowie na mapie', icon: 'wrogowie', color: ['#ff6a5c', '#c0392b'],
    desc: 'Na czerwonych mapach pokazuje komunikat „Wróg na mapie: Nick", gdy pojawi się wróg. Znajomi, klan, sojusznicy, grupa i gracze z listy Bratana nigdy nie są zgłaszani.',
    defaults: { personal: true, enemyClans: true, neutral: false, showLvl: false, pvpCodes: [2] },
    settings: [
      { key: 'enemyClans', type: 'bool', label: 'Wrogie klany' },
      { key: 'personal', type: 'bool', label: 'Gracze oznaczeni jako wrogowie' },
      { key: 'neutral', type: 'bool', label: 'Gracze neutralni (bez relacji) też jako wrogowie' },
      { key: 'showLvl', type: 'bool', label: 'Pokazuj poziom i profesję przy nicku' },
    ],
    init(c) {
      cfg = c;
      timer = setInterval(tick, 1000);
      MP.wrogowie = { debug: () => ({ mapa: game.mapInfo(), czerwona: isRed() }) };
    },
    onToggle(on) { if (on) { seen.clear(); told.clear(); mapId = 0; } },
  });
})();
