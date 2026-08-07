"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export interface SettingsRow {
  site_id: string;
  cafe_name: string;
  grace_min: number;
  round_step: number;
  cooldown_sec: number;
  token_period_ms: number;
  timezone: string;
}

export function SettingsPane({ settings }: { settings: SettingsRow }) {
  const router = useRouter();
  const [form, setForm] = useState(settings);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

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
        <label className="cf-field">
          <span>Code changes every</span>
          <select value={form.token_period_ms} onChange={(e) => set("token_period_ms", Number(e.target.value))}>
            {[30000, 60000, 300000].map((v) => (
              <option key={v} value={v}>
                {v / 1000} seconds
              </option>
            ))}
          </select>
        </label>
        <button className="cf-btn p" style={{ width: "100%" }} onClick={save} disabled={saving}>
          {saving ? "Saving…" : saved ? "Saved" : "Save changes"}
        </button>
      </div>

      <div className="cf-card">
        <h3 className="cf-h">Security</h3>
        <p className="cf-note">
          The punch code secret and kiosk device token live in server environment variables, not this database --
          rotating either means updating the deploy&apos;s environment and redeploying, which immediately invalidates
          every code and kiosk link currently out there.
        </p>
      </div>
    </div>
  );
}
