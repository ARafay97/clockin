"use client";
import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Modal } from "@/components/Modal";
import { timeStr, type Session } from "@/lib/attendance";

export function SessionEditor({
  session,
  name,
  onSave,
  onClose,
}: {
  session: Session;
  name: string;
  onSave: (body: { id: string; inTime: string; outTime: string | null; deleted?: boolean }) => void;
  onClose: () => void;
}) {
  const [inT, setInT] = useState(timeStr(session.inAt));
  const [outT, setOutT] = useState(session.outAt ? timeStr(session.outAt) : "");

  return (
    <Modal title="Correct entry" onClose={onClose}>
      <p className="cf-note" style={{ marginBottom: 14 }}>
        {name} · {session.date}
      </p>
      <div style={{ display: "flex", gap: 12 }}>
        <label className="cf-field" style={{ flex: 1 }}>
          <span>Signed in</span>
          <input type="time" value={inT} onChange={(e) => setInT(e.target.value)} />
        </label>
        <label className="cf-field" style={{ flex: 1 }}>
          <span>Signed out</span>
          <input type="time" value={outT} onChange={(e) => setOutT(e.target.value)} />
        </label>
      </div>
      <p className="cf-note" style={{ marginBottom: 14 }}>
        Leave the sign-out blank to keep the shift open.
      </p>
      <div style={{ display: "flex", gap: 9 }}>
        <button className="cf-btn p" style={{ flex: 1 }} onClick={() => onSave({ id: session.id, inTime: inT, outTime: outT || null })}>
          Save entry
        </button>
        <button className="cf-btn d" onClick={() => onSave({ id: session.id, inTime: inT, outTime: outT || null, deleted: true })} aria-label="Delete entry">
          <Trash2 size={15} />
        </button>
      </div>
    </Modal>
  );
}
