"use client";

import { gsap } from "gsap";
import { useEffect, useRef, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { UserCard } from "@/components/user-card";
import type { UserCardData } from "@/lib/core/user-card";

/**
 * Top-right account control layered over the leaderboard. Signed out, it is a
 * single "Sign in" button. Signed in, it is an avatar pill that opens the
 * personal dashboard as a dropdown panel with a short GSAP reveal.
 */
export function UserMenu({ data }: { data: UserCardData | null }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on outside click or Escape while the panel is open.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Play the reveal when the panel mounts: the panel eases down, then its rows
  // stagger in. Reduced motion snaps straight to the final state.
  useEffect(() => {
    const panel = panelRef.current;
    if (!open || !panel) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      gsap.set(panel, { opacity: 1, y: 0, scale: 1 });
      return;
    }
    const rows = panel.querySelectorAll(".glass-panel > *");
    const tl = gsap.timeline();
    tl.fromTo(
      panel,
      { opacity: 0, y: -8, scale: 0.96 },
      { opacity: 1, y: 0, scale: 1, duration: 0.32, ease: "power3.out" },
    ).fromTo(
      rows,
      { opacity: 0, y: 6 },
      { opacity: 1, y: 0, duration: 0.28, ease: "power2.out", stagger: 0.045 },
      "-=0.18",
    );
    return () => {
      tl.kill();
    };
  }, [open]);

  if (!data) {
    return (
      <a
        href="/auth/login?next=/"
        className="rounded-lg border border-input bg-card/70 px-3.5 py-2 text-[13px] font-medium text-foreground backdrop-blur-sm transition-colors hover:bg-secondary/70"
      >
        Sign in
      </a>
    );
  }

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-full border border-input bg-card/70 py-1 pl-1 pr-3 text-[13px] font-medium text-foreground backdrop-blur-sm transition-colors hover:bg-secondary/70"
      >
        <span className="relative">
          <Avatar className="h-7 w-7 rounded-full">
            {data.avatarUrl ? <AvatarImage src={data.avatarUrl} alt="" /> : null}
            <AvatarFallback className="rounded-full bg-secondary text-[10px] text-muted-foreground">
              {data.username.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          {data.isOnline ? (
            <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-card bg-primary" />
          ) : null}
        </span>
        <span className="max-w-[10ch] truncate">{data.username}</span>
      </button>

      {open ? (
        <div ref={panelRef} className="absolute right-0 top-[calc(100%+0.5rem)] z-20">
          <UserCard data={data} />
        </div>
      ) : null}
    </div>
  );
}
