import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  QrCode, ScanLine, CalendarDays, Lock, Unlock, Clock, Check, X,
  ChevronLeft, ChevronRight, Plus, Trash2, Download, Maximize2, Minimize2,
  AlertTriangle, KeyRound, Pencil, RotateCcw, CircleUser, Coffee,
} from "lucide-react";

/* ==========================================================================
   1. QR ENCODER  (byte mode, versions 1-15, ECC L/M)
   Verified bit-for-bit against the reference implementation across every
   version and mask; mask 3 is skipped because its diagonal stripes defeat
   some camera detectors (any mask yields a conformant symbol).
   ========================================================================== */
const RS_BLOCKS = {
  L: [[1,26,19],[1,44,34],[1,70,55],[1,100,80],[1,134,108],[2,86,68],[2,98,78],[2,121,97],[2,146,116],[2,86,68,2,87,69],[4,101,81],[2,116,92,2,117,93],[4,133,107],[3,145,115,1,146,116],[5,109,87,1,110,88]],
  M: [[1,26,16],[1,44,28],[1,70,44],[2,50,32],[2,67,43],[4,43,27],[4,49,31],[2,60,38,2,61,39],[3,58,36,2,59,37],[4,69,43,1,70,44],[1,80,50,4,81,51],[6,58,36,2,59,37],[8,59,37,1,60,38],[4,64,40,5,65,41],[5,65,41,5,66,42]],
};
const ALIGN = [[],[],[6,18],[6,22],[6,26],[6,30],[6,34],[6,22,38],[6,24,42],[6,26,46],[6,28,50],[6,30,54],[6,32,58],[6,34,62],[6,26,46,66],[6,26,48,70]];
const EXP = new Uint8Array(512), LOG = new Uint8Array(256);
(function () { let x = 1; for (let i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11d; } for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255]; })();
const gmul = (a, b) => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]);
function genPoly(deg) { let p = [1]; for (let i = 0; i < deg; i++) { const n = new Array(p.length + 1).fill(0); for (let j = 0; j < p.length; j++) { n[j] ^= p[j]; n[j + 1] ^= gmul(p[j], EXP[i]); } p = n; } return p; }
function ecBytes(data, len) { const g = genPoly(len); const r = new Array(data.length + len).fill(0); for (let i = 0; i < data.length; i++) r[i] = data[i]; for (let i = 0; i < data.length; i++) { const c = r[i]; if (!c) continue; for (let j = 0; j < g.length; j++) r[i + j] ^= gmul(g[j], c); } return r.slice(data.length); }
function bchFormat(f) { let d = f << 10; for (let i = 4; i >= 0; i--) if (d & (1 << (i + 10))) d ^= 0x537 << i; return ((f << 10) | d) ^ 0x5412; }
function bchVersion(v) { let d = v << 12; for (let i = 5; i >= 0; i--) if (d & (1 << (i + 12))) d ^= 0x1f25 << i; return (v << 12) | d; }
const ECL_BITS = { L: 1, M: 0 };
function blocksFor(v, ecl) { const row = RS_BLOCKS[ecl][v - 1], out = []; for (let i = 0; i < row.length; i += 3) for (let k = 0; k < row[i]; k++) out.push({ total: row[i + 1], data: row[i + 2] }); return out; }
const capacity = (v, ecl) => blocksFor(v, ecl).reduce((s, b) => s + b.data, 0);
const toBytes = (s) => Array.from(new TextEncoder().encode(s));
function pickVersion(len, ecl) { for (let v = 1; v <= 15; v++) { const lb = v < 10 ? 8 : 16; if (Math.ceil((4 + lb + len * 8) / 8) <= capacity(v, ecl)) return v; } throw new Error("too long"); }
function buildData(bytes, v, ecl) {
  const capBits = capacity(v, ecl) * 8, bits = [];
  const push = (val, n) => { for (let i = n - 1; i >= 0; i--) bits.push((val >> i) & 1); };
  push(4, 4); push(bytes.length, v < 10 ? 8 : 16); bytes.forEach((b) => push(b, 8));
  for (let i = 0; i < 4 && bits.length < capBits; i++) bits.push(0);
  while (bits.length % 8) bits.push(0);
  const out = [];
  for (let i = 0; i < bits.length; i += 8) { let x = 0; for (let j = 0; j < 8; j++) x = (x << 1) | bits[i + j]; out.push(x); }
  const pad = [0xec, 0x11]; let p = 0;
  while (out.length < capBits / 8) out.push(pad[p++ % 2]);
  return out;
}
function interleave(data, v, ecl) {
  const blocks = blocksFor(v, ecl), db = [], eb = []; let off = 0;
  for (const b of blocks) { const c = data.slice(off, off + b.data); off += b.data; db.push(c); eb.push(ecBytes(c, b.total - b.data)); }
  const res = [];
  for (let i = 0; i < Math.max(...db.map((b) => b.length)); i++) for (const b of db) if (i < b.length) res.push(b[i]);
  for (let i = 0; i < Math.max(...eb.map((b) => b.length)); i++) for (const b of eb) if (i < b.length) res.push(b[i]);
  return res;
}
const emptyMatrix = (n) => Array.from({ length: n }, () => new Array(n).fill(null));
function placeFunctionPatterns(m, version) {
  const size = m.length;
  const finder = (r, c) => { for (let dr = -1; dr <= 7; dr++) for (let dc = -1; dc <= 7; dc++) { const rr = r + dr, cc = c + dc; if (rr < 0 || cc < 0 || rr >= size || cc >= size) continue; const inR = dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6; let dark = false; if (inR) { const edge = dr === 0 || dr === 6 || dc === 0 || dc === 6; const core = dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4; dark = edge || core; } m[rr][cc] = dark; } };
  finder(0, 0); finder(0, size - 7); finder(size - 7, 0);
  for (let i = 8; i < size - 8; i++) { m[6][i] = i % 2 === 0; m[i][6] = i % 2 === 0; }
  const ce = ALIGN[version], n = ce.length;
  for (let ri = 0; ri < n; ri++) for (let ci = 0; ci < n; ci++) {
    if ((ri === 0 && ci === 0) || (ri === 0 && ci === n - 1) || (ri === n - 1 && ci === 0)) continue;
    const r = ce[ri], c = ce[ci];
    for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) m[r + dr][c + dc] = Math.max(Math.abs(dr), Math.abs(dc)) !== 1;
  }
  m[size - 8][8] = true;
  for (let i = 0; i < 9; i++) { if (m[8][i] === null) m[8][i] = false; if (m[i][8] === null) m[i][8] = false; }
  for (let i = 0; i < 8; i++) { if (m[8][size - 1 - i] === null) m[8][size - 1 - i] = false; if (m[size - 1 - i][8] === null) m[size - 1 - i][8] = false; }
  if (version >= 7) { const b = bchVersion(version); for (let i = 0; i < 18; i++) { const bit = ((b >> i) & 1) === 1, r = Math.floor(i / 3), c = size - 11 + (i % 3); m[r][c] = bit; m[c][r] = bit; } }
}
function reservedMask(v, size) { const m = emptyMatrix(size); placeFunctionPatterns(m, v); return m.map((r) => r.map((x) => x !== null)); }
function placeData(m, reserved, cw) {
  const size = m.length; let bit = 0; const total = cw.length * 8;
  const next = () => { if (bit >= total) return false; const b = (cw[bit >> 3] >> (7 - (bit & 7))) & 1; bit++; return b === 1; };
  let up = true;
  for (let col = size - 1; col > 0; col -= 2) {
    if (col === 6) col--;
    for (let i = 0; i < size; i++) { const row = up ? size - 1 - i : i; for (let c = 0; c < 2; c++) { const cc = col - c; if (reserved[row][cc]) continue; m[row][cc] = next(); } }
    up = !up;
  }
}
const MASKS = [(r, c) => (r + c) % 2 === 0, (r) => r % 2 === 0, (r, c) => c % 3 === 0, (r, c) => (r + c) % 3 === 0, (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0, (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0, (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0, (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0];
function applyMask(m, reserved, k) { const out = m.map((r) => r.slice()); for (let r = 0; r < m.length; r++) for (let c = 0; c < m.length; c++) { if (reserved[r][c]) continue; if (MASKS[k](r, c)) out[r][c] = !out[r][c]; } return out; }
function placeFormat(m, ecl, mask) {
  const size = m.length, bits = bchFormat((ECL_BITS[ecl] << 3) | mask), get = (i) => ((bits >> i) & 1) === 1;
  for (let i = 0; i <= 5; i++) m[i][8] = get(i);
  m[7][8] = get(6); m[8][8] = get(7); m[8][7] = get(8);
  for (let i = 9; i <= 14; i++) m[8][14 - i] = get(i);
  for (let i = 0; i <= 7; i++) m[8][size - 1 - i] = get(i);
  for (let i = 8; i <= 14; i++) m[size - 15 + i][8] = get(i);
  m[size - 8][8] = true;
}
function penalty(m) {
  const size = m.length; let score = 0;
  const runs = (get) => { for (let a = 0; a < size; a++) { let run = 1; for (let b = 1; b < size; b++) { if (get(a, b) === get(a, b - 1)) run++; else { if (run >= 5) score += 3 + (run - 5); run = 1; } } if (run >= 5) score += 3 + (run - 5); } };
  runs((r, c) => m[r][c]); runs((c, r) => m[r][c]);
  for (let r = 0; r < size - 1; r++) for (let c = 0; c < size - 1; c++) { const v = m[r][c]; if (v === m[r][c + 1] && v === m[r + 1][c] && v === m[r + 1][c + 1]) score += 3; }
  const p1 = [true, false, true, true, true, false, true, false, false, false, false], p2 = [false, false, false, false, true, false, true, true, true, false, true];
  const match = (a, p) => p.every((v, i) => a[i] === v);
  for (let r = 0; r < size; r++) for (let c = 0; c <= size - 11; c++) { const row = [], col = []; for (let i = 0; i < 11; i++) { row.push(m[r][c + i]); col.push(m[c + i][r]); } if (match(row, p1) || match(row, p2)) score += 40; if (match(col, p1) || match(col, p2)) score += 40; }
  let dark = 0; for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (m[r][c]) dark++;
  score += Math.floor(Math.abs((dark * 100) / (size * size) - 50) / 5) * 10;
  return score;
}
function encodeQR(text, ecl = "M") {
  const bytes = toBytes(text), version = pickVersion(bytes.length, ecl), size = version * 4 + 17;
  const cw = interleave(buildData(bytes, version, ecl), version, ecl);
  const reserved = reservedMask(version, size), base = emptyMatrix(size);
  placeFunctionPatterns(base, version); placeData(base, reserved, cw);
  let best = null;
  for (const mask of [0, 1, 2, 4, 5, 6, 7]) {
    const cand = applyMask(base, reserved, mask); placeFormat(cand, ecl, mask);
    const bool = cand.map((r) => r.map((v) => v === true)); const p = penalty(bool);
    if (!best || p < best.p) best = { m: bool, p, mask };
  }
  return { matrix: best.m, size, version };
}

/* ==========================================================================
   2. ATTENDANCE ENGINE
   ========================================================================== */
const MIN = 60000;
const pad2 = (n) => String(n).padStart(2, "0");
const dateKey = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const timeStr = (ts) => { const d = new Date(ts); return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };
const parseHM = (s) => { const [h, m] = s.split(":").map(Number); return h * 60 + m; };
function atOn(dk, hm) { const [y, mo, d] = dk.split("-").map(Number); return new Date(y, mo - 1, d, Math.floor(hm / 60), hm % 60, 0, 0).getTime(); }
function shiftWindow(sh) { const s = parseHM(sh.start); let e = parseHM(sh.end); const start = atOn(sh.date, s); let end = atOn(sh.date, e); if (e <= s) end += 24 * 60 * MIN; return { start, end }; }
function weekDates(d) {
  const base = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  base.setDate(base.getDate() - ((base.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => { const x = new Date(base); x.setDate(base.getDate() + i); return dateKey(x); });
}
const B32 = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function hash32(str) { let h = 0x811c9dc5; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h >>> 0; }
function tokenForWindow(secret, win) {
  let a = hash32(`${secret}#${win}`), b = hash32(`${win}#${secret}#salt`), out = "";
  for (let i = 0; i < 5; i++) { out += B32[a & 31]; a >>>= 5; }
  for (let i = 0; i < 5; i++) { out += B32[b & 31]; b >>>= 5; }
  return out;
}
const windowIndex = (ts, period) => Math.floor(ts / period);
const buildPayload = (st, ts) => { const w = windowIndex(ts, st.tokenPeriodMs); return `CAFEPUNCH|1|${st.siteId}|${w}|${tokenForWindow(st.secret, w)}`; };
function validateToken(st, payload, ts, grace = 1) {
  if (typeof payload !== "string") return { ok: false, reason: "unreadable" };
  const p = payload.trim().split("|");
  if (p.length !== 5 || p[0] !== "CAFEPUNCH") return { ok: false, reason: "not-a-cafe-code" };
  if (p[2] !== st.siteId) return { ok: false, reason: "wrong-site" };
  const claimed = Number(p[3]);
  if (!Number.isFinite(claimed)) return { ok: false, reason: "unreadable" };
  if (Math.abs(windowIndex(ts, st.tokenPeriodMs) - claimed) > grace) return { ok: false, reason: "expired" };
  if (tokenForWindow(st.secret, claimed) !== p[4]) return { ok: false, reason: "bad-token" };
  return { ok: true };
}
// Accepts either a full scanned payload or a hand-typed 10-character code.
function validateAny(st, input, ts, grace = 1) {
  const raw = (input || "").trim();
  if (raw.includes("|")) return validateToken(st, raw, ts, grace);
  const code = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (code.length !== 10) return { ok: false, reason: "unreadable" };
  const now = windowIndex(ts, st.tokenPeriodMs);
  for (let d = -grace; d <= grace; d++) if (tokenForWindow(st.secret, now + d) === code) return { ok: true };
  return { ok: false, reason: "expired" };
}
const openSessionFor = (sessions, staffId) => sessions.find((s) => s.staffId === staffId && s.outAt == null) || null;
function relevantShifts(shifts, staffId, ts) {
  const today = dateKey(new Date(ts)), y = new Date(ts); y.setDate(y.getDate() - 1);
  const keys = [dateKey(y), today];
  return shifts.filter((s) => s.staffId === staffId && keys.includes(s.date));
}
function nearestShift(shifts, staffId, ts, catchmentMin = 240) {
  const cands = relevantShifts(shifts, staffId, ts).map((s) => { const w = shiftWindow(s); const dist = ts < w.start ? w.start - ts : ts > w.end ? ts - w.end : 0; return { shift: s, ...w, dist }; });
  const inW = cands.filter((c) => c.dist === 0).sort((a, b) => a.start - b.start);
  if (inW.length) return inW[0];
  return cands.filter((c) => c.dist <= catchmentMin * MIN).sort((a, b) => a.dist - b.dist)[0] || null;
}
const flagIn = (m, ts, g) => (!m ? "unscheduled" : ts < m.start - g * MIN ? "early" : ts > m.start + g * MIN ? "late" : "on-time");
const flagOut = (m, ts, g) => (!m ? "unscheduled" : ts < m.end - g * MIN ? "left-early" : ts > m.end + g * MIN ? "overtime" : "on-time");
function punch({ staff, sessions, shifts, staffId, now, settings }) {
  const person = staff.find((s) => s.id === staffId);
  if (!person) return { ok: false, reason: "unknown-staff" };
  if (person.active === false) return { ok: false, reason: "inactive-staff" };
  const open = openSessionFor(sessions, staffId), cooldown = (settings.cooldownSec || 0) * 1000;
  if (open) {
    if (now - open.inAt < cooldown) return { ok: false, reason: "cooldown", waitMs: cooldown - (now - open.inAt) };
    const m = nearestShift(shifts, staffId, open.inAt), flag = flagOut(m, now, settings.graceMin);
    const closed = { ...open, outAt: now, outFlag: flag };
    return { ok: true, action: "out", session: closed, flag, sessions: sessions.map((s) => (s.id === open.id ? closed : s)) };
  }
  const last = sessions.filter((s) => s.staffId === staffId && s.outAt != null).sort((a, b) => b.outAt - a.outAt)[0];
  if (last && now - last.outAt < cooldown) return { ok: false, reason: "cooldown", waitMs: cooldown - (now - last.outAt) };
  const m = nearestShift(shifts, staffId, now), flag = flagIn(m, now, settings.graceMin);
  const session = { id: `s_${now}_${staffId}`, staffId, date: dateKey(new Date(now)), inAt: now, outAt: null, inFlag: flag, outFlag: null, shiftId: m ? m.shift.id : null };
  return { ok: true, action: "in", session, flag, sessions: [...sessions, session] };
}
const roundTo = (m, step) => (step > 1 ? Math.round(m / step) * step : Math.round(m));
const sessionMinutes = (s, now = Date.now()) => Math.max(0, ((s.outAt == null ? now : s.outAt) - s.inAt) / MIN);
function totalsFor(sessions, staffId, days, now = Date.now(), step = 1) {
  const mine = sessions.filter((s) => s.staffId === staffId && days.includes(s.date));
  const raw = mine.reduce((sum, s) => sum + sessionMinutes(s, now), 0);
  return { sessions: mine.length, rawMinutes: raw, minutes: roundTo(raw, step), open: mine.some((s) => s.outAt == null) };
}
const hhmm = (m) => { const x = Math.max(0, Math.round(m)); return `${Math.floor(x / 60)}h ${pad2(x % 60)}m`; };
function rosterWeek({ staff, shifts, sessions, anchor, now = Date.now(), step = 1 }) {
  const days = weekDates(anchor);
  return {
    days,
    rows: staff.map((p) => ({
      staff: p,
      cells: days.map((dk) => {
        const ds = shifts.filter((s) => s.staffId === p.id && s.date === dk);
        return { date: dk, shifts: ds, scheduledMinutes: ds.reduce((sum, s) => { const w = shiftWindow(s); return sum + (w.end - w.start) / MIN; }, 0), worked: totalsFor(sessions, p.id, [dk], now, step) };
      }),
      weekWorked: totalsFor(sessions, p.id, days, now, step),
    })),
  };
}
const toCSV = (rows) => rows.map((r) => r.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
function timesheetCSV({ staff, sessions, days, step = 1, now = Date.now() }) {
  const rows = [["Staff", "Date", "Signed in", "Signed out", "In", "Out", "Minutes", "Hours"]];
  const byId = Object.fromEntries(staff.map((s) => [s.id, s.name]));
  sessions.filter((s) => days.includes(s.date)).sort((a, b) => a.inAt - b.inAt).forEach((s) => {
    const mins = roundTo(sessionMinutes(s, now), step);
    rows.push([byId[s.staffId] || s.staffId, s.date, timeStr(s.inAt), s.outAt ? timeStr(s.outAt) : "still in", s.inFlag, s.outFlag || "-", Math.round(mins), (mins / 60).toFixed(2)]);
  });
  return toCSV(rows);
}

/* ==========================================================================
   3. STORAGE
   ========================================================================== */
const STORE_KEY = "cafe:attendance:v1";
const memoryFallback = { value: null };
async function loadState() {
  try {
    if (typeof window !== "undefined" && window.storage) {
      const r = await window.storage.get(STORE_KEY, false);
      if (r && r.value) return JSON.parse(r.value);
    }
  } catch (e) { /* first run, or storage unavailable */ }
  return memoryFallback.value ? JSON.parse(memoryFallback.value) : null;
}
async function saveState(state) {
  const json = JSON.stringify(state);
  memoryFallback.value = json;
  try { if (typeof window !== "undefined" && window.storage) await window.storage.set(STORE_KEY, json, false); return true; }
  catch (e) { return false; }
}

/* ==========================================================================
   4. SEED DATA
   ========================================================================== */
const NAMES = ["Amina Yusuf", "Joe Brennan", "Priya Shah", "Marek Nowak", "Chloe Adams"];
function seedState() {
  const days = weekDates(new Date());
  const pins = ["1234", "2345", "3456", "4567", "5678"];
  const staff = NAMES.map((name, i) => ({ id: `p${i + 1}`, name, pin: pins[i], role: i === 0 ? "Supervisor" : "Barista", active: true }));
  const patterns = [["07:00", "15:00"], ["08:00", "16:00"], ["10:00", "18:00"], ["12:00", "20:00"], ["07:30", "13:30"]];
  const shifts = [];
  days.forEach((dk, di) => {
    staff.forEach((p, pi) => {
      if ((pi + di) % 4 === 3) return; // everyone gets days off
      const [start, end] = patterns[(pi + di) % patterns.length];
      shifts.push({ id: `sh_${dk}_${p.id}`, staffId: p.id, date: dk, start, end });
    });
  });
  return {
    settings: {
      cafeName: "The Corner Cafe", siteId: "CAFE01", secret: `s${Math.random().toString(36).slice(2, 10)}`,
      adminPin: "0000", tokenPeriodMs: 60000, graceMin: 5, cooldownSec: 60, roundStep: 1, demoMode: true,
    },
    staff, shifts, sessions: [],
  };
}

/* ==========================================================================
   5. STYLES
   ========================================================================== */
const CSS = `
.cf { --ink:#0B0F1A; --panel:#141A2B; --panel2:#1B2237; --line:#28314D; --text:#E9ECF5;
  --dim:#8E99B8; --brass:#D6A354; --brass-dim:#8a6a34; --mint:#5BD6A6; --coral:#FF6B6B; --amber:#F5C451;
  --sans:ui-sans-serif,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;
  --mono:ui-monospace,"SF Mono",SFMono-Regular,Menlo,Consolas,monospace;
  background:var(--ink); color:var(--text); font-family:var(--sans); min-height:100%;
  font-feature-settings:"tnum" 1; -webkit-font-smoothing:antialiased; }
.cf *{box-sizing:border-box}
.cf button{font-family:inherit;cursor:pointer;border:none;background:none;color:inherit}
.cf input,.cf select{font-family:inherit;background:var(--ink);border:1px solid var(--line);color:var(--text);
  border-radius:8px;padding:9px 11px;font-size:14px;width:100%}
.cf input:focus-visible,.cf select:focus-visible,.cf button:focus-visible{outline:2px solid var(--brass);outline-offset:2px}
.cf-shell{max-width:1080px;margin:0 auto;padding:14px 14px 88px}
.cf-top{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:6px 2px 16px}
.cf-brand{display:flex;align-items:center;gap:10px;min-width:0}
.cf-brand h1{font-size:15px;font-weight:650;letter-spacing:.14em;text-transform:uppercase;margin:0;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cf-brand .sub{font-family:var(--mono);font-size:11px;color:var(--dim);letter-spacing:.06em}
.cf-clock{font-family:var(--mono);font-size:13px;color:var(--dim);white-space:nowrap}
.cf-tabs{position:fixed;bottom:0;left:0;right:0;display:flex;background:rgba(11,15,26,.94);
  backdrop-filter:blur(12px);border-top:1px solid var(--line);z-index:40}
.cf-tab{flex:1;padding:11px 4px 13px;display:flex;flex-direction:column;align-items:center;gap:4px;
  font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--dim);border-top:2px solid transparent}
.cf-tab[data-on="1"]{color:var(--brass);border-top-color:var(--brass)}
.cf-card{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:16px}
.cf-h{font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:var(--dim);margin:0 0 10px;font-weight:600}
.cf-mono{font-family:var(--mono)}
.cf-btn{background:var(--panel2);border:1px solid var(--line);border-radius:10px;padding:10px 14px;
  font-size:13px;font-weight:550;display:inline-flex;align-items:center;justify-content:center;gap:7px}
.cf-btn:hover{border-color:var(--brass-dim)}
.cf-btn.p{background:var(--brass);color:#1a1206;border-color:var(--brass)}
.cf-btn.p:hover{filter:brightness(1.07)}
.cf-btn.d{color:var(--coral)}
.cf-btn:disabled{opacity:.45;cursor:not-allowed}
.cf-ticket{position:relative;background:#F4F1E8;color:#12151f;border-radius:6px;padding:20px 18px 16px;
  max-width:330px;margin:0 auto;box-shadow:0 18px 40px rgba(0,0,0,.45)}
.cf-ticket::before,.cf-ticket::after{content:"";position:absolute;left:0;right:0;height:9px;
  background-image:radial-gradient(circle at 5px 0,transparent 4.5px,#F4F1E8 5px);background-size:10px 9px}
.cf-ticket::before{top:-8px;transform:rotate(180deg)}
.cf-ticket::after{bottom:-8px}
.cf-ticket .tk-h{display:flex;justify-content:space-between;font-family:var(--mono);font-size:10px;
  letter-spacing:.13em;text-transform:uppercase;color:#5c6273;border-bottom:1px dashed #b9bdc9;padding-bottom:9px;margin-bottom:14px}
.cf-code{font-family:var(--mono);font-size:23px;letter-spacing:.16em;text-align:center;margin-top:12px;font-weight:600}
.cf-code small{display:block;font-size:9px;letter-spacing:.16em;color:#5c6273;margin-bottom:3px;font-weight:500}
.cf-ring{transform:rotate(-90deg)}
.cf-floor{display:flex;flex-direction:column;gap:8px}
.cf-row{display:flex;align-items:center;gap:11px;padding:11px 13px;background:var(--panel2);
  border:1px solid var(--line);border-radius:11px}
.cf-dot{width:8px;height:8px;border-radius:50%;flex:none}
.cf-pill{font-size:10px;letter-spacing:.09em;text-transform:uppercase;padding:3px 8px;border-radius:99px;
  border:1px solid currentColor;white-space:nowrap;font-weight:600}
.cf-grid{width:100%;border-collapse:separate;border-spacing:0;font-size:12px;min-width:640px}
.cf-grid th{font-size:10px;letter-spacing:.11em;text-transform:uppercase;color:var(--dim);font-weight:600;
  padding:8px 6px;text-align:center;border-bottom:1px solid var(--line)}
.cf-grid td{padding:5px;border-bottom:1px solid var(--line);vertical-align:top}
.cf-cell{width:100%;min-height:52px;border-radius:9px;border:1px solid var(--line);background:var(--panel2);
  padding:7px 6px;display:flex;flex-direction:column;gap:3px;align-items:center;justify-content:center;text-align:center}
.cf-cell.off{background:transparent;border-style:dashed;opacity:.45}
.cf-cell.today{border-color:var(--brass-dim)}
.cf-keys{display:grid;grid-template-columns:repeat(3,1fr);gap:9px;max-width:270px;margin:0 auto}
.cf-key{background:var(--panel2);border:1px solid var(--line);border-radius:12px;padding:16px 0;
  font-family:var(--mono);font-size:21px;font-weight:600}
.cf-key:active{background:var(--brass);color:#1a1206}
.cf-pins{display:flex;gap:11px;justify-content:center;margin:16px 0}
.cf-pins i{width:13px;height:13px;border-radius:50%;border:1.5px solid var(--line);display:block}
.cf-pins i[data-on="1"]{background:var(--brass);border-color:var(--brass)}
.cf-note{font-size:12px;color:var(--dim);line-height:1.55}
.cf-flash{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;padding:20px;
  background:rgba(4,6,12,.82);backdrop-filter:blur(6px);z-index:60}
.cf-modal{background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:20px;
  width:100%;max-width:420px;max-height:88vh;overflow:auto}
.cf-field{display:block;margin-bottom:12px}
.cf-field span{display:block;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--dim);margin-bottom:5px}
.cf-split{display:grid;gap:14px}
@media(min-width:760px){.cf-split{grid-template-columns:1fr 1fr}}
.cf-scan{position:relative;background:#000;border-radius:14px;overflow:hidden;aspect-ratio:1;max-width:330px;margin:0 auto}
.cf-scan video{width:100%;height:100%;object-fit:cover}
.cf-reticle{position:absolute;inset:16%;border:2px solid var(--brass);border-radius:12px;
  box-shadow:0 0 0 100vmax rgba(0,0,0,.35)}
@keyframes cf-pulse{0%,100%{opacity:1}50%{opacity:.55}}
.cf-live{animation:cf-pulse 2s ease-in-out infinite}
@media(prefers-reduced-motion:reduce){.cf-live{animation:none}}
`;

/* ==========================================================================
   6. SMALL COMPONENTS
   ========================================================================== */
const FLAG_STYLE = {
  "on-time": { c: "var(--mint)", label: "On time" },
  late: { c: "var(--coral)", label: "Late" },
  early: { c: "var(--amber)", label: "Early" },
  "left-early": { c: "var(--amber)", label: "Left early" },
  overtime: { c: "var(--brass)", label: "Overtime" },
  unscheduled: { c: "var(--dim)", label: "Unscheduled" },
};
const Flag = ({ f }) => {
  const s = FLAG_STYLE[f] || FLAG_STYLE.unscheduled;
  return <span className="cf-pill" style={{ color: s.c }}>{s.label}</span>;
};

function QRTicket({ payload, code, msLeft, period, cafeName }) {
  const qr = useMemo(() => { try { return encodeQR(payload, "M"); } catch { return null; } }, [payload]);
  const path = useMemo(() => {
    if (!qr) return "";
    let d = "";
    for (let r = 0; r < qr.size; r++) for (let c = 0; c < qr.size; c++) if (qr.matrix[r][c]) d += `M${c} ${r}h1v1h-1z`;
    return d;
  }, [qr]);
  const pct = Math.max(0, Math.min(1, msLeft / period));
  const R = 15, C = 2 * Math.PI * R;
  return (
    <div className="cf-ticket">
      <div className="tk-h"><span>{cafeName}</span><span>Punch code</span></div>
      {qr ? (
        <svg viewBox={`-2 -2 ${qr.size + 4} ${qr.size + 4}`} width="100%" role="img"
          aria-label="Scan this code with the staff app to sign in or out"
          style={{ display: "block", background: "#F4F1E8" }} shapeRendering="crispEdges">
          <path d={path} fill="#12151f" />
        </svg>
      ) : <div style={{ padding: 40, textAlign: "center" }}>Code unavailable</div>}
      <div className="cf-code"><small>OR TYPE THIS CODE</small>{code}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 9, justifyContent: "center", marginTop: 12, color: "#5c6273" }}>
        <svg width="36" height="36" viewBox="0 0 36 36" className="cf-ring" aria-hidden="true">
          <circle cx="18" cy="18" r={R} fill="none" stroke="#d8d4c6" strokeWidth="3" />
          <circle cx="18" cy="18" r={R} fill="none" stroke="#12151f" strokeWidth="3" strokeLinecap="round"
            strokeDasharray={C} strokeDashoffset={C * (1 - pct)} />
        </svg>
        <span className="cf-mono" style={{ fontSize: 11, letterSpacing: ".1em" }}>
          NEW CODE IN {Math.ceil(msLeft / 1000)}s
        </span>
      </div>
    </div>
  );
}

function PinPad({ value, onChange, onSubmit, length = 4 }) {
  const press = (k) => {
    if (k === "del") return onChange(value.slice(0, -1));
    if (value.length >= length) return;
    const next = value + k;
    onChange(next);
    if (next.length === length) setTimeout(() => onSubmit(next), 90);
  };
  return (
    <>
      <div className="cf-pins">{Array.from({ length }).map((_, i) => <i key={i} data-on={i < value.length ? "1" : "0"} />)}</div>
      <div className="cf-keys">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((k) => (
          <button key={k} className="cf-key" onClick={() => press(k)} aria-label={`Digit ${k}`}>{k}</button>
        ))}
        <button className="cf-key" style={{ opacity: 0, pointerEvents: "none" }} aria-hidden="true" tabIndex={-1}>·</button>
        <button className="cf-key" onClick={() => press("0")} aria-label="Digit 0">0</button>
        <button className="cf-key" onClick={() => press("del")} aria-label="Delete">←</button>
      </div>
    </>
  );
}

const Modal = ({ title, onClose, children }) => (
  <div className="cf-flash" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.target === e.currentTarget && onClose()}>
    <div className="cf-modal">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h3 className="cf-h" style={{ margin: 0 }}>{title}</h3>
        <button onClick={onClose} aria-label="Close" style={{ color: "var(--dim)" }}><X size={18} /></button>
      </div>
      {children}
    </div>
  </div>
);

/* ==========================================================================
   7. APP
   ========================================================================== */
export default function CafeAttendance() {
  const [state, setState] = useState(null);
  const [tab, setTab] = useState("kiosk");
  const [now, setNow] = useState(Date.now());
  const [saveFailed, setSaveFailed] = useState(false);
  // deliberately not persisted — a reload should re-lock the manager screens
  const [unlocked, setUnlocked] = useState(false);

  useEffect(() => {
    let alive = true;
    loadState().then((s) => { if (alive) setState(s || seedState()); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!state) return;
    const t = setTimeout(() => { saveState(state).then((ok) => setSaveFailed(!ok)); }, 350);
    return () => clearTimeout(t);
  }, [state]);

  useEffect(() => {
    const fast = tab === "kiosk";
    const id = setInterval(() => setNow(Date.now()), fast ? 250 : 1000);
    return () => clearInterval(id);
  }, [tab]);

  if (!state) {
    return (
      <div className="cf" style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
        <style>{CSS}</style>
        <div className="cf-mono cf-live" style={{ color: "#8E99B8", fontSize: 13, letterSpacing: ".14em" }}>OPENING UP…</div>
      </div>
    );
  }

  const { settings, staff, shifts, sessions } = state;
  const onFloor = sessions.filter((s) => s.outAt == null);

  return (
    <div className="cf">
      <style>{CSS}</style>
      <div className="cf-shell">
        <header className="cf-top">
          <div className="cf-brand">
            <Coffee size={19} style={{ color: "var(--brass)", flex: "none" }} aria-hidden="true" />
            <div style={{ minWidth: 0 }}>
              <h1>{settings.cafeName}</h1>
              <div className="sub">{onFloor.length} on the floor · {staff.filter((s) => s.active !== false).length} staff</div>
            </div>
          </div>
          <div className="cf-clock">{timeStr(now)}</div>
        </header>

        {saveFailed && (
          <div className="cf-card" style={{ borderColor: "var(--amber)", marginBottom: 14, display: "flex", gap: 10 }}>
            <AlertTriangle size={16} style={{ color: "var(--amber)", flex: "none" }} />
            <span className="cf-note">Changes aren't saving to storage — they'll hold for this session but won't survive a reload.</span>
          </div>
        )}

        {tab === "kiosk" && <KioskView state={state} now={now} onFloor={onFloor} />}
        {tab === "punch" && <PunchView state={state} now={now} setState={setState} />}
        {tab === "roster" && <RosterView state={state} now={now} setState={setState} unlocked={unlocked} />}
        {tab === "admin" && <AdminView state={state} now={now} setState={setState} unlocked={unlocked} setUnlocked={setUnlocked} />}
      </div>

      <nav className="cf-tabs" aria-label="Main">
        {[["kiosk", QrCode, "Kiosk"], ["punch", ScanLine, "Punch"], ["roster", CalendarDays, "Roster"], ["admin", Lock, "Admin"]].map(([id, Icon, label]) => (
          <button key={id} className="cf-tab" data-on={tab === id ? "1" : "0"} onClick={() => setTab(id)} aria-current={tab === id}>
            <Icon size={18} aria-hidden="true" />{label}
          </button>
        ))}
      </nav>
    </div>
  );
}

/* ---------------------------- KIOSK ---------------------------- */
function KioskView({ state, now, onFloor }) {
  const { settings, staff, sessions } = state;
  const [full, setFull] = useState(false);
  const period = settings.tokenPeriodMs;
  const payload = buildPayload(settings, now);
  const code = payload.split("|")[4];
  const msLeft = period - (now % period);
  const nameOf = (id) => (staff.find((s) => s.id === id) || {}).name || "Unknown";

  const ticket = <QRTicket payload={payload} code={code} msLeft={msLeft} period={period} cafeName={settings.cafeName} />;

  if (full) {
    return (
      <div style={{ position: "fixed", inset: 0, background: "var(--ink)", zIndex: 50, display: "grid", placeItems: "center", padding: 20 }}>
        <div>
          {ticket}
          <button className="cf-btn" style={{ margin: "22px auto 0", display: "flex" }} onClick={() => setFull(false)}>
            <Minimize2 size={15} /> Exit full screen
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="cf-split">
      <section>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <h2 className="cf-h">Tablet code</h2>
          <button className="cf-btn" style={{ padding: "5px 10px", fontSize: 12 }} onClick={() => setFull(true)}>
            <Maximize2 size={13} /> Full screen
          </button>
        </div>
        {ticket}
        <p className="cf-note" style={{ marginTop: 16, textAlign: "center", maxWidth: 330, marginLeft: "auto", marginRight: "auto" }}>
          Leave this on the tablet by the pass. Staff open the Punch tab on their phone, scan, and enter their PIN.
          The code changes every {Math.round(period / 1000)} seconds, so a screenshot is useless from home.
        </p>
      </section>

      <section>
        <h2 className="cf-h">On the floor now</h2>
        {onFloor.length === 0 ? (
          <div className="cf-card cf-note">Nobody signed in. The next scan starts the day.</div>
        ) : (
          <div className="cf-floor">
            {onFloor.sort((a, b) => a.inAt - b.inAt).map((s) => {
              const long = now - s.inAt > 12 * 60 * MIN;
              return (
                <div className="cf-row" key={s.id}>
                  <span className="cf-dot cf-live" style={{ background: long ? "var(--amber)" : "var(--mint)" }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{nameOf(s.staffId)}</div>
                    <div className="cf-mono" style={{ fontSize: 11, color: "var(--dim)" }}>
                      in at {timeStr(s.inAt)} · {hhmm(sessionMinutes(s, now))}
                    </div>
                  </div>
                  {long ? <span className="cf-pill" style={{ color: "var(--amber)" }}>Check</span> : <Flag f={s.inFlag} />}
                </div>
              );
            })}
          </div>
        )}
        <h2 className="cf-h" style={{ marginTop: 22 }}>Today so far</h2>
        <TodayList state={state} now={now} />
      </section>
    </div>
  );
}

function TodayList({ state, now }) {
  const { staff, sessions } = state;
  const today = dateKey(new Date(now));
  const rows = staff.filter((p) => p.active !== false)
    .map((p) => ({ p, t: totalsFor(sessions, p.id, [today], now, state.settings.roundStep) }))
    .filter((r) => r.t.sessions > 0);
  if (!rows.length) return <div className="cf-card cf-note">No punches logged today yet.</div>;
  return (
    <div className="cf-floor">
      {rows.map(({ p, t }) => (
        <div className="cf-row" key={p.id}>
          <CircleUser size={16} style={{ color: "var(--dim)", flex: "none" }} aria-hidden="true" />
          <div style={{ flex: 1 }}>{p.name}</div>
          <div className="cf-mono" style={{ fontSize: 13, color: t.open ? "var(--mint)" : "var(--text)" }}>{hhmm(t.minutes)}</div>
        </div>
      ))}
    </div>
  );
}

/* ---------------------------- PUNCH ---------------------------- */
function PunchView({ state, now, setState }) {
  const { settings, staff, shifts, sessions } = state;
  const [step, setStep] = useState("code");      // code -> pin -> done
  const [manual, setManual] = useState("");
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [pin, setPin] = useState("");
  const [scanning, setScanning] = useState(false);
  const [camState, setCamState] = useState("idle");
  const videoRef = useRef(null);

  const acceptCode = useCallback((raw) => {
    const v = validateAny(settings, raw, Date.now());
    if (!v.ok) {
      setError({
        expired: "That code has expired. Look at the tablet for the current one.",
        "wrong-site": "That code belongs to a different site.",
        "bad-token": "That code isn't valid here.",
        "not-a-cafe-code": "That's not a punch code.",
        unreadable: "Couldn't read that code.",
      }[v.reason] || "Couldn't read that code.");
      return false;
    }
    setError(null); setScanning(false); setStep("pin"); setPin("");
    return true;
  }, [settings]);

  useEffect(() => {
    if (!scanning) return;
    let stream = null, raf = 0, dead = false;
    (async () => {
      if (typeof window === "undefined" || !("BarcodeDetector" in window)) { setCamState("unsupported"); return; }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (dead) { stream.getTracks().forEach((t) => t.stop()); return; }
        setCamState("live");
        if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play().catch(() => {}); }
        const det = new window.BarcodeDetector({ formats: ["qr_code"] });
        const loop = async () => {
          if (dead) return;
          try {
            if (videoRef.current && videoRef.current.readyState >= 2) {
              const codes = await det.detect(videoRef.current);
              if (codes && codes.length) { if (acceptCode(codes[0].rawValue)) return; }
            }
          } catch (e) { /* keep scanning */ }
          raf = requestAnimationFrame(loop);
        };
        loop();
      } catch (e) { setCamState("denied"); }
    })();
    return () => { dead = true; if (raf) cancelAnimationFrame(raf); if (stream) stream.getTracks().forEach((t) => t.stop()); };
  }, [scanning, acceptCode]);

  const submitPin = (entered) => {
    const person = staff.find((p) => p.pin === entered);
    if (!person) { setError("PIN not recognised."); setPin(""); return; }
    const r = punch({ staff, sessions, shifts, staffId: person.id, now: Date.now(), settings });
    if (!r.ok) {
      setError(r.reason === "cooldown"
        ? `Just a moment — wait ${Math.ceil((r.waitMs || 0) / 1000)}s before scanning again.`
        : r.reason === "inactive-staff" ? "That account is switched off. Speak to your manager."
        : "Couldn't record that punch.");
      setPin(""); return;
    }
    setState((s) => ({ ...s, sessions: r.sessions }));
    setResult({ person, action: r.action, flag: r.flag, at: r.session.outAt || r.session.inAt });
    setStep("done"); setError(null); setPin("");
  };

  const reset = () => { setStep("code"); setResult(null); setError(null); setManual(""); setPin(""); setScanning(false); setCamState("idle"); };

  if (step === "done" && result) {
    const days = weekDates(new Date(now));
    const week = totalsFor(sessions, result.person.id, days, now, settings.roundStep);
    const today = totalsFor(sessions, result.person.id, [dateKey(new Date(now))], now, settings.roundStep);
    const inNow = result.action === "in";
    return (
      <div className="cf-card" style={{ maxWidth: 420, margin: "0 auto", textAlign: "center", borderColor: inNow ? "var(--mint)" : "var(--brass)" }}>
        <div style={{ display: "grid", placeItems: "center", width: 54, height: 54, borderRadius: "50%", margin: "0 auto 14px", background: inNow ? "var(--mint)" : "var(--brass)", color: "#0B0F1A" }}>
          {inNow ? <Check size={26} /> : <Clock size={24} />}
        </div>
        <div style={{ fontSize: 19, fontWeight: 650 }}>{result.person.name}</div>
        <div className="cf-mono" style={{ fontSize: 15, color: "var(--dim)", margin: "6px 0 12px" }}>
          {inNow ? "Signed in" : "Signed out"} at {timeStr(result.at)}
        </div>
        <Flag f={result.flag} />
        <div style={{ display: "flex", gap: 12, marginTop: 20 }}>
          <div className="cf-row" style={{ flex: 1, flexDirection: "column", gap: 3 }}>
            <span className="cf-mono" style={{ fontSize: 17 }}>{hhmm(today.minutes)}</span>
            <span style={{ fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--dim)" }}>Today</span>
          </div>
          <div className="cf-row" style={{ flex: 1, flexDirection: "column", gap: 3 }}>
            <span className="cf-mono" style={{ fontSize: 17 }}>{hhmm(week.minutes)}</span>
            <span style={{ fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--dim)" }}>This week</span>
          </div>
        </div>
        <MyHistory state={state} now={now} staffId={result.person.id} />
        <button className="cf-btn p" style={{ width: "100%", marginTop: 16 }} onClick={reset}>Done</button>
      </div>
    );
  }

  if (step === "pin") {
    return (
      <div className="cf-card" style={{ maxWidth: 380, margin: "0 auto" }}>
        <h2 className="cf-h" style={{ textAlign: "center" }}>Enter your PIN</h2>
        <PinPad value={pin} onChange={(v) => { setPin(v); setError(null); }} onSubmit={submitPin} />
        {error && <p style={{ color: "var(--coral)", fontSize: 13, textAlign: "center", marginTop: 14 }}>{error}</p>}
        <button className="cf-btn" style={{ width: "100%", marginTop: 16 }} onClick={reset}>Cancel</button>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 380, margin: "0 auto" }}>
      <h2 className="cf-h" style={{ textAlign: "center" }}>Scan the tablet</h2>
      {scanning ? (
        <div className="cf-scan">
          <video ref={videoRef} playsInline muted aria-label="Camera viewfinder" />
          <div className="cf-reticle" />
          {camState !== "live" && (
            <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", padding: 20, textAlign: "center" }}>
              <span className="cf-note">
                {camState === "unsupported" ? "This browser can't scan QR codes. Type the code underneath it instead."
                  : camState === "denied" ? "Camera blocked. Type the code shown under the QR instead."
                  : "Starting camera…"}
              </span>
            </div>
          )}
        </div>
      ) : (
        <button className="cf-btn p" style={{ width: "100%", padding: "16px" }} onClick={() => { setScanning(true); setCamState("idle"); setError(null); }}>
          <ScanLine size={18} /> Open camera
        </button>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "18px 0 14px", color: "var(--dim)" }}>
        <span style={{ flex: 1, height: 1, background: "var(--line)" }} />
        <span style={{ fontSize: 10, letterSpacing: ".16em" }}>OR TYPE THE CODE</span>
        <span style={{ flex: 1, height: 1, background: "var(--line)" }} />
      </div>

      <div style={{ display: "flex", gap: 9 }}>
        <input className="cf-mono" value={manual} maxLength={14} placeholder="ABCDE12345"
          aria-label="Punch code from the tablet"
          style={{ letterSpacing: ".14em", textTransform: "uppercase" }}
          onChange={(e) => { setManual(e.target.value); setError(null); }}
          onKeyDown={(e) => e.key === "Enter" && acceptCode(manual)} />
        <button className="cf-btn p" style={{ flex: "none" }} onClick={() => acceptCode(manual)} disabled={manual.trim().length < 10}>Go</button>
      </div>

      {settings.demoMode && (
        <button className="cf-btn" style={{ width: "100%", marginTop: 10, fontSize: 12 }}
          onClick={() => acceptCode(buildPayload(settings, Date.now()))}>
          Demo: use the current code
        </button>
      )}
      {error && <p style={{ color: "var(--coral)", fontSize: 13, marginTop: 14 }}>{error}</p>}
      {scanning && <button className="cf-btn" style={{ width: "100%", marginTop: 12 }} onClick={() => setScanning(false)}>Stop camera</button>}
    </div>
  );
}

function MyHistory({ state, now, staffId }) {
  const { sessions, settings } = state;
  const days = weekDates(new Date(now));
  const mine = sessions.filter((s) => s.staffId === staffId && days.includes(s.date)).sort((a, b) => b.inAt - a.inAt).slice(0, 6);
  if (!mine.length) return null;
  return (
    <div style={{ marginTop: 18, textAlign: "left" }}>
      <h3 className="cf-h">Your week</h3>
      <div className="cf-floor">
        {mine.map((s) => (
          <div className="cf-row" key={s.id} style={{ padding: "9px 12px" }}>
            <div style={{ flex: 1 }}>
              <div className="cf-mono" style={{ fontSize: 13 }}>{timeStr(s.inAt)} → {s.outAt ? timeStr(s.outAt) : "…"}</div>
              <div style={{ fontSize: 11, color: "var(--dim)" }}>{new Date(s.inAt).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}</div>
            </div>
            <span className="cf-mono" style={{ fontSize: 13 }}>{hhmm(roundTo(sessionMinutes(s, now), settings.roundStep))}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------------------- ROSTER ---------------------------- */
function RosterView({ state, now, setState, unlocked }) {
  const { staff, shifts, sessions, settings } = state;
  const [offset, setOffset] = useState(0);
  const [editing, setEditing] = useState(null);
  const anchor = useMemo(() => { const d = new Date(now); d.setDate(d.getDate() + offset * 7); return d; }, [offset, now]);
  const grid = useMemo(() => rosterWeek({ staff: staff.filter((s) => s.active !== false), shifts, sessions, anchor, now, step: settings.roundStep }), [staff, shifts, sessions, anchor, now, settings.roundStep]);
  const today = dateKey(new Date(now));

  const saveShift = (sh) => {
    setState((s) => {
      const rest = s.shifts.filter((x) => x.id !== sh.id);
      return { ...s, shifts: sh.deleted ? rest : [...rest, sh] };
    });
    setEditing(null);
  };

  return (
    <section>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <h2 className="cf-h" style={{ margin: 0 }}>
          {offset === 0 ? "This week" : offset === 1 ? "Next week" : offset === -1 ? "Last week" : `Week of ${grid.days[0]}`}
        </h2>
        <div style={{ display: "flex", gap: 7 }}>
          <button className="cf-btn" style={{ padding: "6px 9px" }} onClick={() => setOffset((o) => o - 1)} aria-label="Previous week"><ChevronLeft size={15} /></button>
          <button className="cf-btn" style={{ padding: "6px 11px", fontSize: 12 }} onClick={() => setOffset(0)}>Today</button>
          <button className="cf-btn" style={{ padding: "6px 9px" }} onClick={() => setOffset((o) => o + 1)} aria-label="Next week"><ChevronRight size={15} /></button>
        </div>
      </div>

      <div className="cf-card" style={{ padding: 10, overflowX: "auto" }}>
        <table className="cf-grid">
          <thead>
            <tr>
              <th style={{ textAlign: "left", paddingLeft: 8, minWidth: 110 }}>Staff</th>
              {grid.days.map((d) => {
                const dt = new Date(d + "T00:00:00");
                return <th key={d} style={{ color: d === today ? "var(--brass)" : undefined }}>
                  {dt.toLocaleDateString(undefined, { weekday: "short" })}<br />
                  <span className="cf-mono" style={{ fontSize: 11, opacity: .8 }}>{dt.getDate()}</span>
                </th>;
              })}
              <th style={{ minWidth: 66 }}>Worked</th>
            </tr>
          </thead>
          <tbody>
            {grid.rows.map((row) => (
              <tr key={row.staff.id}>
                <td style={{ paddingLeft: 8 }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{row.staff.name}</div>
                  <div style={{ fontSize: 11, color: "var(--dim)" }}>{row.staff.role || "Staff"}</div>
                </td>
                {row.cells.map((cell) => {
                  const sh = cell.shifts[0];
                  const cls = `cf-cell${sh ? "" : " off"}${cell.date === today ? " today" : ""}`;
                  const content = sh ? (
                    <>
                      <span className="cf-mono" style={{ fontSize: 11.5 }}>{sh.start}–{sh.end}</span>
                      {cell.worked.sessions > 0 && (
                        <span className="cf-mono" style={{ fontSize: 10, color: cell.worked.open ? "var(--mint)" : "var(--dim)" }}>
                          {hhmm(cell.worked.minutes)}{cell.worked.open ? " ·" : ""}
                        </span>
                      )}
                    </>
                  ) : cell.worked.sessions > 0 ? (
                    <span className="cf-mono" style={{ fontSize: 10.5, color: "var(--amber)" }}>{hhmm(cell.worked.minutes)} extra</span>
                  ) : <span style={{ color: "var(--dim)", fontSize: 11 }}>—</span>;
                  return (
                    <td key={cell.date}>
                      {unlocked ? (
                        <button className={cls} onClick={() => setEditing(sh || { id: `sh_${cell.date}_${row.staff.id}_${Math.random().toString(36).slice(2, 6)}`, staffId: row.staff.id, date: cell.date, start: "09:00", end: "17:00", isNew: true })}
                          aria-label={`${sh ? "Edit" : "Add"} shift for ${row.staff.name} on ${cell.date}`}>{content}</button>
                      ) : <div className={cls}>{content}</div>}
                    </td>
                  );
                })}
                <td>
                  <div className="cf-cell" style={{ borderColor: "transparent", background: "transparent" }}>
                    <span className="cf-mono" style={{ fontSize: 13, color: row.weekWorked.open ? "var(--mint)" : "var(--text)" }}>{hhmm(row.weekWorked.minutes)}</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="cf-note" style={{ marginTop: 12 }}>
        {unlocked ? "Tap any cell to set or clear a shift." : "Unlock Admin to edit shifts. Green totals are still running."}
      </p>

      {editing && <ShiftEditor shift={editing} staff={staff} onSave={saveShift} onClose={() => setEditing(null)} />}
    </section>
  );
}

function ShiftEditor({ shift, staff, onSave, onClose }) {
  const [start, setStart] = useState(shift.start);
  const [end, setEnd] = useState(shift.end);
  const person = staff.find((s) => s.id === shift.staffId);
  const overnight = parseHM(end) <= parseHM(start);
  return (
    <Modal title={`${shift.isNew ? "Add" : "Edit"} shift`} onClose={onClose}>
      <p className="cf-note" style={{ marginBottom: 14 }}>
        {person ? person.name : "Staff"} · {new Date(shift.date + "T00:00:00").toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}
      </p>
      <div style={{ display: "flex", gap: 12 }}>
        <label className="cf-field" style={{ flex: 1 }}><span>Starts</span><input type="time" value={start} onChange={(e) => setStart(e.target.value)} /></label>
        <label className="cf-field" style={{ flex: 1 }}><span>Ends</span><input type="time" value={end} onChange={(e) => setEnd(e.target.value)} /></label>
      </div>
      {overnight && <p className="cf-note" style={{ color: "var(--amber)", marginBottom: 12 }}>Runs past midnight — counted as an overnight shift.</p>}
      <div style={{ display: "flex", gap: 9 }}>
        <button className="cf-btn p" style={{ flex: 1 }} onClick={() => onSave({ id: shift.id, staffId: shift.staffId, date: shift.date, start, end })}>Save shift</button>
        {!shift.isNew && <button className="cf-btn d" onClick={() => onSave({ ...shift, deleted: true })} aria-label="Delete shift"><Trash2 size={15} /></button>}
      </div>
    </Modal>
  );
}

/* ---------------------------- ADMIN ---------------------------- */
function AdminView({ state, now, setState, unlocked, setUnlocked }) {
  const { settings, staff, sessions } = state;
  const [pin, setPin] = useState("");
  const [error, setError] = useState(null);
  const [pane, setPane] = useState("staff");
  const [editStaff, setEditStaff] = useState(null);
  const [editSession, setEditSession] = useState(null);

  if (!unlocked) {
    return (
      <div className="cf-card" style={{ maxWidth: 380, margin: "0 auto" }}>
        <h2 className="cf-h" style={{ textAlign: "center" }}>Manager PIN</h2>
        <PinPad value={pin} onChange={(v) => { setPin(v); setError(null); }} onSubmit={(v) => {
          if (v === settings.adminPin) { setUnlocked(true); setPin(""); }
          else { setError("Wrong PIN."); setPin(""); }
        }} />
        {error && <p style={{ color: "var(--coral)", fontSize: 13, textAlign: "center", marginTop: 12 }}>{error}</p>}
        {settings.demoMode && <p className="cf-note" style={{ textAlign: "center", marginTop: 14 }}>Demo PIN: {settings.adminPin}</p>}
      </div>
    );
  }

  const days = weekDates(new Date(now));
  const exportCSV = () => {
    const csv = timesheetCSV({ staff, sessions, days, step: settings.roundStep, now });
    try {
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `timesheet_${days[0]}_to_${days[6]}.csv`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) { /* download unavailable */ }
  };

  const copyLastWeek = () => setState((s) => {
    const prev = new Date(now); prev.setDate(prev.getDate() - 7);
    const prevDays = weekDates(prev), thisDays = weekDates(new Date(now));
    const map = Object.fromEntries(prevDays.map((d, i) => [d, thisDays[i]]));
    const cloned = s.shifts.filter((sh) => prevDays.includes(sh.date))
      .map((sh) => ({ ...sh, id: `${sh.id}_c${Math.random().toString(36).slice(2, 6)}`, date: map[sh.date] }));
    const kept = s.shifts.filter((sh) => !thisDays.includes(sh.date));
    return { ...s, shifts: [...kept, ...cloned] };
  });

  const saveStaff = (p) => setState((s) => {
    const rest = s.staff.filter((x) => x.id !== p.id);
    return { ...s, staff: p.deleted ? rest : [...rest, p].sort((a, b) => a.name.localeCompare(b.name)) };
  });

  const saveSession = (sess) => setState((s) => {
    const rest = s.sessions.filter((x) => x.id !== sess.id);
    return { ...s, sessions: sess.deleted ? rest : [...rest, sess] };
  });

  const recent = sessions.filter((s) => days.includes(s.date)).sort((a, b) => b.inAt - a.inAt).slice(0, 20);
  const nameOf = (id) => (staff.find((s) => s.id === id) || {}).name || "Unknown";
  const pinClash = (p) => staff.some((x) => x.id !== p.id && x.pin === p.pin);

  return (
    <section>
      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        {[["staff", "Staff"], ["hours", "Timesheet"], ["setup", "Settings"]].map(([id, label]) => (
          <button key={id} className="cf-btn" style={id === pane ? { borderColor: "var(--brass)", color: "var(--brass)" } : {}} onClick={() => setPane(id)}>{label}</button>
        ))}
        <button className="cf-btn" style={{ marginLeft: "auto" }} onClick={() => setUnlocked(false)}><Unlock size={14} /> Lock</button>
      </div>

      {pane === "staff" && (
        <>
          <div className="cf-floor">
            {staff.map((p) => (
              <div className="cf-row" key={p.id}>
                <span className="cf-dot" style={{ background: p.active === false ? "var(--line)" : "var(--mint)" }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{p.name}</div>
                  <div style={{ fontSize: 11, color: "var(--dim)" }}>{p.role || "Staff"} · PIN {settings.demoMode ? p.pin : "····"}{p.active === false ? " · off" : ""}</div>
                </div>
                <button className="cf-btn" style={{ padding: "6px 10px" }} onClick={() => setEditStaff(p)} aria-label={`Edit ${p.name}`}><Pencil size={14} /></button>
              </div>
            ))}
          </div>
          <button className="cf-btn p" style={{ marginTop: 12 }} onClick={() => setEditStaff({ id: `p_${Date.now()}`, name: "", role: "Barista", pin: "", active: true, isNew: true })}>
            <Plus size={15} /> Add staff
          </button>
        </>
      )}

      {pane === "hours" && (
        <>
          <div style={{ display: "flex", gap: 9, marginBottom: 12, flexWrap: "wrap" }}>
            <button className="cf-btn" onClick={exportCSV}><Download size={14} /> Export this week</button>
            <button className="cf-btn" onClick={copyLastWeek}><RotateCcw size={14} /> Copy last week's shifts</button>
          </div>
          {recent.length === 0 ? <div className="cf-card cf-note">No punches this week yet.</div> : (
            <div className="cf-floor">
              {recent.map((s) => {
                const stuck = s.outAt == null && now - s.inAt > 12 * 60 * MIN;
                return (
                  <div className="cf-row" key={s.id} style={stuck ? { borderColor: "var(--amber)" } : {}}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 13.5 }}>{nameOf(s.staffId)}</div>
                      <div className="cf-mono" style={{ fontSize: 11.5, color: "var(--dim)" }}>
                        {s.date} · {timeStr(s.inAt)} → {s.outAt ? timeStr(s.outAt) : "open"} · {hhmm(roundTo(sessionMinutes(s, now), settings.roundStep))}
                      </div>
                    </div>
                    {stuck && <span className="cf-pill" style={{ color: "var(--amber)" }}>Missed out</span>}
                    <button className="cf-btn" style={{ padding: "6px 10px" }} onClick={() => setEditSession(s)} aria-label="Edit entry"><Pencil size={14} /></button>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {pane === "setup" && <SettingsPane state={state} setState={setState} />}

      {editStaff && <StaffEditor person={editStaff} clash={pinClash} onSave={(p) => { saveStaff(p); setEditStaff(null); }} onClose={() => setEditStaff(null)} />}
      {editSession && <SessionEditor session={editSession} name={nameOf(editSession.staffId)} onSave={(s) => { saveSession(s); setEditSession(null); }} onClose={() => setEditSession(null)} />}
    </section>
  );
}

function StaffEditor({ person, clash, onSave, onClose }) {
  const [p, setP] = useState(person);
  const bad = p.pin.length !== 4 || !/^\d{4}$/.test(p.pin) || clash(p) || !p.name.trim();
  return (
    <Modal title={person.isNew ? "Add staff" : "Edit staff"} onClose={onClose}>
      <label className="cf-field"><span>Name</span><input value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} placeholder="Full name" /></label>
      <label className="cf-field"><span>Role</span><input value={p.role || ""} onChange={(e) => setP({ ...p, role: e.target.value })} placeholder="Barista" /></label>
      <label className="cf-field"><span>4-digit PIN</span>
        <input className="cf-mono" value={p.pin} inputMode="numeric" maxLength={4}
          onChange={(e) => setP({ ...p, pin: e.target.value.replace(/\D/g, "").slice(0, 4) })} placeholder="0000" />
      </label>
      {clash(p) && <p style={{ color: "var(--coral)", fontSize: 12, marginTop: -6, marginBottom: 12 }}>Another staff member already uses that PIN.</p>}
      <label className="cf-field" style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <input type="checkbox" checked={p.active !== false} onChange={(e) => setP({ ...p, active: e.target.checked })} style={{ width: 17, height: 17, accentColor: "#D6A354" }} />
        <span style={{ margin: 0 }}>Can sign in</span>
      </label>
      <div style={{ display: "flex", gap: 9, marginTop: 6 }}>
        <button className="cf-btn p" style={{ flex: 1 }} disabled={bad} onClick={() => onSave({ ...p, isNew: undefined })}>Save</button>
        {!person.isNew && <button className="cf-btn d" onClick={() => onSave({ ...p, deleted: true })} aria-label="Remove staff"><Trash2 size={15} /></button>}
      </div>
    </Modal>
  );
}

function SessionEditor({ session, name, onSave, onClose }) {
  const [inT, setInT] = useState(timeStr(session.inAt));
  const [outT, setOutT] = useState(session.outAt ? timeStr(session.outAt) : "");
  const build = () => {
    const inAt = atOn(session.date, parseHM(inT));
    let outAt = outT ? atOn(session.date, parseHM(outT)) : null;
    if (outAt != null && outAt <= inAt) outAt += 24 * 60 * MIN; // crossed midnight
    return { ...session, inAt, outAt, outFlag: outAt ? session.outFlag || "unscheduled" : null };
  };
  return (
    <Modal title="Correct entry" onClose={onClose}>
      <p className="cf-note" style={{ marginBottom: 14 }}>{name} · {session.date}</p>
      <div style={{ display: "flex", gap: 12 }}>
        <label className="cf-field" style={{ flex: 1 }}><span>Signed in</span><input type="time" value={inT} onChange={(e) => setInT(e.target.value)} /></label>
        <label className="cf-field" style={{ flex: 1 }}><span>Signed out</span><input type="time" value={outT} onChange={(e) => setOutT(e.target.value)} /></label>
      </div>
      <p className="cf-note" style={{ marginBottom: 14 }}>Leave the sign-out blank to keep the shift open.</p>
      <div style={{ display: "flex", gap: 9 }}>
        <button className="cf-btn p" style={{ flex: 1 }} onClick={() => onSave(build())}>Save entry</button>
        <button className="cf-btn d" onClick={() => onSave({ ...session, deleted: true })} aria-label="Delete entry"><Trash2 size={15} /></button>
      </div>
    </Modal>
  );
}

function SettingsPane({ state, setState }) {
  const { settings } = state;
  const set = (k, v) => setState((s) => ({ ...s, settings: { ...s.settings, [k]: v } }));
  const [confirmReset, setConfirmReset] = useState(false);
  return (
    <div className="cf-split">
      <div className="cf-card">
        <h3 className="cf-h">Cafe</h3>
        <label className="cf-field"><span>Name</span><input value={settings.cafeName} onChange={(e) => set("cafeName", e.target.value)} /></label>
        <label className="cf-field"><span>Manager PIN</span>
          <input className="cf-mono" value={settings.adminPin} inputMode="numeric" maxLength={4}
            onChange={(e) => set("adminPin", e.target.value.replace(/\D/g, "").slice(0, 4))} />
        </label>
        <label className="cf-field" style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <input type="checkbox" checked={!!settings.demoMode} onChange={(e) => set("demoMode", e.target.checked)} style={{ width: 17, height: 17, accentColor: "#D6A354" }} />
          <span style={{ margin: 0 }}>Demo mode (shows PINs, lets you punch without scanning)</span>
        </label>
      </div>

      <div className="cf-card">
        <h3 className="cf-h">Rules</h3>
        <label className="cf-field"><span>Grace either side of a shift</span>
          <select value={settings.graceMin} onChange={(e) => set("graceMin", Number(e.target.value))}>
            {[0, 5, 10, 15, 30].map((v) => <option key={v} value={v}>{v} minutes</option>)}
          </select>
        </label>
        <label className="cf-field"><span>Round hours to</span>
          <select value={settings.roundStep} onChange={(e) => set("roundStep", Number(e.target.value))}>
            {[1, 5, 15, 30].map((v) => <option key={v} value={v}>{v === 1 ? "the minute" : `${v} minutes`}</option>)}
          </select>
        </label>
        <label className="cf-field"><span>Wait between scans</span>
          <select value={settings.cooldownSec} onChange={(e) => set("cooldownSec", Number(e.target.value))}>
            {[0, 30, 60, 120, 300].map((v) => <option key={v} value={v}>{v === 0 ? "no wait" : `${v} seconds`}</option>)}
          </select>
        </label>
        <label className="cf-field"><span>Code changes every</span>
          <select value={settings.tokenPeriodMs} onChange={(e) => set("tokenPeriodMs", Number(e.target.value))}>
            {[30000, 60000, 300000].map((v) => <option key={v} value={v}>{v / 1000} seconds</option>)}
          </select>
        </label>
      </div>

      <div className="cf-card">
        <h3 className="cf-h">Security</h3>
        <p className="cf-note" style={{ marginBottom: 12 }}>
          Rotating the key invalidates every code that's out there right now — use it if someone's been sharing screenshots.
        </p>
        <button className="cf-btn" onClick={() => set("secret", `s${Math.random().toString(36).slice(2, 10)}`)}>
          <KeyRound size={14} /> Rotate the key
        </button>
        <p className="cf-note" style={{ marginTop: 14 }}>
          This is a prototype: PINs and the key are stored in plain text on the device. Don't run payroll off it without a real backend.
        </p>
      </div>

      <div className="cf-card">
        <h3 className="cf-h">Start over</h3>
        {confirmReset ? (
          <>
            <p className="cf-note" style={{ marginBottom: 12 }}>This wipes staff, shifts and every punch, then reloads the sample cafe.</p>
            <div style={{ display: "flex", gap: 9 }}>
              <button className="cf-btn d" onClick={() => setState(seedState())}>Yes, wipe it</button>
              <button className="cf-btn" onClick={() => setConfirmReset(false)}>Cancel</button>
            </div>
          </>
        ) : <button className="cf-btn" onClick={() => setConfirmReset(true)}><Trash2 size={14} /> Reset all data</button>}
      </div>
    </div>
  );
}
