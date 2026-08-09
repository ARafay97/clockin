"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound } from "lucide-react";

export interface SettingsRow {
  site_id: string;
  cafe_name: string;
  grace_min: number;
  round_step: number;
  cooldown_sec: number;
  token_epoch?: number;
  timezone: string;
}

export function SettingsPane({ settings }: { settings: SettingsRow }) {
  const router = useRouter();
  const [form, setForm] = useState(settings);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [confirmRotate, setConfirmRotate] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [rotateError, setRotateError] = useState<string | null>(null);

  const set = <K extends keyof SettingsRow>(key: K, value: SettingsRow[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setSaved(false);
  };

  const save = async () => {
    setSaving(true);
    await fetch("/api/admin/settings", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(form),
    });
    setSaving(false);
    setSaved(true);
    router.refresh();
  };

  const rotate = async () => {
    setRotating(true);
    setRotateError(null);
    const res = await fetch("/api/admin/rotate-code", { method: "POST" });
    setRotating(false);
    setConfirmRotate(false);
    if (!res.ok) {
      setRotateError("Couldn't rotate the code. Try again.");
      return;
    }
    router.refresh();
  };

  return (
    <div className="cf-split">
      <div className="cf-card">
        <h3 className="cf-h">Cafe</h3>
        <label className="cf-field">
          <span>Name</span>
          <input value={form.cafe_name} onChange={(e) => set("cafe_name", e.target.value)} />
        </label>
        <label className="cf-field">
          <span>Timezone</span>
          <input value={form.timezone} onChange={(e) => set("timezone", e.target.value)} placeholder="Europe/London" />
        </label>
      </div>

      <div className="cf-card">
        <h3 className="cf-h">Rules</h3>
        <label className="cf-field">
          <span>Grace either side of a shift</span>
          <select value={form.grace_min} onChange={(e) => set("grace_min", Number(e.target.value))}>
            {[0, 5, 10, 15, 30].map((v) => (
              <option key={v} value={v}>
                {v} minutes
              </option>
            ))}
          </select>
        </label>
        <label className="cf-field">
          <span>Round hours to</span>
          <select value={form.round_step} onChange={(e) => set("round_step", Number(e.target.value))}>
            {[1, 5, 15, 30].map((v) => (
              <option key={v} value={v}>
                {v === 1 ? "the minute" : `${v} minutes`}
              </option>
            ))}
          </select>
        </label>
        <label className="cf-field">
          <span>Wait between scans</span>
          <select value={form.cooldown_sec} onChange={(e) => set("cooldown_sec", Number(e.target.value))}>
            {[0, 30, 60, 120, 300].map((v) => (
              <option key={v} value={v}>
                {v === 0 ? "no wait" : `${v} seconds`}
              </option>
            ))}
          </select>
        </label>
        <button className="cf-btn p" style={{ width: "100%" }} onClick={save} disabled={saving}>
          {saving ? "Saving…" : saved ? "Saved" : "Save changes"}
        </button>
      </div>

      <div className="cf-card">
        <h3 className="cf-h">Punch code</h3>
        <p className="cf-note" style={{ marginBottom: 12 }}>
          The printed/QR punch code doesn&apos;t expire on its own. Rotating it here generates a new one immediately
          and permanently invalidates the old one -- use it if a printed sheet or photo of it gets shared outside
          the cafe. You&apos;ll need to print and post the new code from the Kiosk page afterwards.
        </p>
        {confirmRotate ? (
          <>
            <p className="cf-note" style={{ color: "var(--amber)", marginBottom: 12 }}>
              Every staff member will need the new code -- old printed sheets stop working the moment you confirm.
            </p>
            <div style={{ display: "flex", gap: 9 }}>
              <button className="cf-btn d" onClick={rotate} disabled={rotating}>
                {rotating ? "Rotating…" : "Yes, rotate now"}
              </button>
              <button className="cf-btn" onClick={() => setConfirmRotate(false)} disabled={rotating}>
                Cancel
              </button>
            </div>
          </>
        ) : (
          <button className="cf-btn" onClick={() => setConfirmRotate(true)}>
            <KeyRound size={14} /> Rotate the punch code
          </button>
        )}
        {rotateError && <p style={{ color: "var(--coral)", fontSize: 12, marginTop: 12 }}>{rotateError}</p>}
      </div>

      <div className="cf-card">
        <h3 className="cf-h">Security</h3>
        <p className="cf-note">
          The underlying secret and the kiosk device token live in server environment variables, not this database
          -- rotating either means updating the deploy&apos;s environment and redeploying, which also invalidates the
          current punch code.
        </p>
      </div>
    </div>
  );
}
