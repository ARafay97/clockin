import { describe, it, expect } from "vitest";
import {
  shiftWindow,
  weekDates,
  dateKey,
  timeStr,
  parseHM,
  atOn,
  nearestShift,
  flagIn,
  flagOut,
  punch,
  sessionMinutes,
  totalsFor,
  rosterWeek,
  timesheetCSV,
  hhmm,
  roundTo,
  MIN,
  type Staff,
  type Shift,
  type Session,
} from "../lib/attendance";

const staff: Staff[] = [
  { id: "p1", name: "Amina Yusuf", role: "Supervisor", active: true },
  { id: "p2", name: "Joe Brennan", role: "Barista", active: true },
  { id: "p3", name: "Retired Person", role: "Barista", active: false },
];

const day = "2026-08-10"; // a Monday
const nextDay = "2026-08-11";
const prevDay = "2026-08-09"; // Sunday

const settings = { graceMin: 5, cooldownSec: 60 };

describe("time helpers", () => {
  it("parseHM converts HH:MM to minutes since midnight", () => {
    expect(parseHM("00:00")).toBe(0);
    expect(parseHM("09:30")).toBe(570);
    expect(parseHM("23:59")).toBe(1439);
  });

  it("atOn builds a local timestamp for a date key + minutes", () => {
    const ts = atOn(day, parseHM("09:00"));
    const d = new Date(ts);
    expect(d.getHours()).toBe(9);
    expect(d.getMinutes()).toBe(0);
    expect(dateKey(d)).toBe(day);
  });

  it("dateKey pads month and day", () => {
    expect(dateKey(new Date(2026, 0, 5))).toBe("2026-01-05");
  });

  it("timeStr formats a timestamp as HH:MM", () => {
    const ts = atOn(day, parseHM("07:05"));
    expect(timeStr(ts)).toBe("07:05");
  });
});

describe("shiftWindow (overnight handling)", () => {
  it("computes a same-day window normally", () => {
    const sh: Shift = { id: "s1", staffId: "p1", date: day, start: "09:00", end: "17:00" };
    const w = shiftWindow(sh);
    expect((w.end - w.start) / MIN).toBe(8 * 60);
  });

  it("adds 24h when end <= start (crosses midnight)", () => {
    const sh: Shift = { id: "s2", staffId: "p1", date: day, start: "22:00", end: "06:00" };
    const w = shiftWindow(sh);
    expect((w.end - w.start) / MIN).toBe(8 * 60); // 8 hours, not -16
  });

  it("treats end === start as a full 24h overnight shift, not zero-length", () => {
    const sh: Shift = { id: "s3", staffId: "p1", date: day, start: "10:00", end: "10:00" };
    const w = shiftWindow(sh);
    expect((w.end - w.start) / MIN).toBe(24 * 60);
  });
});

describe("weekDates (Monday-Sunday boundaries)", () => {
  it("returns Monday first for a Wednesday anchor", () => {
    const dates = weekDates(new Date(2026, 7, 12)); // Wed 2026-08-12
    expect(dates[0]).toBe("2026-08-10");
    expect(dates[6]).toBe("2026-08-16");
    expect(dates).toHaveLength(7);
  });

  it("returns the same Monday for a Sunday anchor (week ends on Sunday)", () => {
    const dates = weekDates(new Date(2026, 7, 16)); // Sun 2026-08-16
    expect(dates[0]).toBe("2026-08-10");
    expect(dates[6]).toBe("2026-08-16");
  });

  it("returns the anchor itself when anchor is a Monday", () => {
    const dates = weekDates(new Date(2026, 7, 10)); // Mon
    expect(dates[0]).toBe("2026-08-10");
  });

  it("handles a week that spans a month boundary", () => {
    const dates = weekDates(new Date(2026, 7, 2)); // Sun 2026-08-02
    expect(dates[0]).toBe("2026-07-27");
    expect(dates[6]).toBe("2026-08-02");
  });
});

describe("nearestShift (today and yesterday matching)", () => {
  const shifts: Shift[] = [
    { id: "sh1", staffId: "p1", date: day, start: "09:00", end: "17:00" },
    { id: "sh2", staffId: "p1", date: prevDay, start: "22:00", end: "06:00" }, // overnight into `day`
  ];

  it("finds the shift covering the current time on the same day", () => {
    const ts = atOn(day, parseHM("12:00"));
    const m = nearestShift(shifts, "p1", ts);
    expect(m?.shift.id).toBe("sh1");
  });

  it("finds yesterday's overnight shift when punching in the early hours", () => {
    const ts = atOn(day, parseHM("02:00"));
    const m = nearestShift(shifts, "p1", ts);
    expect(m?.shift.id).toBe("sh2");
  });

  it("falls back to nearest-by-distance within the catchment window", () => {
    const ts = atOn(day, parseHM("08:00")); // 1h before sh1 starts
    const m = nearestShift(shifts, "p1", ts);
    expect(m?.shift.id).toBe("sh1");
  });

  it("returns null outside the catchment window", () => {
    const ts = atOn(day, parseHM("12:00"));
    const m = nearestShift(shifts, "p2", ts); // no shifts for p2
    expect(m).toBeNull();
  });

  it("returns null when the nearest shift is beyond the default 240-minute catchment", () => {
    const farShifts: Shift[] = [
      { id: "sh3", staffId: "p2", date: day, start: "09:00", end: "17:00" },
    ];
    const ts = atOn(day, parseHM("22:00")); // 5h after end
    const m = nearestShift(farShifts, "p2", ts);
    expect(m).toBeNull();
  });
});

describe("flagIn / flagOut (grace boundaries, both ends)", () => {
  const sh: Shift = { id: "sh1", staffId: "p1", date: day, start: "09:00", end: "17:00" };
  const w = shiftWindow(sh);
  const match = { shift: sh, ...w, dist: 0 };

  it("flags unscheduled with no match", () => {
    expect(flagIn(null, w.start, 5)).toBe("unscheduled");
    expect(flagOut(null, w.end, 5)).toBe("unscheduled");
  });

  it("flags on-time exactly at grace boundary (start - grace)", () => {
    expect(flagIn(match, w.start - 5 * MIN, 5)).toBe("on-time");
  });

  it("flags early just outside the grace boundary", () => {
    expect(flagIn(match, w.start - 5 * MIN - 1, 5)).toBe("early");
  });

  it("flags on-time exactly at grace boundary (start + grace)", () => {
    expect(flagIn(match, w.start + 5 * MIN, 5)).toBe("on-time");
  });

  it("flags late just outside the grace boundary", () => {
    expect(flagIn(match, w.start + 5 * MIN + 1, 5)).toBe("late");
  });

  it("flags on-time for punch-out exactly at end - grace and end + grace", () => {
    expect(flagOut(match, w.end - 5 * MIN, 5)).toBe("on-time");
    expect(flagOut(match, w.end + 5 * MIN, 5)).toBe("on-time");
  });

  it("flags left-early before the grace window at shift end", () => {
    expect(flagOut(match, w.end - 5 * MIN - 1, 5)).toBe("left-early");
  });

  it("flags overtime after the grace window at shift end", () => {
    expect(flagOut(match, w.end + 5 * MIN + 1, 5)).toBe("overtime");
  });

  it("zero grace still allows exact on-time match", () => {
    expect(flagIn(match, w.start, 0)).toBe("on-time");
  });
});

describe("punch (state machine)", () => {
  it("opens a new session for a staff member with no open session", () => {
    const now = atOn(day, parseHM("09:00"));
    const r = punch({ staff, sessions: [], shifts: [], staffId: "p1", now, settings });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.action).toBe("in");
      expect(r.session.outAt).toBeNull();
      expect(r.sessions).toHaveLength(1);
    }
  });

  it("closes an open session on the second punch", () => {
    const inAt = atOn(day, parseHM("09:00"));
    const open: Session = {
      id: "sA", staffId: "p1", date: day, inAt, outAt: null, inFlag: "on-time", outFlag: null, shiftId: null,
    };
    const now = inAt + 2 * 60 * MIN; // 2 hours later, past cooldown
    const r = punch({ staff, sessions: [open], shifts: [], staffId: "p1", now, settings });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.action).toBe("out");
      expect(r.session.outAt).toBe(now);
    }
  });

  it("rejects punches for unknown staff", () => {
    const r = punch({ staff, sessions: [], shifts: [], staffId: "ghost", now: Date.now(), settings });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("unknown-staff");
  });

  it("rejects punches for inactive staff", () => {
    const r = punch({ staff, sessions: [], shifts: [], staffId: "p3", now: Date.now(), settings });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("inactive-staff");
  });

  it("blocks a double-scan into an open session within the cooldown", () => {
    const inAt = atOn(day, parseHM("09:00"));
    const open: Session = {
      id: "sA", staffId: "p1", date: day, inAt, outAt: null, inFlag: "on-time", outFlag: null, shiftId: null,
    };
    const now = inAt + 10000; // 10s later, cooldown is 60s
    const r = punch({ staff, sessions: [open], shifts: [], staffId: "p1", now, settings });
    expect(r.ok).toBe(false);
    if (!r.ok && r.reason === "cooldown") expect(r.waitMs).toBeGreaterThan(0);
  });

  it("blocks an instant re-punch-in right after signing out (cooldown covers both directions)", () => {
    const outAt = atOn(day, parseHM("12:00"));
    const closed: Session = {
      id: "sA", staffId: "p1", date: day, inAt: outAt - 60 * MIN, outAt, inFlag: "on-time", outFlag: "on-time", shiftId: null,
    };
    const now = outAt + 5000; // 5s later
    const r = punch({ staff, sessions: [closed], shifts: [], staffId: "p1", now, settings });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("cooldown");
  });

  it("allows punching back in once the cooldown has elapsed", () => {
    const outAt = atOn(day, parseHM("12:00"));
    const closed: Session = {
      id: "sA", staffId: "p1", date: day, inAt: outAt - 60 * MIN, outAt, inFlag: "on-time", outFlag: "on-time", shiftId: null,
    };
    const now = outAt + 61000;
    const r = punch({ staff, sessions: [closed], shifts: [], staffId: "p1", now, settings });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.action).toBe("in");
  });

  it("supports unlimited in/out sessions per day", () => {
    let sessions: Session[] = [];
    const t0 = atOn(day, parseHM("07:00"));
    const r1 = punch({ staff, sessions, shifts: [], staffId: "p1", now: t0, settings });
    if (r1.ok) sessions = r1.sessions;
    const r2 = punch({ staff, sessions, shifts: [], staffId: "p1", now: t0 + 2 * 60 * MIN, settings });
    if (r2.ok) sessions = r2.sessions;
    const r3 = punch({ staff, sessions, shifts: [], staffId: "p1", now: t0 + 3 * 60 * MIN, settings }); // lunch back in
    if (r3.ok) sessions = r3.sessions;
    expect(sessions).toHaveLength(2);
    expect(sessions.filter((s) => s.outAt == null)).toHaveLength(1);
  });

  it("credits an overnight session to the day it started", () => {
    const shifts: Shift[] = [{ id: "sh1", staffId: "p1", date: prevDay, start: "22:00", end: "06:00" }];
    const inAt = atOn(prevDay, parseHM("22:00"));
    const r1 = punch({ staff, sessions: [], shifts, staffId: "p1", now: inAt, settings });
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;
    expect(r1.session.date).toBe(prevDay);

    const outAt = atOn(day, parseHM("06:00"));
    const r2 = punch({ staff, sessions: r1.sessions, shifts, staffId: "p1", now: outAt, settings });
    expect(r2.ok).toBe(true);
    if (r2.ok) {
      expect(r2.session.date).toBe(prevDay); // still the day it started
      expect(sessionMinutes(r2.session, outAt)).toBe(8 * 60);
    }
  });

  it("never blocks a punch outside a scheduled shift -- it just flags it unscheduled", () => {
    const now = atOn(day, parseHM("03:00"));
    const r = punch({ staff, sessions: [], shifts: [], staffId: "p1", now, settings });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.flag).toBe("unscheduled");
  });
});

describe("sessionMinutes / totalsFor / rounding", () => {
  it("counts an open session against `now`", () => {
    const inAt = atOn(day, parseHM("09:00"));
    const s: Session = { id: "s1", staffId: "p1", date: day, inAt, outAt: null, inFlag: "on-time", outFlag: null, shiftId: null };
    const now = inAt + 90 * MIN;
    expect(sessionMinutes(s, now)).toBe(90);
  });

  it("counts a closed session against outAt regardless of now", () => {
    const inAt = atOn(day, parseHM("09:00"));
    const outAt = inAt + 60 * MIN;
    const s: Session = { id: "s1", staffId: "p1", date: day, inAt, outAt, inFlag: "on-time", outFlag: "on-time", shiftId: null };
    expect(sessionMinutes(s, outAt + 10 * MIN)).toBe(60);
  });

  it("never returns negative minutes", () => {
    const inAt = atOn(day, parseHM("09:00"));
    const s: Session = { id: "s1", staffId: "p1", date: day, inAt, outAt: null, inFlag: "on-time", outFlag: null, shiftId: null };
    expect(sessionMinutes(s, inAt - 1000)).toBe(0);
  });

  it("roundTo rounds to the nearest step", () => {
    expect(roundTo(93, 15)).toBe(90);
    expect(roundTo(97, 15)).toBe(90);
    expect(roundTo(98, 15)).toBe(105);
    expect(roundTo(93.4, 1)).toBe(93);
  });

  it("totalsFor sums minutes across the given days and applies rounding at display time only", () => {
    const inAt1 = atOn(day, parseHM("09:00"));
    const inAt2 = atOn(nextDay, parseHM("09:00"));
    const sessions: Session[] = [
      { id: "s1", staffId: "p1", date: day, inAt: inAt1, outAt: inAt1 + 61 * MIN, inFlag: "on-time", outFlag: "on-time", shiftId: null },
      { id: "s2", staffId: "p1", date: nextDay, inAt: inAt2, outAt: inAt2 + 60 * MIN, inFlag: "on-time", outFlag: "on-time", shiftId: null },
    ];
    const t = totalsFor(sessions, "p1", [day, nextDay], inAt2 + 60 * MIN, 15);
    expect(t.sessions).toBe(2);
    expect(t.rawMinutes).toBe(121);
    expect(t.minutes).toBe(120); // rounded for display
    expect(t.open).toBe(false);
  });

  it("totalsFor reports open when any matching session is still open", () => {
    const inAt = atOn(day, parseHM("09:00"));
    const sessions: Session[] = [
      { id: "s1", staffId: "p1", date: day, inAt, outAt: null, inFlag: "on-time", outFlag: null, shiftId: null },
    ];
    const t = totalsFor(sessions, "p1", [day], inAt + 30 * MIN, 1);
    expect(t.open).toBe(true);
  });

  it("totalsFor ignores sessions for other staff or other days", () => {
    const inAt = atOn(day, parseHM("09:00"));
    const sessions: Session[] = [
      { id: "s1", staffId: "p2", date: day, inAt, outAt: inAt + 60 * MIN, inFlag: "on-time", outFlag: "on-time", shiftId: null },
      { id: "s2", staffId: "p1", date: nextDay, inAt, outAt: inAt + 60 * MIN, inFlag: "on-time", outFlag: "on-time", shiftId: null },
    ];
    const t = totalsFor(sessions, "p1", [day], inAt + 60 * MIN, 1);
    expect(t.sessions).toBe(0);
  });
});

describe("hhmm formatting", () => {
  it("formats whole hours and minutes", () => {
    expect(hhmm(125)).toBe("2h 05m");
    expect(hhmm(0)).toBe("0h 00m");
    expect(hhmm(-5)).toBe("0h 00m");
  });
});

describe("rosterWeek", () => {
  it("builds a 7-day grid with scheduled minutes computed correctly for overnight shifts", () => {
    const shifts: Shift[] = [{ id: "sh1", staffId: "p1", date: day, start: "22:00", end: "06:00" }];
    const grid = rosterWeek({ staff: [staff[0]], shifts, sessions: [], anchor: new Date(2026, 7, 12), now: Date.now(), step: 1 });
    expect(grid.days).toHaveLength(7);
    const cell = grid.rows[0].cells.find((c) => c.date === day)!;
    expect(cell.scheduledMinutes).toBe(8 * 60);
  });

  it("computes weekWorked as the sum across all cells", () => {
    const inAt = atOn(day, parseHM("09:00"));
    const sessions: Session[] = [
      { id: "s1", staffId: "p1", date: day, inAt, outAt: inAt + 120 * MIN, inFlag: "on-time", outFlag: "on-time", shiftId: null },
    ];
    const grid = rosterWeek({ staff: [staff[0]], shifts: [], sessions, anchor: new Date(2026, 7, 12), now: Date.now(), step: 1 });
    expect(grid.rows[0].weekWorked.minutes).toBe(120);
  });
});

describe("timesheetCSV", () => {
  it("escapes embedded quotes and commas", () => {
    const weirdStaff: Staff[] = [{ id: "p1", name: 'Jo, "JJ" Smith', active: true }];
    const inAt = atOn(day, parseHM("09:00"));
    const sessions: Session[] = [
      { id: "s1", staffId: "p1", date: day, inAt, outAt: inAt + 60 * MIN, inFlag: "on-time", outFlag: "on-time", shiftId: null },
    ];
    const csv = timesheetCSV({ staff: weirdStaff, sessions, days: [day], step: 1, now: inAt + 60 * MIN });
    expect(csv).toContain('"Jo, ""JJ"" Smith"');
  });

  it("marks an open session as 'still in' with no out time", () => {
    const inAt = atOn(day, parseHM("09:00"));
    const sessions: Session[] = [
      { id: "s1", staffId: "p1", date: day, inAt, outAt: null, inFlag: "on-time", outFlag: null, shiftId: null },
    ];
    const csv = timesheetCSV({ staff: [staff[0]], sessions, days: [day], step: 1, now: inAt + 30 * MIN });
    expect(csv).toContain("still in");
  });

  it("only includes sessions within the requested days", () => {
    const inAt = atOn(day, parseHM("09:00"));
    const outsideInAt = atOn(nextDay, parseHM("09:00"));
    const sessions: Session[] = [
      { id: "s1", staffId: "p1", date: day, inAt, outAt: inAt + 60 * MIN, inFlag: "on-time", outFlag: "on-time", shiftId: null },
      { id: "s2", staffId: "p1", date: nextDay, inAt: outsideInAt, outAt: outsideInAt + 60 * MIN, inFlag: "on-time", outFlag: "on-time", shiftId: null },
    ];
    const csv = timesheetCSV({ staff: [staff[0]], sessions, days: [day], step: 1, now: outsideInAt + 60 * MIN });
    const lines = csv.split("\n");
    expect(lines).toHaveLength(2); // header + one row
  });

  it("includes a header row with the expected columns", () => {
    const csv = timesheetCSV({ staff: [], sessions: [], days: [day], step: 1, now: Date.now() });
    expect(csv.split("\n")[0]).toBe(
      '"Staff","Date","Signed in","Signed out","In","Out","Minutes","Hours"'
    );
  });
});
