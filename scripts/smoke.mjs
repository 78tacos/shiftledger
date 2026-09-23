/**
 * Smoke the v1 API against a running server.
 * Usage: API_URL=http://127.0.0.1:3001 node scripts/smoke.mjs
 */
const API = process.env.API_URL ?? 'http://127.0.0.1:3001';

async function req(path, opts = {}) {
  const headers = { ...(opts.headers ?? {}) };
  if (opts.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  const res = await fetch(`${API}${path}`, {
    ...opts,
    headers,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`${opts.method ?? 'GET'} ${path} -> ${res.status} ${body.error ?? ''}`);
  }
  return body;
}

/** YYYY-MM-DD on the America/Chicago calendar (same as the seed). UTC toISOString is already the next day after ~19:00 CT. */
function chicagoDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const pick = (type) => parts.find((part) => part.type === type).value;
  return `${pick('year')}-${pick('month')}-${pick('day')}`;
}

function today() {
  return chicagoDate();
}

function lastFriday() {
  const [year, month, day] = chicagoDate().split('-').map(Number);
  // UTC calendar math so the host timezone cannot shift the civil date.
  const utc = new Date(Date.UTC(year, month - 1, day));
  const dow = utc.getUTCDay();
  const delta = dow === 5 ? 7 : (dow + 2) % 7;
  utc.setUTCDate(utc.getUTCDate() - delta);
  const y = utc.getUTCFullYear();
  const m = String(utc.getUTCMonth() + 1).padStart(2, '0');
  const d = String(utc.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const login = await req('/auth/login', {
  method: 'POST',
  body: JSON.stringify({ email: 'manager@jalea.demo', password: 'jalea-demo-2026' }),
});
if (!login.token) throw new Error('no token');
const auth = { Authorization: `Bearer ${login.token}` };

const board = await req(`/shifts?date=${today()}`, { headers: auth });
if (!Array.isArray(board.shifts) || board.shifts.length === 0) {
  throw new Error('tonight board empty');
}

const scheduled = board.shifts.find((s) => s.status === 'scheduled');
if (scheduled) {
  const clocked = await req(`/shifts/${scheduled.id}/clock-in`, { method: 'POST', headers: auth });
  if (clocked.shift.status !== 'open') throw new Error('clock-in failed');
  const out = await req(`/shifts/${scheduled.id}/clock-out`, { method: 'POST', headers: auth });
  if (out.shift.status !== 'closed') throw new Error('clock-out failed');
}

const open = (await req(`/shifts?date=${today()}`, { headers: auth })).shifts.find((s) => s.status === 'open');
if (!open) throw new Error('no open shift after clock-in');
const closedProbe = board.shifts.find((s) => s.status === 'closed')
  ?? (await req(`/shifts?date=${lastFriday()}`, { headers: auth })).shifts.find((s) => s.status === 'closed');
if (!closedProbe) throw new Error('expected a closed Friday shift');

const fri = lastFriday();
const periods = await req(`/service-periods?from=${fri}&to=${today()}`, { headers: auth });
const tonight = periods.periods.find((p) => p.serviceDate === today());
const friday = periods.periods.find((p) => p.serviceDate === fri);
if (!tonight || !friday) throw new Error('missing service periods');

const closedPool = await req(`/tip-pools/${friday.id}`, { headers: auth });
if (closedPool.pool.status !== 'closed') throw new Error('friday pool not closed');
if (closedPool.pool.totalCents !== 24750) throw new Error('friday pool total');
const payoutSum = closedPool.payouts.reduce((s, p) => s + p.amountCents, 0);
if (payoutSum !== 24750) throw new Error('payouts do not sum to pool');

const openPool = await req(`/tip-pools/${tonight.id}`, { headers: auth });
const staff = await req('/staff', { headers: auth });
const server = staff.staff.find((s) => s.role === 'server');
const contributed = await req(`/tip-pools/${openPool.pool.id}/contributions`, {
  method: 'POST',
  headers: auth,
  body: JSON.stringify({ staffId: server.id, amountCents: 1250, source: 'cash' }),
});
if (contributed.pool.totalCents < 1250) throw new Error('contribution did not land');

// Leave tonight's pool open for the UI demo. Close-path is covered by the
// Friday seed + unit tests (and can be clicked in the web app).

const side = await req(`/shifts/${board.shifts[0].id}/sidework`, { headers: auth });
if (!side.items.length) throw new Error('sidework empty');
const toggled = await req(`/shift-sidework/${side.items[0].id}`, {
  method: 'PATCH',
  headers: auth,
  body: JSON.stringify({ done: !side.items[0].done }),
});
if (typeof toggled.item.done !== 'boolean') throw new Error('toggle failed');

const labor = await req(`/labor?from=${fri}&to=${today()}`, { headers: auth });
if (!Array.isArray(labor.rows)) throw new Error('labor missing rows');
if (labor.totalHours < 0) throw new Error('labor hours');

console.log('smoke ok', {
  restaurant: login.user.restaurantName,
  tonightShifts: board.shifts.length,
  fridayPool: closedPool.pool.totalCents,
  laborRows: labor.rows.length,
  laborHours: labor.totalHours,
});
