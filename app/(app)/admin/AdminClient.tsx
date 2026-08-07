"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Download, LogOut } from "lucide-react";
import { hhmm, roundTo, sessionMinutes, timeStr, MIN, type Staff, type Session } from "@/lib/attendance";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { StaffEditor, type EditingStaff } from "./StaffEditor";
import { SessionEditor } from "./SessionEditor";
import { SettingsPane, type SettingsRow } from "./SettingsPane";

type Pane = "staff" | "hours" | "setup";

export function AdminClient({
  staff,
  sessions,
  settings,
  userEmail,
  now,
}: {
  staff: Staff[];
  sessions: Session[];
  settings: SettingsRow;
  userEmail: string;
  now: number;
}) {
  const router = useRouter();
  const [pane, setPane] = useState<Pane>("staff");
  const [editStaff, setEditStaff] = useState<EditingStaff | null>(null);
  const [editSession, setEditSession] = useState<Session | null>(null);

  const nameOf = (id: string) => staff.find((s) => s.id === id)?.name || "Unknown";

  const signOut = async () => {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  const saveStaff = async (body: EditingStaff & { deleted?: boolean }): Promise<{ ok: boolean; error?: string }> => {
    const res = await fetch("/api/admin/staff", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      return { ok: false, error: json.error || "Couldn't save." };
    }
    setEditStaff(null);
    router.refresh();
    return { ok: true };
  };

  const saveSession = async (body: { id: string; inTime: string; outTime: string | null; deleted?: boolean }) => {
    await fetch("/api/admin/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    setEditSession(null);
    router.refresh();
  };

  return (
    <section>
      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
        {(
          [
            ["staff", "Staff"],
            ["hours", "Timesheet"],
            ["setup", "Settings"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            className="cf-btn"
            style={id === pane ? { borderColor: "var(--brass)", color: "var(--brass)" } : {}}
            onClick={() => setPane(id)}
          >
            {label}
          </button>
        ))}
        <span className="cf-note" style={{ marginLeft: "auto" }}>
          {userEmail}
        </span>
        <button className="cf-btn" onClick={signOut}>
          <LogOut size={14} /> Sign out
        </button>
      </div>

      {pane === "staff" && (
        <>
          <div className="cf-floor">
            {staff.map((p) => (
              <div className="cf-row" key={p.id}>
                <span className="cf-dot" style={{ background: p.active === false ? "var(--line)" : "var(--mint)" }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{p.name}</div>
                  <div style={{ fontSize: 11, color: "var(--dim)" }}>
                    {p.role || "Staff"}
                    {p.active === false ? " · off" : ""}
                  </div>
                </div>
                <button
                  className="cf-btn"
                  style={{ padding: "6px 10px" }}
                  onClick={() => setEditStaff({ id: p.id, name: p.name, role: p.role || "Barista", pin: "", active: p.active !== false, isNew: false })}
                  aria-label={`Edit ${p.name}`}
                >
                  <Pencil size={14} />
                </button>
              </div>
            ))}
          </div>
          <button
            className="cf-btn p"
            style={{ marginTop: 12 }}
            onClick={() => setEditStaff({ id: "", name: "", role: "Barista", pin: "", active: true, isNew: true })}
          >
            <Plus size={15} /> Add staff
          </button>
        </>
      )}

      {pane === "hours" && (
        <>
          <div style={{ display: "flex", gap: 9, marginBottom: 12, flexWrap: "wrap" }}>
            <a className="cf-btn" href="/api/admin/timesheet?offset=0">
              <Download size={14} /> Export this week
            </a>
          </div>
          {sessions.length === 0 ? (
            <div className="cf-card cf-note">No punches this week yet.</div>
          ) : (
            <div className="cf-floor">
              {sessions.map((s) => {
                const stuck = s.outAt == null && now - s.inAt > 12 * 60 * MIN;
                return (
                  <div className="cf-row" key={s.id} style={stuck ? { borderColor: "var(--amber)" } : {}}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 13.5 }}>{nameOf(s.staffId)}</div>
                      <div className="cf-mono" style={{ fontSize: 11.5, color: "var(--dim)" }}>
                        {s.date} · {timeStr(s.inAt)} → {s.outAt ? timeStr(s.outAt) : "open"} ·{" "}
                        {hhmm(roundTo(sessionMinutes(s, now), settings.round_step))}
                      </div>
                    </div>
                    {stuck && (
                      <span className="cf-pill" style={{ color: "var(--amber)" }}>
                        Missed out
                      </span>
                    )}
                    <button className="cf-btn" style={{ padding: "6px 10px" }} onClick={() => setEditSession(s)} aria-label="Edit entry">
                      <Pencil size={14} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {pane === "setup" && <SettingsPane settings={settings} />}

      {editStaff && <StaffEditor person={editStaff} onSave={saveStaff} onClose={() => setEditStaff(null)} />}
      {editSession && (
        <SessionEditor session={editSession} name={nameOf(editSession.staffId)} onSave={saveSession} onClose={() => setEditSession(null)} />
      )}
    </section>
  );
}
