// Fetches the owner's Garmin data with the Garmin Personal API and saves it
// ENCRYPTED to garmin-data/garmin.enc.json (this repo is public). Run by
// .github/workflows/garmin.yml. Needs repository secrets GARMIN_API_KEY and
// GARMIN_PASSPHRASE; the app unlocks the file with the same passphrase.
// Node 20+, no dependencies (built-in fetch and WebCrypto).
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { webcrypto as crypto } from 'node:crypto';

const API = 'https://personal.connectapi.garmin.com';
const TOKEN_URL = `${API}/personalapitoken-service/personal-api/personal-api-key/token`;
const FILE = 'garmin-data/garmin.enc.json';
const ITER = 210000;
const KEEP_DAYS = 400, BACKFILL = 28;

const { GARMIN_API_KEY: KEY, GARMIN_PASSPHRASE: PASS } = process.env;
if (!KEY || !PASS) { console.error('Add the GARMIN_API_KEY and GARMIN_PASSPHRASE repository secrets.'); process.exit(1); }

const log = [];
const ukDate = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(d); // YYYY-MM-DD
const addDays = (iso, n) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const round1 = (x) => Math.round(x * 10) / 10;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** First number found under any of these keys, searching nested objects/arrays. */
function dig(obj, keys, depth = 0) {
  if (!obj || typeof obj !== 'object' || depth > 6) return null;
  for (const k of keys) if (typeof obj[k] === 'number' && Number.isFinite(obj[k])) return obj[k];
  for (const v of Object.values(obj)) { const r = dig(v, keys, depth + 1); if (r !== null) return r; }
  return null;
}
function digStr(obj, keys, depth = 0) {
  if (!obj || typeof obj !== 'object' || depth > 6) return null;
  for (const k of keys) if (typeof obj[k] === 'string' && obj[k]) return obj[k];
  for (const v of Object.values(obj)) { const r = digStr(v, keys, depth + 1); if (r) return r; }
  return null;
}

// ----- encryption (same format the app decrypts) -----
const b64 = (buf) => Buffer.from(buf).toString('base64');
const unb64 = (s) => new Uint8Array(Buffer.from(s, 'base64'));
async function aesKey(salt) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(PASS), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITER }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
async function encrypt(obj) {
  const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aesKey(salt), new TextEncoder().encode(JSON.stringify(obj)));
  return { v: 1, kdf: 'PBKDF2-SHA256', iter: ITER, salt: b64(salt), iv: b64(iv), ct: b64(ct) };
}
async function decrypt(f) {
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(f.iv) }, await aesKey(unb64(f.salt)), unb64(f.ct));
  return JSON.parse(new TextDecoder().decode(pt));
}

// ----- Garmin -----
let token = null;
async function getToken() {
  const r = await fetch(TOKEN_URL, { method: 'POST', headers: { Authorization: `ApiKey ${KEY}` } });
  const text = await r.text();
  log.push({ path: 'token', status: r.status, body: r.ok ? '(token received)' : text.slice(0, 200) });
  if (!r.ok) throw new Error(r.status === 401 || r.status === 403 ? 'Garmin didn’t accept the key. It may be mistyped or expired: make a new one and update the GARMIN_API_KEY secret.' : `Garmin replied ${r.status} when asked for a token.`);
  let j; try { j = JSON.parse(text); } catch { j = text.trim(); }
  token = typeof j === 'string' ? j : j.access_token || j.accessToken || j.token || digStr(j, ['access_token', 'accessToken', 'token']);
  if (!token) throw new Error('Garmin’s token reply had no token in it.');
}
async function get(path) {
  await sleep(250); // be gentle with rate limits
  const r = await fetch(API + path, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
  const text = await r.text();
  log.push({ path: path.split('?')[0], status: r.status, body: text.slice(0, 160) });
  if (r.status === 429) throw new Error('Garmin says too many requests; the next run will try again.');
  if (!r.ok || !text) return null;
  try { return JSON.parse(text); } catch { return null; }
}

async function day(date) {
  const q = `calendarDate=${date}&date=${date}`;
  const sum = await get(`/usersummary-service/usersummary/daily?${q}`);
  const sl = await get(`/sleep-service/sleep/dailySleep?${q}`);
  const d = {};
  if (sum) {
    d.steps = dig(sum, ['totalSteps', 'steps']);
    d.rhr = dig(sum, ['restingHeartRate', 'restingHeartRateValue']);
    d.stress = dig(sum, ['averageStressLevel', 'avgStressLevel', 'overallStressLevel']);
    d.bb = dig(sum, ['bodyBatteryAtWakeTime', 'bodyBatteryHighestValue', 'bodyBatteryMostRecentValue']);
  }
  if (sl) {
    const secs = dig(sl, ['sleepTimeSeconds', 'totalSleepSeconds', 'sleepDurationSeconds']);
    if (secs) d.sleepH = round1(secs / 3600);
    d.sleepScore = dig(sl, ['overallSleepScore', 'sleepScore']) ?? dig(sl?.dailySleepDTO?.sleepScores?.overall || sl?.sleepScores?.overall || null, ['value']);
    d.rhr ??= dig(sl, ['restingHeartRate']);
    d.hrv = dig(sl, ['avgOvernightHrv']);
    // Sleep stages and Garmin's sleep need, in minutes.
    const mins = (keys) => { const v = dig(sl, keys); return v == null ? null : Math.round(v / 60); };
    d.deepM = mins(['deepSleepSeconds']); d.remM = mins(['remSleepSeconds']);
    d.lightM = mins(['lightSleepSeconds']); d.awakeM = mins(['awakeSleepSeconds']);
    const need = sl?.dailySleepDTO?.sleepNeed || sl?.sleepNeed;
    d.needM = need ? dig(need, ['actual', 'baseline']) : null;
  }
  // Garmin's Training Readiness isn't offered to personal keys (the metrics-service
  // endpoint returned 404 NOT_FOUND, Oct 2026). The app's tr/trLevel/trNote fields
  // stay ready in case Garmin adds it: put the request back here if it does.
  return Object.fromEntries(Object.entries(d).filter(([, v]) => v !== null && v !== undefined));
}

async function hrv(start, end) {
  const j = await get(`/hrv-service/hrv/daily/${start}/${end}`);
  const list = Array.isArray(j) ? j : j?.hrvSummaries || j?.summaries || [];
  const out = {};
  for (const x of list) {
    const date = x.calendarDate || x.date;
    if (!date) continue;
    const v = { hrv: dig(x, ['lastNightAvg', 'lastNight']), hrvLo: dig(x?.baseline || {}, ['balancedLow']), hrvHi: dig(x?.baseline || {}, ['balancedUpper', 'balancedHigh']), hrvStatus: x.status || null };
    out[date] = Object.fromEntries(Object.entries(v).filter(([, y]) => y !== null && y !== undefined));
  }
  return out;
}

/** Watch activities (for gym sessions: real duration and heart rate). */
async function activities(start, end) {
  const j = await get(`/activitylist-service/activities/search/activities?startDate=${start}&endDate=${end}&start=0&limit=100`);
  const list = Array.isArray(j) ? j : j?.activities || j?.activityList || [];
  return list.map((a) => {
    const startLocal = String(a.startTimeLocal || a.startTimeGMT || '');
    const secs = dig(a, ['duration', 'movingDuration', 'elapsedDuration']);
    return {
      id: a.activityId ?? a.id, date: startLocal.slice(0, 10), time: startLocal.slice(11, 16),
      type: a.activityType?.typeKey || digStr(a, ['typeKey']) || '', name: a.activityName || '',
      mins: secs ? Math.round(secs / 60) : null, avgHR: dig(a, ['averageHR', 'averageHeartRate']), maxHR: dig(a, ['maxHR', 'maxHeartRate']),
    };
  }).filter((a) => a.id != null && /^\d{4}-\d{2}-\d{2}$/.test(a.date));
}

// ----- main -----
let prev = { days: {} };
try { prev = await decrypt(JSON.parse(await readFile(FILE, 'utf8'))); } catch { /* first run, or the passphrase changed */ }
const days = { ...(prev.days || {}) };
const acts = Object.fromEntries((prev.acts || []).map((a) => [a.id, a]));
const today = ukDate();
const have = Object.keys(days).sort();
let from = have.length ? addDays(have[have.length - 1], -2) : addDays(today, -(BACKFILL - 1));
if (from < addDays(today, -(BACKFILL - 1))) from = addDays(today, -(BACKFILL - 1));

let error = null;
try {
  await getToken();
  for (let d = from; d <= today; d = addDays(d, 1)) {
    const x = await day(d);
    if (Object.keys(x).length) days[d] = { ...(days[d] || {}), ...x };
  }
  const h = await hrv(from, today);
  for (const [d, v] of Object.entries(h)) if (Object.keys(v).length) days[d] = { ...(days[d] || {}), ...v };
  for (const a of await activities(from, today)) acts[a.id] = a;
} catch (e) {
  error = e.message;
  console.error(error);
}
for (const d of Object.keys(days)) if (d < addDays(today, -KEEP_DAYS)) delete days[d];
const actList = Object.values(acts).filter((a) => a.date >= addDays(today, -KEEP_DAYS)).sort((a, b) => (a.date + a.time < b.date + b.time ? -1 : 1));

const changed = JSON.stringify(days) !== JSON.stringify(prev.days || {}) || JSON.stringify(actList) !== JSON.stringify(prev.acts || []) || error !== (prev.error || null);
if (changed || !prev.updated) {
  await mkdir('garmin-data', { recursive: true });
  await writeFile(FILE, JSON.stringify(await encrypt({ days, acts: actList, updated: new Date().toISOString(), error, log: log.slice(-40) })) + '\n');
  console.log(`Saved ${Object.keys(days).length} days (from ${from}).`);
} else console.log('No changes.');
for (const l of log) console.log(l.status, l.path); // statuses only: reply bodies stay inside the encrypted file
if (error) process.exitCode = 1;
