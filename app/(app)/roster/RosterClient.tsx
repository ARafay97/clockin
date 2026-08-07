"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { hhmm, type RosterRow } from "@/lib/attendance";
import { ShiftEditor, type EditingShift } from "./ShiftEditor";

export function RosterClient({
  grid,
  unlocked,
  offset,
}: {
  grid: { days: string[]; rows: RosterRow[] };
  unlocked: boolean;
  offset: number;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<EditingShift | null>(null);
  const today = new Date().toISOString().slice(0, 10);

  const label =
    offset === 0 ? "This week" : offset === 1 ? "Next week" : offset === -1 ? "Last week" : `Week of ${grid.days[0]}`;

  const save = async (shift: EditingShift) => {
    await fetch("/api/admin/shifts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(shift),
    });
    setEditing(null);
    router.refresh();
  };

  return (
    <section>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <h2 className="cf-h" style={{ margin: 0 }}>
          {label}
        </h2>
        <div style={{ display: "flex", gap: 7 }}>
          <Link className="cf-btn" style={{ padding: "6px 9px" }} href={`/roster?offset=${offset - 1}`} aria-label="Previous week">
            <ChevronLeft size={15} />
          </Link>
          <Link className="cf-btn" style={{ padding: "6px 11px", fontSize: 12 }} href="/roster?offset=0">
            Today
          </Link>
          <Link className="cf-btn" style={{ padding: "6px 9px" }} href={`/roster?offset=${offset + 1}`} aria-label="Next week">
            <ChevronRight size={15} />
          </Link>
        </div>
      </div>

      <div className="cf-card" style={{ padding: 10, overflowX: "auto" }}>
        <table className="cf-grid">
          <thead>
            <tr>
              <th style={{ textAlign: "left", paddingLeft: 8, minWidth: 110 }}>Staff</th>
              {grid.days.map((d) => {
                const dt = new Date(`${d}T00:00:00`);
                return (
                  <th key={d} style={{ color: d === today ? "var(--brass)" : undefined }}>
                    {dt.toLocaleDateString(undefined, { weekday: "short" })}
                    <br />
                    <span className="cf-mono" style={{ fontSize: 11, opacity: 0.8 }}>
                      {dt.getDate()}
                    </span>
                  </th>
                );
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
                      <span className="cf-mono" style={{ fontSize: 11.5 }}>
                        {sh.start}–{sh.end}
                      </span>
                      {cell.worked.sessions > 0 && (
                        <span className="cf-mono" style={{ fontSize: 10, color: cell.worked.open ? "var(--mint)" : "var(--dim)" }}>
                          {hhmm(cell.worked.minutes)}
                          {cell.worked.open ? " ·" : ""}
                        </span>
                      )}
                    </>
                  ) : cell.worked.sessions > 0 ? (
                    <span className="cf-mono" style={{ fontSize: 10.5, color: "var(--amber)" }}>
                      {hhmm(cell.worked.minutes)} extra
                    </span>
                  ) : (
                    <span style={{ color: "var(--dim)", fontSize: 11 }}>—</span>
                  );
                  return (
                    <td key={cell.date}>
                      {unlocked ? (
                        <button
                          type="button"
                          className={cls}
                          onClick={() =>
                            setEditing(
                              sh
                                ? { id: sh.id, staffId: sh.staffId, date: sh.date, start: sh.start, end: sh.end, isNew: false }
                                : {
                                    id: `sh_${cell.date}_${row.staff.id}_${Math.random().toString(36).slice(2, 6)}`,
                                    staffId: row.staff.id,
                                    date: cell.date,
                                    start: "09:00",
                                    end: "17:00",
                                    isNew: true,
                                  }
                            )
                          }
                          aria-label={`${sh ? "Edit" : "Add"} shift for ${row.staff.name} on ${cell.date}`}
                        >
                          {content}
                        </button>
                      ) : (
                        <div className={cls}>{content}</div>
                      )}
                    </td>
                  );
                })}
                <td>
                  <div className="cf-cell" style={{ borderColor: "transparent", background: "transparent" }}>
                    <span className="cf-mono" style={{ fontSize: 13, color: row.weekWorked.open ? "var(--mint)" : "var(--text)" }}>
                      {hhmm(row.weekWorked.minutes)}
                    </span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="cf-note" style={{ marginTop: 12 }}>
        {unlocked ? "Tap any cell to set or clear a shift." : "Sign in as a manager to edit shifts. Green totals are still running."}
      </p>

      {editing && (
        <ShiftEditor
          shift={editing}
          staffName={grid.rows.find((r) => r.staff.id === editing.staffId)?.staff.name}
          onSave={save}
          onClose={() => setEditing(null)}
        />
      )}
    </section>
  );
}
