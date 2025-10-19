"use client";
import { useEffect, useState } from "react";

export default function useIsMobile(breakpoint: number = 640) {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia(`(max-width: ${breakpoint}px)`);
    const onChange = (e: MediaQueryListEvent | MediaQueryList) => {
      // @ts-ignore
      setIsMobile(!!e.matches);
    };
    onChange(mql as any);
    mql.addEventListener?.("change", onChange as any);
    return () => mql.removeEventListener?.("change", onChange as any);
  }, [breakpoint]);
  return isMobile;
}
