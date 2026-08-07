import type { Flag as FlagType } from "@/lib/attendance";

const FLAG_STYLE: Record<FlagType, { c: string; label: string }> = {
  "on-time": { c: "var(--mint)", label: "On time" },
  late: { c: "var(--coral)", label: "Late" },
  early: { c: "var(--amber)", label: "Early" },
  "left-early": { c: "var(--amber)", label: "Left early" },
  overtime: { c: "var(--brass)", label: "Overtime" },
  unscheduled: { c: "var(--dim)", label: "Unscheduled" },
};

export function Flag({ f }: { f: FlagType }) {
  const s = FLAG_STYLE[f] || FLAG_STYLE.unscheduled;
  return (
    <span className="cf-pill" style={{ color: s.c }}>
      {s.label}
    </span>
  );
}
