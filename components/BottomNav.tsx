"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ScanLine, CalendarDays, Lock } from "lucide-react";

const TABS = [
  { href: "/punch", label: "Punch", Icon: ScanLine },
  { href: "/roster", label: "Roster", Icon: CalendarDays },
  { href: "/admin", label: "Admin", Icon: Lock },
];

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="cf-tabs" aria-label="Main">
      {TABS.map(({ href, label, Icon }) => {
        const on = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link key={href} href={href} className="cf-tab" data-on={on ? "1" : "0"} aria-current={on ? "page" : undefined}>
            <Icon size={18} aria-hidden="true" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
