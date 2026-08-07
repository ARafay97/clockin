import { X } from "lucide-react";
import type { ReactNode } from "react";

export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div
      className="cf-flash"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="cf-modal">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h3 className="cf-h" style={{ margin: 0 }}>
            {title}
          </h3>
          <button onClick={onClose} aria-label="Close" style={{ color: "var(--dim)" }}>
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
