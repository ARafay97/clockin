"use client";
import { useMemo } from "react";
import { encodeQR } from "@/lib/qr";

export function QRTicket({
  payload,
  code,
  msLeft,
  period,
  cafeName,
}: {
  payload: string;
  code: string;
  msLeft: number;
  period: number;
  cafeName: string;
}) {
  const qr = useMemo(() => {
    try {
      return encodeQR(payload, "M");
    } catch {
      return null;
    }
  }, [payload]);

  const path = useMemo(() => {
    if (!qr) return "";
    let d = "";
    for (let r = 0; r < qr.size; r++)
      for (let c = 0; c < qr.size; c++) if (qr.matrix[r][c]) d += `M${c} ${r}h1v1h-1z`;
    return d;
  }, [qr]);

  const pct = Math.max(0, Math.min(1, msLeft / period));
  const R = 15;
  const C = 2 * Math.PI * R;

  return (
    <div className="cf-ticket">
      <div className="tk-h">
        <span>{cafeName}</span>
        <span>Punch code</span>
      </div>
      {qr ? (
        <svg
          viewBox={`-2 -2 ${qr.size + 4} ${qr.size + 4}`}
          width="100%"
          role="img"
          aria-label="Scan this code with the staff app to sign in or out"
          style={{ display: "block", background: "#F4F1E8" }}
          shapeRendering="crispEdges"
        >
          <path d={path} fill="#12151f" />
        </svg>
      ) : (
        <div style={{ padding: 40, textAlign: "center" }}>Code unavailable</div>
      )}
      <div className="cf-code">
        <small>OR TYPE THIS CODE</small>
        {code}
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 9,
          justifyContent: "center",
          marginTop: 12,
          color: "#5c6273",
        }}
      >
        <svg width="36" height="36" viewBox="0 0 36 36" className="cf-ring" aria-hidden="true">
          <circle cx="18" cy="18" r={R} fill="none" stroke="#d8d4c6" strokeWidth="3" />
          <circle
            cx="18"
            cy="18"
            r={R}
            fill="none"
            stroke="#12151f"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={C}
            strokeDashoffset={C * (1 - pct)}
          />
        </svg>
        <span className="cf-mono" style={{ fontSize: 11, letterSpacing: ".1em" }}>
          NEW CODE IN {Math.ceil(msLeft / 1000)}s
        </span>
      </div>
    </div>
  );
}
