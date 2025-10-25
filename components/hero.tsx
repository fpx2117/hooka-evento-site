"use client";

import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Ticket, Calendar, MapPin } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { TicketSalesModal } from "./ticket-sales-modal";
import { VIPTableModal } from "./vip-table-modal";
import HeroBackgroundEasy from "@/components/HeroBackgroundEasy";

const TARGET_ISO = "2025-11-02T22:00:00-03:00"; // 02/11/2025 22:00 AR

export function Hero() {
  const [showTicketModal, setShowTicketModal] = useState(false);
  const [showVIPModal, setShowVIPModal] = useState(false);
  const [timeLeft, setTimeLeft] = useState({
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0,
  });
  const targetMs = useMemo(() => new Date(TARGET_ISO).getTime(), []);

  useEffect(() => {
    const tick = () => {
      const diff = Math.max(targetMs - Date.now(), 0);
      setTimeLeft({
        days: Math.floor(diff / 86_400_000),
        hours: Math.floor((diff % 86_400_000) / 3_600_000),
        minutes: Math.floor((diff % 3_600_000) / 60_000),
        seconds: Math.floor((diff % 60_000) / 1000),
      });
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [targetMs]);

  const pad = (n: number) => n.toString().padStart(2, "0");

  return (
    <section className="relative min-h-[100svh] overflow-hidden text-white">
      <HeroBackgroundEasy
        mobile={{ rows: 4, cols: 1 }}
        desktop={{ rows: 4, cols: 3 }}
        fontMobile="clamp(2.6rem, 21vw, 9rem)"
        opacity={0.65}
        gap="clamp(0px, 1vh, 10px)"
        navTopPx={72}
      />

      <div className="relative z-10 grid min-h-[100svh] grid-cols-1 grid-rows-[1.1fr_auto_auto_0.9fr] md:grid-rows-[1.25fr_auto_auto_0.75fr] place-items-center px-4">
        {/* LABIO */}
        <div className="row-start-2 translate-y-[clamp(18px,5.2vh,56px)] md:translate-y-[clamp(64px,10.5vh,170px)]">
          <div className="relative lip-wrap">
            <span aria-hidden className="lip-shine" />
            <Image
              src="/logov2.png"
              alt="Labios rojos"
              width={860}
              height={860}
              priority
              className="
                pointer-events-none select-none
                w-[70vw] max-w-[780px] min-w-[240px]
                drop-shadow-[0_10px_45px_rgba(0,0,0,0.55)]
                lip-float md:hover:lip-pop
                translate-x-[2px] md:translate-x-0
              "
            />
          </div>
        </div>

        {/* CONTENIDO — subido en DESKTOP */}
        <div className="row-start-3 w-full text-center md:-translate-y-[56px]">
          {/* aire para la gota (menos en desktop) */}
          <div className="mt-[clamp(14px,3.8vh,48px)] md:mt-3" />

          {/* Countdown con halo */}
          <div className="relative inline-flex items-end justify-center gap-3 sm:gap-4 md:gap-6">
            <span
              aria-hidden
              className="absolute -inset-x-[12%] -inset-y-[18%] -z-10 rounded-[999px] pointer-events-none"
              style={{
                background:
                  "radial-gradient(ellipse at center, rgba(0,0,0,.36) 0%, rgba(0,0,0,.22) 45%, rgba(0,0,0,0) 68%)",
                filter: "blur(6px)",
              }}
            />
            <TimeBox value={pad(timeLeft.days)} label="DÍAS" />
            <Sep />
            <TimeBox value={pad(timeLeft.hours)} label="HORAS" />
            <Sep />
            <TimeBox value={pad(timeLeft.minutes)} label="MIN" />
            <Sep />
            <TimeBox value={pad(timeLeft.seconds)} label="SEG" />
          </div>

          {/* separador */}
          <div className="mx-auto mt-3 h-[2px] w-[140px] sm:w-[180px] rounded-full bg-white/15" />

          {/* chips meta */}
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2 sm:gap-3">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/25 px-3 py-1 text-xs sm:text-sm backdrop-blur-[2px]">
              <Calendar className="h-3.5 w-3.5 opacity-90" />
              <span className="opacity-95">Dom 02/11 · 12:00</span>
            </span>
            <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/25 px-3 py-1 text-xs sm:text-sm backdrop-blur-[2px]">
              <MapPin className="h-3.5 w-3.5 opacity-90" />
              <span className="opacity-95">Ubicación secreta</span>
            </span>
          </div>

          <p className="text-sm md:text-base opacity-90 mt-2">
            Recibí el calor con nosotros
          </p>

          {/* CTA */}
          <div className="flex flex-col md:flex-row items-center justify-center gap-3 md:gap-4 pt-4 md:pt-5 px-4 w-full">
            <Button
              size="lg"
              onClick={() => setShowTicketModal(true)}
              className="
      w-full md:w-auto
      text-base sm:text-lg px-6 sm:px-8 py-5 sm:py-6 rounded-full
      bg-white text-[#5b0d0d] font-bold tracking-wide
      transition-transform duration-200 hover:scale-105 shadow-2xl
      hover:bg-[#5b0d0d] hover:text-white
      focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#5b0d0d]
    "
            >
              <Ticket className="w-5 h-5 mr-2" />
              ¡Reservá Entradas!
            </Button>

            <Button
              size="lg"
              onClick={() => setShowVIPModal(true)}
              className="
      w-full md:w-auto
      text-base sm:text-lg px-6 sm:px-8 py-5 sm:py-6 rounded-full
      bg-white text-[#5b0d0d] font-bold tracking-wide
      transition-transform duration-200 hover:scale-105 shadow-2xl
      hover:bg-[#5b0d0d] hover:text-white
      focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#5b0d0d]
    "
            >
              <Ticket className="w-5 h-5 mr-2" />
              ¡Reservá tu MESA VIP!
            </Button>
          </div>
        </div>

        <div className="row-start-1" />
        <div className="row-start-4" />
      </div>

      <TicketSalesModal
        open={showTicketModal}
        onOpenChange={setShowTicketModal}
      />

      <VIPTableModal open={showVIPModal} onOpenChange={setShowVIPModal} />

      <style jsx>{`
        @keyframes lipFloat {
          0% {
            transform: translateY(0) rotate(0deg);
          }
          50% {
            transform: translateY(8px) rotate(0.5deg);
          }
          100% {
            transform: translateY(0) rotate(0deg);
          }
        }
        @keyframes lipPop {
          0% {
            transform: scale(1);
          }
          50% {
            transform: scale(1.02);
          }
          100% {
            transform: scale(1);
          }
        }
        @keyframes lipShine {
          0% {
            transform: translateX(-130%) rotate(-18deg);
            opacity: 0;
          }
          10% {
            opacity: 0.25;
          }
          50% {
            opacity: 0.18;
          }
          100% {
            transform: translateX(130%) rotate(-18deg);
            opacity: 0;
          }
        }
        .lip-wrap {
          display: inline-block;
          position: relative;
        }
        .lip-float {
          animation: lipFloat 6.2s ease-in-out infinite;
        }
        .lip-pop {
          animation: lipPop 1.2s ease-in-out;
        }
        .lip-shine {
          position: absolute;
          top: 10%;
          left: -20%;
          width: 60%;
          height: 70%;
          background: linear-gradient(
            90deg,
            rgba(255, 255, 255, 0) 0%,
            rgba(255, 255, 255, 0.35) 50%,
            rgba(255, 255, 255, 0) 100%
          );
          filter: blur(6px);
          transform: translateX(-130%) rotate(-18deg);
          border-radius: 999px;
          pointer-events: none;
          animation: lipShine 6s linear infinite;
          mix-blend-mode: screen;
        }
        @media (prefers-reduced-motion: reduce) {
          .lip-float,
          .lip-pop,
          .lip-shine {
            animation: none !important;
          }
        }
      `}</style>
    </section>
  );
}

function TimeBox({ value, label }: { value: string; label: string }) {
  return (
    <div className="text-center">
      <div
        className="text-4xl sm:text-5xl md:text-5xl font-display font-extrabold"
        style={{
          textShadow: "0 2px 8px rgba(0,0,0,.55), 0 0 18px rgba(0,0,0,.35)",
        }}
      >
        {value}
      </div>
      <div
        className="text-[10px] md:text-xs mt-1 tracking-wide"
        style={{
          color: "rgba(255,255,255,.92)",
          textShadow: "0 1px 4px rgba(0,0,0,.45)",
        }}
      >
        {label}
      </div>
    </div>
  );
}

function Sep() {
  return (
    <div
      className="text-2xl sm:text-3xl md:text-4xl"
      style={{
        color: "rgba(255,255,255,.92)",
        textShadow: "0 2px 8px rgba(0,0,0,.55)",
      }}
    >
      :
    </div>
  );
}
