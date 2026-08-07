/**
 * Ported, DOM-free attendance engine. No Supabase, no Date.now() inside --
 * every function that needs the current time takes `now` as an argument, so
 * it stays deterministic and testable. Ported from the cafe-attendance.jsx
 * prototype; keep behavior identical unless BUILD-SPEC.md says otherwise.
 *
 * Dates ("YYYY-MM-DD" strings) and times ("HH:MM" strings) are interpreted
 * in the server process's local timezone. Deploy with TZ set to the cafe's
 * timezone (see settings.timezone) so shift matching lines up with the wall
 * clock on site.
 */

export const MIN = 60000;

export type Flag =
  | "on-time"
  | "late"
  | "early"
  | "left-early"
  | "overtime"
  | "unscheduled";

export interface Staff {
  id: string;
  name: string;
  role?: string | null;
  active?: boolean;
}

export interface Shift {
  id: string;
  staffId: string;
  date: string; // YYYY-MM-DD
  start: string; // HH:MM
  end: string; // HH:MM, <= start means it crosses midnight
}

export interface Session {
  id: string;
  staffId: string;
  date: string; // YYYY-MM-DD, the day the session STARTED
  inAt: number;
  outAt: number | null;
  inFlag: Flag;
  outFlag: Flag | null;
  shiftId: string | null;
}

export interface AttendanceSettings {
  graceMin: number;
  cooldownSec: number;
}

export const pad2 = (n: number) => String(n).padStart(2, "0");

export const dateKey = (d: Date) =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

export const timeStr = (ts: number) => {
  const d = new Date(ts);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
};

export const parseHM = (s: string) => {
  const [h, m] = s.split(":").map(Number);
  return h * 60 + m;
};

export function atOn(dk: string, hm: number): number {
  const [y, mo, d] = dk.split("-").map(Number);
  return new Date(y, mo - 1, d, Math.floor(hm / 60), hm % 60, 0, 0).getTime();
}

export function shiftWindow(sh: Shift): { start: number; end: number } {
  const s = parseHM(sh.start);
  const e = parseHM(sh.end);
  const start = atOn(sh.date, s);
  let end = atOn(sh.date, e);
  if (e <= s) end += 24 * 60 * MIN;
  return { start, end };
}

export function weekDates(d: Date): string[] {
  const base = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  base.setDate(base.getDate() - ((base.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => {
    const x = new Date(base);
    x.setDate(base.getDate() + i);
    return dateKey(x);
  });
}

export const openSessionFor = (sessions: Session[], staffId: string) =>
  sessions.find((s) => s.staffId === staffId && s.outAt == null) || null;

function relevantShifts(shifts: Shift[], staffId: string, ts: number): Shift[] {
  const today = dateKey(new Date(ts));
  const y = new Date(ts);
  y.setDate(y.getDate() - 1);
  const keys = [dateKey(y), today];
  return shifts.filter((s) => s.staffId === staffId && keys.includes(s.date));
}

export interface ShiftMatch {
  shift: Shift;
  start: number;
  end: number;
  dist: number;
}

export function nearestShift(
  shifts: Shift[],
  staffId: string,
  ts: number,
  catchmentMin = 240
): ShiftMatch | null {
  const cands = relevantShifts(shifts, staffId, ts).map((s) => {
    const w = shiftWindow(s);
    const dist = ts < w.start ? w.start - ts : ts > w.end ? ts - w.end : 0;
    return { shift: s, ...w, dist };
  });
  const inW = cands.filter((c) => c.dist === 0).sort((a, b) => a.start - b.start);
  if (inW.length) return inW[0];
  return (
    cands
      .filter((c) => c.dist <= catchmentMin * MIN)
      .sort((a, b) => a.dist - b.dist)[0] || null
  );
}

export const flagIn = (m: ShiftMatch | null, ts: number, g: number): Flag =>
  !m
    ? "unscheduled"
    : ts < m.start - g * MIN
      ? "early"
      : ts > m.start + g * MIN
        ? "late"
        : "on-time";

export const flagOut = (m: ShiftMatch | null, ts: number, g: number): Flag =>
  !m
    ? "unscheduled"
    : ts < m.end - g * MIN
      ? "left-early"
      : ts > m.end + g * MIN
        ? "overtime"
        : "on-time";

export type PunchResult =
  | {
      ok: true;
      action: "in" | "out";
      session: Session;
      flag: Flag;
      sessions: Session[];
    }
  | { ok: false; reason: "unknown-staff" | "inactive-staff" }
  | { ok: false; reason: "cooldown"; waitMs: number };

export function punch({
  staff,
  sessions,
  shifts,
  staffId,
  now,
  settings,
  newSessionId,
}: {
  staff: Staff[];
  sessions: Session[];
  shifts: Shift[];
  staffId: string;
  now: number;
  settings: AttendanceSettings;
  /** id generator for a freshly-opened session; defaults to a time-based id */
  newSessionId?: () => string;
}): PunchResult {
  const person = staff.find((s) => s.id === staffId);
  if (!person) return { ok: false, reason: "unknown-staff" };
  if (person.active === false) return { ok: false, reason: "inactive-staff" };

  const open = openSessionFor(sessions, staffId);
  const cooldown = (settings.cooldownSec || 0) * 1000;

  if (open) {
    if (now - open.inAt < cooldown) {
      return { ok: false, reason: "cooldown", waitMs: cooldown - (now - open.inAt) };
    }
    const m = nearestShift(shifts, staffId, open.inAt);
    const flag = flagOut(m, now, settings.graceMin);
    const closed: Session = { ...open, outAt: now, outFlag: flag };
    return {
      ok: true,
      action: "out",
      session: closed,
      flag,
      sessions: sessions.map((s) => (s.id === open.id ? closed : s)),
    };
  }

  const last = sessions
    .filter((s) => s.staffId === staffId && s.outAt != null)
    .sort((a, b) => (b.outAt as number) - (a.outAt as number))[0];
  if (last && now - (last.outAt as number) < cooldown) {
    return { ok: false, reason: "cooldown", waitMs: cooldown - (now - (last.outAt as number)) };
  }

  const m = nearestShift(shifts, staffId, now);
  const flag = flagIn(m, now, settings.graceMin);
  const session: Session = {
    id: newSessionId ? newSessionId() : `s_${now}_${staffId}`,
    staffId,
    date: dateKey(new Date(now)),
    inAt: now,
    outAt: null,
    inFlag: flag,
    outFlag: null,
    shiftId: m ? m.shift.id : null,
  };
  return { ok: true, action: "in", session, flag, sessions: [...sessions, session] };
}

export const roundTo = (m: number, step: number) =>
  step > 1 ? Math.round(m / step) * step : Math.round(m);

export const sessionMinutes = (s: Session, now: number) =>
  Math.max(0, ((s.outAt == null ? now : s.outAt) - s.inAt) / MIN);

export interface Totals {
  sessions: number;
  rawMinutes: number;
  minutes: number;
  open: boolean;
}

export function totalsFor(
  sessions: Session[],
  staffId: string,
  days: string[],
  now: number,
  step = 1
): Totals {
  const mine = sessions.filter((s) => s.staffId === staffId && days.includes(s.date));
  const raw = mine.reduce((sum, s) => sum + sessionMinutes(s, now), 0);
  return {
    sessions: mine.length,
    rawMinutes: raw,
    minutes: roundTo(raw, step),
    open: mine.some((s) => s.outAt == null),
  };
}

export const hhmm = (m: number) => {
  const x = Math.max(0, Math.round(m));
  return `${Math.floor(x / 60)}h ${pad2(x % 60)}m`;
};

export interface RosterCell {
  date: string;
  shifts: Shift[];
  scheduledMinutes: number;
  worked: Totals;
}

export interface RosterRow {
  staff: Staff;
  cells: RosterCell[];
  weekWorked: Totals;
}

export function rosterWeek({
  staff,
  shifts,
  sessions,
  anchor,
  now,
  step = 1,
}: {
  staff: Staff[];
  shifts: Shift[];
  sessions: Session[];
  anchor: Date;
  now: number;
  step?: number;
}): { days: string[]; rows: RosterRow[] } {
  const days = weekDates(anchor);
  return {
    days,
    rows: staff.map((p) => ({
      staff: p,
      cells: days.map((dk) => {
        const ds = shifts.filter((s) => s.staffId === p.id && s.date === dk);
        return {
          date: dk,
          shifts: ds,
          scheduledMinutes: ds.reduce((sum, s) => {
            const w = shiftWindow(s);
            return sum + (w.end - w.start) / MIN;
          }, 0),
          worked: totalsFor(sessions, p.id, [dk], now, step),
        };
      }),
      weekWorked: totalsFor(sessions, p.id, days, now, step),
    })),
  };
}

const toCSV = (rows: (string | number)[][]) =>
  rows
    .map((r) => r.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","))
    .join("\n");

export function timesheetCSV({
  staff,
  sessions,
  days,
  step = 1,
  now,
}: {
  staff: Staff[];
  sessions: Session[];
  days: string[];
  step?: number;
  now: number;
}): string {
  const rows: (string | number)[][] = [
    ["Staff", "Date", "Signed in", "Signed out", "In", "Out", "Minutes", "Hours"],
  ];
  const byId = Object.fromEntries(staff.map((s) => [s.id, s.name]));
  sessions
    .filter((s) => days.includes(s.date))
    .sort((a, b) => a.inAt - b.inAt)
    .forEach((s) => {
      const mins = roundTo(sessionMinutes(s, now), step);
      rows.push([
        byId[s.staffId] || s.staffId,
        s.date,
        timeStr(s.inAt),
        s.outAt ? timeStr(s.outAt) : "still in",
        s.inFlag,
        s.outFlag || "-",
        Math.round(mins),
        (mins / 60).toFixed(2),
      ]);
    });
  return toCSV(rows);
}
