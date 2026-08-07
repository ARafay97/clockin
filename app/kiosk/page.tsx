import { isValidDeviceToken } from "@/lib/kiosk-auth";
import { KioskClient } from "./KioskClient";

export default async function KioskPage({
  searchParams,
}: {
  searchParams: Promise<{ device?: string }>;
}) {
  const { device } = await searchParams;

  if (!isValidDeviceToken(device)) {
    return (
      <div className="cf" style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 20 }}>
        <div className="cf-card" style={{ maxWidth: 360, textAlign: "center" }}>
          <h1 className="cf-h">Kiosk locked</h1>
          <p className="cf-note">This tablet needs its device link. Ask a manager for the kiosk URL.</p>
        </div>
      </div>
    );
  }

  return <KioskClient device={device as string} />;
}
