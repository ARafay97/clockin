import type { Staff, Shift, Session, Flag } from "@/lib/attendance";

/** snake_case DB row shapes <-> the engine's camelCase types. */

export interface StaffRow {
  id: string;
  site_id?: string;
  name: string;
  role: string | null;
  active: boolean;
  pin_hash?: string;
}
export interface ShiftRow {
  id: string;
  staff_id: string;
  date: string;
  start_time: string;
  end_time: string;
}
export interface SessionRow {
  id: string;
  staff_id: string;
  date: string;
  in_at: string;
  out_at: string | null;
  in_flag: Flag;
  out_flag: Flag | null;
  shift_id: string | null;
  edited_by?: string | null;
}

export const rowToStaff = (r: StaffRow): Staff => ({
  id: r.id,
  name: r.name,
  role: r.role,
  active: r.active,
});

export const rowToShift = (r: ShiftRow): Shift => ({
  id: r.id,
  staffId: r.staff_id,
  date: r.date,
  start: r.start_time.slice(0, 5),
  end: r.end_time.slice(0, 5),
});

export const rowToSession = (r: SessionRow): Session => ({
  id: r.id,
  staffId: r.staff_id,
  date: r.date,
  inAt: new Date(r.in_at).getTime(),
  outAt: r.out_at ? new Date(r.out_at).getTime() : null,
  inFlag: r.in_flag,
  outFlag: r.out_flag,
  shiftId: r.shift_id,
});
