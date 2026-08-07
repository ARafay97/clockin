"use client";
import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Modal } from "@/components/Modal";

export interface EditingStaff {
  id: string;
  name: string;
  role: string;
  pin: string;
  active: boolean;
  isNew: boolean;
}

export function StaffEditor({
  person,
  onSave,
  onClose,
}: {
  person: EditingStaff;
  onSave: (person: EditingStaff & { deleted?: boolean }) => Promise<{ ok: boolean; error?: string }>;
  onClose: () => void;
}) {
  const [p, setP] = useState(person);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const pinLooksValid = p.isNew ? /^\d{4}$/.test(p.pin) : p.pin === "" || /^\d{4}$/.test(p.pin);
  const bad = !p.name.trim() || !pinLooksValid;

  const submit = async () => {
    setSaving(true);
    const result = await onSave({ ...p, name: p.name.trim() });
    setSaving(false);
    if (!result.ok) setError(result.error || "Couldn't save.");
  };

  const remove = async () => {
    setSaving(true);
    const result = await onSave({ ...p, deleted: true });
    setSaving(false);
    if (!result.ok) setError(result.error || "Couldn't remove.");
  };

  return (
    <Modal title={person.isNew ? "Add staff" : "Edit staff"} onClose={onClose}>
      <label className="cf-field">
        <span>Name</span>
        <input value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} placeholder="Full name" />
      </label>
      <label className="cf-field">
        <span>Role</span>
        <input value={p.role} onChange={(e) => setP({ ...p, role: e.target.value })} placeholder="Barista" />
      </label>
      <label className="cf-field">
        <span>{person.isNew ? "4-digit PIN" : "New PIN (leave blank to keep the current one)"}</span>
        <input
          className="cf-mono"
          value={p.pin}
          inputMode="numeric"
          maxLength={4}
          onChange={(e) => setP({ ...p, pin: e.target.value.replace(/\D/g, "").slice(0, 4) })}
          placeholder="0000"
        />
      </label>
      <label className="cf-field" style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <input
          type="checkbox"
          checked={p.active}
          onChange={(e) => setP({ ...p, active: e.target.checked })}
          style={{ width: 17, height: 17, accentColor: "#D6A354" }}
        />
        <span style={{ margin: 0 }}>Can sign in</span>
      </label>
      {error && <p style={{ color: "var(--coral)", fontSize: 12, marginBottom: 12 }}>{error}</p>}
      <div style={{ display: "flex", gap: 9, marginTop: 6 }}>
        <button className="cf-btn p" style={{ flex: 1 }} disabled={bad || saving} onClick={submit}>
          Save
        </button>
        {!person.isNew && (
          <button className="cf-btn d" disabled={saving} onClick={remove} aria-label="Remove staff">
            <Trash2 size={15} />
          </button>
        )}
      </div>
    </Modal>
  );
}
