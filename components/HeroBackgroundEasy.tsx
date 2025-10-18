"use client";

import { useEffect, useState } from "react";

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
  /** Altura del navbar en px (si querés usarla) */
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
  cellPadY = "clamp(0px,0.4vh,6px)",
  gridPadX = "clamp(4px,1.1vw,14px)",
  gridPadY = "0px",
  navTopPx = 0,
}: Props) {
  // Si alguna vez volvés a Lottie, esto queda listo.
  const [hasPalms, setHasPalms] = useState(showFallbackPalms);
  useEffect(() => setHasPalms(showFallbackPalms), [showFallbackPalms]);

  return (
    <div
      className="absolute inset-0 pointer-events-none overflow-hidden"
      style={{ backgroundColor: BG_BORDO }}
    >
      {/* Capa 1: Grilla HOOKA (z-10) */}
      <div className="absolute inset-0 z-10 hooka-anim">
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

      {/* Capa 2: Overlay suave (no tapa HOOKA) (z-15) */}
      <div
        className="absolute inset-0 z-15"
        style={{
          background:
            "radial-gradient(130% 100% at 50% 40%, rgba(0,0,0,0.00) 0%, rgba(0,0,0,0.20) 60%, rgba(0,0,0,0.35) 100%)",
        }}
      />

      {/* Capa 3: Palmeras por encima de la grilla (z-20) */}
      {hasPalms && <FallbackPalms navTopPx={navTopPx} />}

      <style jsx>{`
        @keyframes hooka-drift {
          0% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(-14px);
          }
          100% {
            transform: translateY(0);
          }
        }
        .hooka-anim {
          animation: hooka-drift 22s ease-in-out infinite;
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
        paddingBlock: gridPadY,
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

/** Palmeras — ahora **dentro** del viewport, sin offsets negativos (evita franjas) */
function FallbackPalms({ navTopPx = 0 }: { navTopPx?: number }) {
  return (
    <>
      {/* TOP-RIGHT */}
      <img
        src="/palmeras1.png"
        alt=""
        className="pointer-events-none select-none absolute z-20"
        style={{
          top: navTopPx, // alineada con el top visible
          right: 0,
          width: "38vw",
          maxWidth: 520,
          transform: "translate(8%, -6%) rotate(8deg) scale(0.96)",
          filter: "drop-shadow(0 6px 12px rgba(0,0,0,0.25))",
        }}
      />

      {/* BOTTOM-LEFT */}
      <img
        src="/palmeras2.png"
        alt=""
        className="pointer-events-none select-none absolute z-20"
        style={{
          bottom: 0,
          left: 0,
          width: "40vw",
          maxWidth: 560,
          transform: "translate(-6%, 18%) rotate(3deg) scale(0.98)",
          filter: "drop-shadow(0 8px 14px rgba(0,0,0,0.3))",
        }}
      />
    </>
  );
}
