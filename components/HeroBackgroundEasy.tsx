"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";

// Lottie (opcional)
const Lottie = dynamic(() => import("lottie-react").then((m) => m.default), {
  ssr: false,
});

type GridSize = { rows: number; cols: number };

type Props = {
  mobile?: GridSize;
  desktop?: GridSize;
  showFallbackPalms?: boolean;
  fontMobile?: string;
  fontDesktop?: string;
  opacity?: number;
  gap?: string;
  cellPadX?: string;
  cellPadY?: string;
  gridPadX?: string;
  gridPadY?: string;
  /** Altura del navbar en px (si preferís respetarla, podés usarla) */
  navTopPx?: number;
};

const BG_BORDO = "#5b0d0d";
const TEXT_BEIGE = "#e3cfbf";

export default function HeroBackgroundEasy({
  mobile = { rows: 3, cols: 3 },
  desktop = { rows: 3, cols: 4 },
  showFallbackPalms = true,
  fontMobile = "min(19vw, 9.4rem)",
  fontDesktop = "min(14.5vw, 9rem)",
  opacity = 0.6,
  gap = "clamp(2px,0.8vw,12px)",
  cellPadX = "clamp(2px,0.6vw,10px)",
  cellPadY = "clamp(0px,0.4vh,6px)", // ↓ menos padding vertical por celda
  gridPadX = "clamp(4px,1.1vw,14px)",
  gridPadY = "0px", // ↓ sin padding vertical global (arranca al tope)
  navTopPx = 64,
}: Props) {
  const [animData, setAnimData] = useState<any | null>(null);

  useEffect(() => {
    fetch("/lottie/palms.json")
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => setAnimData(json))
      .catch(() => setAnimData(null));
  }, []);

  return (
    <div
      className="absolute inset-0 -z-20 pointer-events-none"
      style={{ backgroundColor: BG_BORDO }}
    >
      {/* Patrón HOOKA con drift */}
      <div className="absolute inset-0 hooka-anim">
        {/* Mobile */}
        <div className="sm:hidden h-full w-full">
          <HookaGrid
            rows={mobile.rows}
            cols={mobile.cols}
            fontMobile={fontMobile}
            fontDesktop={fontDesktop}
            opacity={opacity}
            gap={gap}
            cellPadX={cellPadX}
            cellPadY={cellPadY}
            gridPadX={gridPadX}
            gridPadY={gridPadY}
          />
        </div>
        {/* Desktop */}
        <div className="hidden sm:block h-full w-full">
          <HookaGrid
            rows={desktop.rows}
            cols={desktop.cols}
            fontMobile={fontMobile}
            fontDesktop={fontDesktop}
            opacity={opacity}
            gap={gap}
            cellPadX={cellPadX}
            cellPadY={cellPadY}
            gridPadX={gridPadX}
            gridPadY={gridPadY}
          />
        </div>
      </div>

      {/* Fondo animado (Lottie) o fallback de palmeras */}
      {animData ? (
        <div className="absolute inset-0 opacity-70">
          {/* @ts-ignore */}
          <Lottie animationData={animData} loop autoplay />
        </div>
      ) : showFallbackPalms ? (
        <FallbackPalms navTopPx={navTopPx} />
      ) : null}

      <style jsx>{`
        @keyframes hooka-drift {
          0% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(-20px);
          }
          100% {
            transform: translateY(0);
          }
        }
        .hooka-anim {
          animation: hooka-drift 22s ease-in-out infinite;
        }

        @keyframes palm-float-1 {
          0%,
          100% {
            transform: translateY(0) rotate(8deg) scale(0.92);
          }
          50% {
            transform: translateY(-8px) rotate(8deg) scale(0.94);
          }
        }
        @keyframes palm-float-2 {
          0%,
          100% {
            transform: translateY(0) rotate(4deg) scale(0.95);
          }
          50% {
            transform: translateY(7px) rotate(4deg) scale(0.97);
          }
        }
        .palm-float-1 {
          animation: palm-float-1 14s ease-in-out infinite;
        }
        .palm-float-2 {
          animation: palm-float-2 16s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}

function HookaGrid({
  rows,
  cols,
  fontMobile,
  fontDesktop,
  opacity,
  gap,
  cellPadX,
  cellPadY,
  gridPadX,
  gridPadY,
}: {
  rows: number;
  cols: number;
  fontMobile: string;
  fontDesktop: string;
  opacity: number;
  gap: string;
  cellPadX: string;
  cellPadY: string;
  gridPadX: string;
  gridPadY: string;
}) {
  return (
    <div
      className="grid h-full w-full"
      style={{
        gridTemplateRows: `repeat(${rows}, 1fr)`,
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gap,
        paddingInline: gridPadX,
        paddingBlock: gridPadY, // 0px → el patrón empieza desde arriba
      }}
    >
      {Array.from({ length: rows * cols }).map((_, i) => (
        <div
          key={i}
          className="flex items-center justify-center"
          style={{ paddingInline: cellPadX, paddingBlock: cellPadY }}
        >
          {/* Mobile */}
          <span
            className="sm:hidden font-black leading-none tracking-[-0.02em] select-none"
            style={{ color: TEXT_BEIGE, fontSize: fontMobile, opacity }}
          >
            HOOKA
          </span>
          {/* Desktop */}
          <span
            className="hidden sm:inline font-black leading-none tracking-[-0.02em] select-none"
            style={{ color: TEXT_BEIGE, fontSize: fontDesktop, opacity }}
          >
            HOOKA
          </span>
        </div>
      ))}
    </div>
  );
}

/** Palmeras: ahora la superior arranca pegada al top en todos los breakpoints */
function FallbackPalms({ navTopPx = 64 }: { navTopPx?: number }) {
  return (
    <>
      {/* TOP-RIGHT */}
      <img
        src="/palmeras1.png"
        alt=""
        className="pointer-events-none select-none absolute right-[-10px] md:right-[-16px] palm-float-1"
        style={{
          top: 0, // anclada al borde superior
          width: "38vw",
          maxWidth: 520,
        }}
      />

      {/* BOTTOM-LEFT */}
      <img
        src="/palmeras2.png"
        alt=""
        className="pointer-events-none select-none absolute bottom-[-100px] left-[-60px] palm-float-2"
        style={{ width: "40vw", maxWidth: 560 }}
      />
    </>
  );
}
