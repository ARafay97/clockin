"use client";
import { useMemo } from "react";
import { encodeQR } from "@/lib/qr";

export function QRTicket({ payload, code, cafeName }: { payload: string; code: string; cafeName: string }) {
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

  return (
    <div className="cf-ticket">
      <div className="tk-h">
        <span>{cafeName}</span>
        <span>Punch code</span>
      </div>
      {qr ? (
        <svg
          viewBox={`-4 -4 ${qr.size + 8} ${qr.size + 8}`}
          width="100%"
          role="img"
          aria-label="Scan this code with your phone's camera to sign in or out"
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
    </div>
  );
}
