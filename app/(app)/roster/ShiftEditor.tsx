"use client";
import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Modal } from "@/components/Modal";
import { parseHM } from "@/lib/attendance";

export interface EditingShift {
  id: string;
  staffId: string;
  date: string;
  start: string;
  end: string;
  isNew: boolean;
}

export function ShiftEditor({
  shift,
  staffName,
  onSave,
  onClose,
}: {
  shift: EditingShift;
  staffName?: string;
  onSave: (shift: EditingShift & { deleted?: boolean }) => void;
  onClose: () => void;
}) {
  const [start, setStart] = useState(shift.start);
  const [end, setEnd] = useState(shift.end);
  const overnight = parseHM(end) <= parseHM(start);

  return (
    <Modal title={`${shift.isNew ? "Add" : "Edit"} shift`} onClose={onClose}>
      <p className="cf-note" style={{ marginBottom: 14 }}>
        {staffName || "Staff"} ·{" "}
        {new Date(`${shift.date}T00:00:00`).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}
      </p>
      <div style={{ display: "flex", gap: 12 }}>
        <label className="cf-field" style={{ flex: 1 }}>
          <span>Starts</span>
          <input type="time" value={start} onChange={(e) => setStart(e.target.value)} />
        </label>
        <label className="cf-field" style={{ flex: 1 }}>
          <span>Ends</span>
          <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
        </label>
      </div>
      {overnight && (
        <p className="cf-note" style={{ color: "var(--amber)", marginBottom: 12 }}>
          Runs past midnight — counted as an overnight shift.
        </p>
      )}
      <div style={{ display: "flex", gap: 9 }}>
        <button className="cf-btn p" style={{ flex: 1 }} onClick={() => onSave({ ...shift, start, end })}>
          Save shift
        </button>
        {!shift.isNew && (
          <button className="cf-btn d" onClick={() => onSave({ ...shift, deleted: true })} aria-label="Delete shift">
            <Trash2 size={15} />
          </button>
        )}
      </div>
    </Modal>
  );
}
