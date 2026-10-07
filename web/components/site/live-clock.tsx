"use client";

import { useEffect, useRef } from "react";
import { pad } from "./motion";

/**
 * The visitor's local wall clock, ticking. grindeasy decides everything from
 * timestamps, so the page keeps one running in its chrome. Written straight to
 * the DOM once a second; the server render shows a blank placeholder of the
 * same width so hydration never disagrees about the time.
 */
export function LiveClock({ className }: { className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const write = () => {
      const d = new Date();
      if (ref.current)
        ref.current.textContent = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    };
    write();
    const id = setInterval(write, 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <span ref={ref} className={className} suppressHydrationWarning>
      --:--:--
    </span>
  );
}
