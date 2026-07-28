"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

/** Header credit-balance pill. Refreshes on mount and every 15s. */
export function CreditChip() {
  const [balance, setBalance] = useState<number | null>(null);
  const [plan, setPlan] = useState<string>("");

  useEffect(() => {
    let live = true;
    const load = () =>
      api
        .balance()
        .then((d) => {
          if (!live) return;
          setBalance(d.balance);
          setPlan(d.plan.id);
        })
        .catch(() => undefined);
    load();
    const t = setInterval(load, 15000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, []);

  return (
    <Link
      href="/credits"
      className="flex items-center gap-2 rounded-full border border-edge bg-panel px-3 py-1 text-xs hover:border-gold/60"
      title="Credits & billing"
    >
      <span className="text-gold">◆</span>
      <span className="font-semibold">{balance ?? "—"}</span>
      <span className="text-zinc-500">credits{plan ? ` · ${plan}` : ""}</span>
    </Link>
  );
}
