import Link from "next/link";
import { Coffee, ScanLine, CalendarDays, Lock } from "lucide-react";

export default function Home() {
  return (
    <div className="cf" style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 20 }}>
      <div style={{ maxWidth: 360, width: "100%", textAlign: "center" }}>
        <Coffee size={28} style={{ color: "var(--brass)" }} aria-hidden="true" />
        <h1 style={{ fontSize: 15, fontWeight: 650, letterSpacing: ".14em", textTransform: "uppercase", margin: "10px 0 24px" }}>
          Cafe Attendance
        </h1>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <Link href="/punch" className="cf-btn p" style={{ padding: "14px" }}>
            <ScanLine size={16} /> Punch in or out
          </Link>
          <Link href="/roster" className="cf-btn" style={{ padding: "14px" }}>
            <CalendarDays size={16} /> View the roster
          </Link>
          <Link href="/login" className="cf-btn" style={{ padding: "14px" }}>
            <Lock size={16} /> Manager sign in
          </Link>
        </div>
        <p className="cf-note" style={{ marginTop: 20 }}>
          Signing in at the cafe? Look for the code on the tablet by the pass.
        </p>
      </div>
    </div>
  );
}
