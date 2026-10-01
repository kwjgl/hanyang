"use client";
import { useEffect, useState } from "react";

export function Toaster() {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const on = (e: Event) => {
      setMsg((e as CustomEvent<string>).detail);
      clearTimeout(t);
      t = setTimeout(() => setMsg(null), 2400);
    };
    window.addEventListener("strata-toast", on);
    return () => window.removeEventListener("strata-toast", on);
  }, []);
  return (
    <div className="toast" role="status" aria-live="polite" hidden={!msg}>
      {msg}
    </div>
  );
}
