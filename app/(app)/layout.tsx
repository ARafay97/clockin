import type { ReactNode } from "react";
import { BottomNav } from "@/components/BottomNav";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="cf">
      <div className="cf-shell">{children}</div>
      <BottomNav />
    </div>
  );
}
