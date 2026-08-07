"use client";
import { useCallback, useEffect, useState } from "react";
import { Maximize2, Minimize2, Coffee } from "lucide-react";
import { QRTicket } from "@/components/QRTicket";
import { Flag } from "@/components/Flag";
import { hhmm, timeStr, MIN, type Flag as FlagType } from "@/lib/attendance";

interface KioskData {
  payload: string;
  code: string;
  msLeft: number;
  period: number;
  cafeName: string;
  now: number;
  onFloor: { staffId: string; name: string; inAt: number; inFlag: FlagType; minutes: number }[];
  today: { staffId: string; name: string; minutes: number; open: boolean }[];
}

const POLL_MS = 5000;

export function KioskClient({ device }: { device: string }) {
  const [data, setData] = useState<KioskData | null>(null);
  const [clientNow, setClientNow] = useState(() => Date.now());
  const [fetchedAt, setFetchedAt] = useState(() => Date.now());
  const [full, setFull] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/kiosk-code?device=${encodeURIComponent(device)}`, { cache: "no-store" });
      if (res.status === 401) {
        setError("Kiosk link rejected. Ask a manager to re-check the URL.");
        return;
      }
      if (!res.ok) {
        setError("The server isn't set up yet -- ask a manager to check the database is configured.");
        return;
      }
      const json = (await res.json()) as KioskData;
      setData(json);
      setFetchedAt(Date.now());
      setError(null);
    } catch {
      setError("Can't reach the server.");
    }
  }, [device]);

  useEffect(() => {
    // Polling an external endpoint on mount + interval is exactly what this
    // effect is for; `load` sets state asynchronously after its fetch
    // resolves, not synchronously within this effect body.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [load]);

  useEffect(() => {
    const id = setInterval(() => setClientNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  if (error) {
    return (
      <div className="cf" style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 20 }}>
        <div className="cf-card" style={{ maxWidth: 360, textAlign: "center" }}>
          <h1 className="cf-h">Trouble loading the kiosk</h1>
          <p className="cf-note">{error}</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="cf" style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
        <div className="cf-mono cf-live" style={{ color: "var(--dim)", fontSize: 13, letterSpacing: ".14em" }}>
          OPENING UP…
        </div>
      </div>
    );
  }

  const elapsed = clientNow - fetchedAt;
  const msLeft = Math.max(0, data.msLeft - elapsed);
  const nowDisplay = data.now + elapsed;

  // Encode a real URL rather than the bare payload, so any phone's native
  // camera app can scan it and open straight to the PIN screen -- scanning
  // inside the app (BarcodeDetector) still works too, but that API doesn't
  // exist in Safari on iOS, so this is the path that actually works there.
  const qrUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/punch?code=${encodeURIComponent(data.payload)}`
      : data.payload;

  const ticket = (
    <QRTicket payload={qrUrl} code={data.code} msLeft={msLeft} period={data.period} cafeName={data.cafeName} />
  );

  if (full) {
    return (
      <div
        className="cf"
        style={{ position: "fixed", inset: 0, background: "var(--ink)", zIndex: 50, display: "grid", placeItems: "center", padding: 20 }}
      >
        <div>
          {ticket}
          <button className="cf-btn" style={{ margin: "22px auto 0", display: "flex" }} onClick={() => setFull(false)}>
            <Minimize2 size={15} /> Exit full screen
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="cf">
      <div className="cf-shell" style={{ paddingBottom: 24 }}>
        <header className="cf-top">
          <div className="cf-brand">
            <Coffee size={19} style={{ color: "var(--brass)", flex: "none" }} aria-hidden="true" />
            <div style={{ minWidth: 0 }}>
              <h1>{data.cafeName}</h1>
              <div className="sub">{data.onFloor.length} on the floor</div>
            </div>
          </div>
          <div className="cf-clock">{timeStr(nowDisplay)}</div>
        </header>

        <div className="cf-split">
          <section>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <h2 className="cf-h">Tablet code</h2>
              <button className="cf-btn" style={{ padding: "5px 10px", fontSize: 12 }} onClick={() => setFull(true)}>
                <Maximize2 size={13} /> Full screen
              </button>
            </div>
            {ticket}
            <p
              className="cf-note"
              style={{ marginTop: 16, textAlign: "center", maxWidth: 330, marginLeft: "auto", marginRight: "auto" }}
            >
              Staff open the Punch page on their phone, scan, and enter their PIN. The code changes every{" "}
              {Math.round(data.period / 1000)} seconds, so a screenshot is useless from home.
            </p>
          </section>

          <section>
            <h2 className="cf-h">On the floor now</h2>
            {data.onFloor.length === 0 ? (
              <div className="cf-card cf-note">Nobody signed in. The next scan starts the day.</div>
            ) : (
              <div className="cf-floor">
                {data.onFloor.map((s) => {
                  const long = nowDisplay - s.inAt > 12 * 60 * MIN;
                  return (
                    <div className="cf-row" key={s.staffId}>
                      <span className="cf-dot cf-live" style={{ background: long ? "var(--amber)" : "var(--mint)" }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>{s.name}</div>
                        <div className="cf-mono" style={{ fontSize: 11, color: "var(--dim)" }}>
                          in at {timeStr(s.inAt)} · {hhmm(s.minutes)}
                        </div>
                      </div>
                      {long ? <span className="cf-pill" style={{ color: "var(--amber)" }}>Check</span> : <Flag f={s.inFlag} />}
                    </div>
                  );
                })}
              </div>
            )}

            <h2 className="cf-h" style={{ marginTop: 22 }}>
              Today so far
            </h2>
            {data.today.length === 0 ? (
              <div className="cf-card cf-note">No punches logged today yet.</div>
            ) : (
              <div className="cf-floor">
                {data.today.map((t) => (
                  <div className="cf-row" key={t.staffId}>
                    <div style={{ flex: 1 }}>{t.name}</div>
                    <div className="cf-mono" style={{ fontSize: 13, color: t.open ? "var(--mint)" : "var(--text)" }}>
                      {hhmm(t.minutes)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
