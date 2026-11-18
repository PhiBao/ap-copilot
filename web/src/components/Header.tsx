"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useNetwork } from "@/lib/network";

const STEPS = [
  { href: "/", label: "Desk" },
  { href: "/payees", label: "Payees" },
  { href: "/batch", label: "Batch" },
  { href: "/proof", label: "Proof" },
  { href: "/docs", label: "Docs" },
];

export function Header() {
  const pathname = usePathname();
  const { net, select } = useNetwork();

  return (
    <header className="site-header">
      <div className="header-inner">
        <Link href="/" className="brand" aria-label="Ledgerly home">
          <span className="brand-mark" aria-hidden="true">
            <span className="mark-line mark-line-a" />
            <span className="mark-line mark-line-b" />
            <span className="mark-dot" />
          </span>
          <span className="brand-name">Ledgerly</span>
        </Link>

        <nav className="main-nav" aria-label="Primary">
          {STEPS.map((s, i) => {
            const active = s.href === "/" ? pathname === "/" : pathname.startsWith(s.href);
            return (
              <Link key={s.href} href={s.href} className={active ? "nav-link active" : "nav-link"}>
                <span className="nav-index">{String(i + 1).padStart(2, "0")}</span>
                {s.label}
              </Link>
            );
          })}
        </nav>

        <div className="header-actions">
          <label className="network-select">
            <span className="sr-only">Network</span>
            <select value={net.key} onChange={(e) => select(e.target.value as "aevum" | "fork" | "local")}>
              <option value="aevum">Aevum</option>
              <option value="fork">Local fork</option>
              <option value="local">Local</option>
            </select>
          </label>
          <ConnectButton accountStatus="address" chainStatus="none" showBalance={false} />
        </div>
      </div>
    </header>
  );
}
