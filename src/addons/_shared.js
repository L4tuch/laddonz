/* Wspólne pomocniki dla dodatków. */
const nickIn = (list, nick) => Array.isArray(list) && list.some((n) => String(n).toLowerCase() === String(nick || '').toLowerCase());

/** Czy gracz jest „swój" (klan / znajomy / sojusznik / ręczna lista Bratana). */
function isFriendly(p) {
  if (!p) return false;
  const b = addons.cfg('bratan') || {};
  if (p.isClan || p.isFriend || p.isAlly) return true;
  if (nickIn(b.nicks, p.nick)) return true;
  return false;
}

function relTag(p) {
  if (p.isClan) return ['cl', 'klan'];
  if (p.isAlly) return ['al', 'sojusz'];
  if (p.isFriend) return ['fr', 'znajomy'];
  if (p.isEnemyTagged) return ['en', 'wróg'];
  return ['', '—'];
}

/** Parsuje z odpowiedzi serwera informację o ochronie: zwraca liczbę sekund albo null. */
function parseProtection(data) {
  let s;
  try { s = JSON.stringify(data || {}); } catch { return null; }
  if (!/ochron|protect/i.test(s)) return null;
  const m = s.match(/ochron[^"]{0,80}?(\d+)\s*(min|m\b|sek|s\b)/i) || s.match(/(\d+)\s*(min|sek|s)\b[^"]{0,40}ochron/i);
  if (!m) return 3;
  const n = Number(m[1]);
  return /min|^m$/i.test(m[2]) ? n * 60 : n;
}
