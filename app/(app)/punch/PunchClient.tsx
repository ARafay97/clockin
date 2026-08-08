"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ScanLine, Check, Clock } from "lucide-react";
import { BrowserQRCodeReader, type IScannerControls } from "@zxing/browser";
import { PinPad } from "@/components/PinPad";
import { Flag } from "@/components/Flag";
import { hhmm, type Flag as FlagType } from "@/lib/attendance";
import { CODE_LENGTH } from "@/lib/punch-constants";

type Step = "code" | "pin" | "done";

interface PunchOk {
  ok: true;
  action: "in" | "out";
  name: string;
  at: number;
  flag: FlagType;
  todayMinutes: number;
  weekMinutes: number;
}
interface PunchFail {
  ok: false;
  reason: string;
  message: string;
  waitMs?: number;
}
type PunchResponse = PunchOk | PunchFail;

const TOKEN_STALE_REASONS = new Set(["expired", "wrong-site", "bad-token", "not-a-cafe-code", "unreadable"]);

export function PunchClient({ initialCode }: { initialCode?: string }) {
  const [step, setStep] = useState<Step>(initialCode ? "pin" : "code");
  const [manual, setManual] = useState("");
  const [code, setCode] = useState<string | null>(initialCode ?? null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PunchOk | null>(null);
  const [pin, setPin] = useState("");
  const [scanning, setScanning] = useState(false);
  const [camState, setCamState] = useState<"idle" | "live" | "unsupported" | "denied">("idle");
  const [submitting, setSubmitting] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const acceptCode = useCallback((raw: string) => {
    const trimmed = (raw || "").trim();
    const looksValid = trimmed.includes("|") || trimmed.replace(/[^A-Za-z0-9]/g, "").length === CODE_LENGTH;
    if (!looksValid) {
      setError("Couldn't read that code.");
      return false;
    }
    setCode(trimmed);
    setError(null);
    setScanning(false);
    setStep("pin");
    setPin("");
    return true;
  }, []);

  useEffect(() => {
    if (!scanning) return;
    let dead = false;
    let controls: IScannerControls | undefined;

    (async () => {
      // Decodes QR frames from a canvas snapshot rather than a native
      // barcode-detection API, so it works in Safari on iOS -- not just
      // Chromium browsers, which are the only ones with `BarcodeDetector`.
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        setCamState("unsupported");
        return;
      }
      try {
        const reader = new BrowserQRCodeReader();
        controls = await reader.decodeFromConstraints(
          { video: { facingMode: "environment" } },
          videoRef.current ?? undefined,
          (result) => {
            if (dead || !result) return;
            if (acceptCode(result.getText())) controls?.stop();
          }
        );
        if (dead) {
          controls.stop();
          return;
        }
        setCamState("live");
      } catch {
        setCamState("denied");
      }
    })();

    return () => {
      dead = true;
      controls?.stop();
    };
  }, [scanning, acceptCode]);

  const submitPin = async (entered: string) => {
    if (!code || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/punch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code, pin: entered }),
      });
      const json = (await res.json()) as PunchResponse;
      if (json.ok) {
        setResult(json);
        setStep("done");
        setError(null);
        setPin("");
        return;
      }
      if (TOKEN_STALE_REASONS.has(json.reason)) {
        setStep("code");
        setCode(null);
        setManual("");
        setError(json.message || "That code isn't valid anymore. Scan or type the current one.");
        return;
      }
      setError(json.message || "Couldn't record that punch.");
      setPin("");
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
      setPin("");
    } finally {
      setSubmitting(false);
    }
  };

  const reset = () => {
    setStep("code");
    setResult(null);
    setError(null);
    setManual("");
    setCode(null);
    setPin("");
    setScanning(false);
    setCamState("idle");
  };

  if (step === "done" && result) {
    const inNow = result.action === "in";
    return (
      <div
        className="cf-card"
        style={{ maxWidth: 420, margin: "0 auto", textAlign: "center", borderColor: inNow ? "var(--mint)" : "var(--brass)" }}
      >
        <div
          style={{
            display: "grid",
            placeItems: "center",
            width: 54,
            height: 54,
            borderRadius: "50%",
            margin: "0 auto 14px",
            background: inNow ? "var(--mint)" : "var(--brass)",
            color: "#0B0F1A",
          }}
        >
          {inNow ? <Check size={26} /> : <Clock size={24} />}
        </div>
        <div style={{ fontSize: 19, fontWeight: 650 }}>{result.name}</div>
        <div className="cf-mono" style={{ fontSize: 15, color: "var(--dim)", margin: "6px 0 12px" }}>
          {inNow ? "Signed in" : "Signed out"}
        </div>
        <Flag f={result.flag} />
        <div style={{ display: "flex", gap: 12, marginTop: 20 }}>
          <div className="cf-row" style={{ flex: 1, flexDirection: "column", gap: 3 }}>
            <span className="cf-mono" style={{ fontSize: 17 }}>
              {hhmm(result.todayMinutes)}
            </span>
            <span style={{ fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--dim)" }}>Today</span>
          </div>
          <div className="cf-row" style={{ flex: 1, flexDirection: "column", gap: 3 }}>
            <span className="cf-mono" style={{ fontSize: 17 }}>
              {hhmm(result.weekMinutes)}
            </span>
            <span style={{ fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--dim)" }}>
              This week
            </span>
          </div>
        </div>
        <button className="cf-btn p" style={{ width: "100%", marginTop: 16 }} onClick={reset}>
          Done
        </button>
      </div>
    );
  }

  if (step === "pin") {
    return (
      <div className="cf-card" style={{ maxWidth: 380, margin: "0 auto" }}>
        <h2 className="cf-h" style={{ textAlign: "center" }}>
          Enter your PIN
        </h2>
        <PinPad
          value={pin}
          onChange={(v) => {
            setPin(v);
            setError(null);
          }}
          onSubmit={submitPin}
        />
        {error && <p style={{ color: "var(--coral)", fontSize: 13, textAlign: "center", marginTop: 14 }}>{error}</p>}
        <button className="cf-btn" style={{ width: "100%", marginTop: 16 }} onClick={reset}>
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 380, margin: "0 auto" }}>
      <h2 className="cf-h" style={{ textAlign: "center" }}>
        Scan the tablet
      </h2>
      {scanning ? (
        <div className="cf-scan">
          <video ref={videoRef} playsInline muted aria-label="Camera viewfinder" />
          <div className="cf-reticle" />
          {camState !== "live" && (
            <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", padding: 20, textAlign: "center" }}>
              <span className="cf-note">
                {camState === "unsupported"
                  ? "This browser doesn't support camera access. Type the code underneath it instead."
                  : camState === "denied"
                    ? "Camera blocked. Type the code shown under the QR instead."
                    : "Starting camera…"}
              </span>
            </div>
          )}
        </div>
      ) : (
        <button
          className="cf-btn p"
          style={{ width: "100%", padding: "16px" }}
          onClick={() => {
            setScanning(true);
            setCamState("idle");
            setError(null);
          }}
        >
          <ScanLine size={18} /> Open camera
        </button>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "18px 0 14px", color: "var(--dim)" }}>
        <span style={{ flex: 1, height: 1, background: "var(--line)" }} />
        <span style={{ fontSize: 10, letterSpacing: ".16em" }}>OR TYPE THE CODE</span>
        <span style={{ flex: 1, height: 1, background: "var(--line)" }} />
      </div>

      <div style={{ display: "flex", gap: 9 }}>
        <input
          className="cf-mono"
          value={manual}
          maxLength={10}
          placeholder="ABCDEF"
          aria-label="Punch code from the tablet"
          style={{ letterSpacing: ".14em", textTransform: "uppercase" }}
          onChange={(e) => {
            setManual(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => e.key === "Enter" && acceptCode(manual)}
        />
        <button
          className="cf-btn p"
          style={{ flex: "none" }}
          onClick={() => acceptCode(manual)}
          disabled={manual.trim().length < CODE_LENGTH}
        >
          Go
        </button>
      </div>

      {error && <p style={{ color: "var(--coral)", fontSize: 13, marginTop: 14 }}>{error}</p>}
      {scanning && (
        <button className="cf-btn" style={{ width: "100%", marginTop: 12 }} onClick={() => setScanning(false)}>
          Stop camera
        </button>
      )}
    </div>
  );
}
