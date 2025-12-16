"use client";

import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Ticket, Calendar, MapPin } from "lucide-react";
import { useEffect, useMemo, useState, useCallback } from "react";
import { TicketSalesModal } from "./ticket-sales-modal";
import { VIPTableModal } from "./vip-table-modal";
import HeroBackgroundEasy from "@/components/HeroBackgroundEasy";

// ----------------------------------------------------
// Tipos para mayor claridad y seguridad
// ----------------------------------------------------

interface EventData {
  id: string;
  label: string;
  iso: string;
  tag: string;
}

interface TimerState {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

interface SortedCountdown extends EventData {
  time: TimerState;
  targetMs: number;
  size: "big" | "medium" | "small";
}

// 🔥 Tres fechas del countdown
const EVENTS: EventData[] = [
  {
    id: "1",
    label: "25-12-2025",
    iso: "2025-12-25T12:00:00-03:00",
    tag: "NAVIDAD",
  },
  {
    id: "2",
    label: "31-12-2025",
    iso: "2025-12-31T12:00:00-03:00",
    tag: "SEGUNDA FECHA",
  },
];

// ----------------------------------------------------
// Componente Hero Principal
// ----------------------------------------------------

export function Hero() {
  const [showTicketModal, setShowTicketModal] = useState(false);
  const [showVIPModal, setShowVIPModal] = useState(false);
  const [timers, setTimers] = useState<TimerState[]>(
    EVENTS.map(() => ({
      days: 0,
      hours: 0,
      minutes: 0,
      seconds: 0,
    }))
  );
  const [error, setError] = useState<string | null>(null);

  const targetMsList = useMemo(
    () => EVENTS.map((e) => new Date(e.iso).getTime()),
    []
  );

  const pad = useCallback((n: number): string => n.toString().padStart(2, "0"), []);

  useEffect(() => {
    const tick = () => {
      try {
        const now = Date.now();
        const updated = targetMsList.map((target) => {
          const diff = Math.max(target - now, 0); 
          const MS_PER_DAY = 86_400_000;
          const MS_PER_HOUR = 3_600_000;
          const MS_PER_MINUTE = 60_000;
          const MS_PER_SECOND = 1000;

          return {
            days: Math.floor(diff / MS_PER_DAY),
            hours: Math.floor((diff % MS_PER_DAY) / MS_PER_HOUR),
            minutes: Math.floor((diff % MS_PER_HOUR) / MS_PER_MINUTE),
            seconds: Math.floor((diff % MS_PER_MINUTE) / MS_PER_SECOND),
          };
        });
        setTimers(updated);
      } catch (err) {
        console.error('Error in tick function:', err);
        setError('Error updating countdown');
      }
    };

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [targetMsList]);

  const sortedCountdowns: SortedCountdown[] = useMemo(() => {
    try {
      return EVENTS.map((event, index) => ({
        ...event,
        time: timers[index],
        targetMs: targetMsList[index],
      }))
        .sort((a, b) => a.targetMs - b.targetMs)
        .map((item, index) => ({
          ...item,
          size: index === 0 ? "big" : index === 1 ? "medium" : "small",
        }));
    } catch (err) {
      console.error('Error sorting countdowns:', err);
      setError('Error processing events');
      return [];
    }
  }, [timers, targetMsList]);

  const handleTicketModalOpen = useCallback((open: boolean) => {
    try {
      setShowTicketModal(open);
      setError(null);
    } catch (err) {
      console.error('Error opening ticket modal:', err);
      setError('Error opening ticket modal');
    }
  }, []);

  const handleVIPModalOpen = useCallback((open: boolean) => {
    try {
      setShowVIPModal(open);
      setError(null);
    } catch (err) {
      console.error('Error opening VIP modal:', err);
      setError('Error opening VIP modal');
    }
  }, []);

  // Si hay un error crítico, mostrar mensaje simple
  if (error) {
    return (
      <section className="relative min-h-[100svh] bg-red-600 flex items-center justify-center text-white">
        <div className="text-center p-8">
          <h1 className="text-2xl font-bold mb-4">Error</h1>
          <p className="mb-4">{error}</p>
          <Button 
            onClick={() => setError(null)}
            className="bg-white text-red-600 hover:bg-gray-100"
          >
            Reintentar
          </Button>
        </div>
      </section>
    );
  }

  return (
    <section className="relative min-h-[100svh] overflow-hidden text-white">
      {/* Fondo rojo sólido como respaldo */}
      <div className="absolute inset-0 bg-red-600 z-0" />
      
      {/* HeroBackgroundEasy envuelto en un contenedor con altura completa */}
      <div className="absolute inset-0 z-0 min-h-[100svh]">
        <HeroBackgroundEasy
          mobile={{ rows: 4, cols: 1 }}
          desktop={{ rows: 4, cols: 3 }}
          fontMobile="clamp(2.6rem, 21vw, 9rem)"
          opacity={0.75}
          gap="clamp(0px, 1vh, 10px)"
          navTopPx={72}
        />
      </div>

      <div className="relative z-10 grid min-h-[100svh] grid-cols-1 grid-rows-[1.1fr_auto_auto_1fr] md:grid-rows-[1.25fr_auto_auto_0.75fr] place-items-center px-4 pb-8">
        {/* Lips / logo */}
        <div className="row-start-2 translate-y-[clamp(18px,5.2vh,56px)] md:translate-y-[clamp(64px,10.5vh,170px)]">
          <div className="relative lip-wrap">
            <span aria-hidden className="lip-shine" />
            <Image
              src="/logov2.png"
              alt="Labios rojos"
              width={860}
              height={860}
              priority
              className={`
                pointer-events-none select-none
                w-[70vw] max-w-[780px] min-w-[240px]
                drop-shadow-[0_10px_45px_rgba(0,0,0,0.55)]
                lip-float md:hover:lip-pop
                translate-x-[2px] md:translate-x-0
              `}
              onError={(e) => {
                console.error('Error loading image');
                setError('Error loading image');
              }}
            />
          </div>
        </div>

        {/* Countdown + info */}
        <div className="row-start-3 w-full text-center md:-translate-y-[56px]">
          <div className="mt-[clamp(14px,3.8vh,48px)] md:mt-3" />

          <div
            className={`
              flex flex-col 
              items-center 
              justify-center
              w-full 
              gap-1
              pt-2 
              md:pt-3
              relative 
              z-[12]
            `}
            style={{
              marginTop: "clamp(10px, 3vh, 40px)",
            }}
          >
           {sortedCountdowns.map((cd, index) => {
              const scaleClass =
                index === 0
                  ? "scale-110 md:scale-125"
                  : "scale-70 md:scale-80";

              const verticalMargin =
                index === 1 
                  ? "mt-2 -mb-6 md:-mb-8"
                  : index === 2 
                  ? "mt-4 -mb-4 md:-mb-6"
                  : "";
              
              const timePassed =
                cd.time.days === 0 &&
                cd.time.hours === 0 &&
                cd.time.minutes === 0 &&
                cd.time.seconds === 0 &&
                Date.now() > cd.targetMs;

              if (timePassed && index > 0) return null; 
              if (timePassed && index === 0) {
                return (
                  <div key={cd.id} className="text-xl font-bold text-red-500 my-4">
                    ¡Evento principal finalizado!
                  </div>
                );
              }

              return (
                <div
                  key={cd.id}
                  className={`
                    relative
                    inline-flex 
                    flex-col 
                    items-center 
                    justify-center 
                    gap-1 
                    sm:gap-1 
                    md:gap-1.5 
                    transition-transform 
                    duration-300 
                    w-full
                    ${scaleClass}
                    ${verticalMargin} 
                  `}
                >
                  <span 
                    className={`
                      text-[10px] sm:text-xs md:text-sm uppercase tracking-[0.22em] text-white/80 font-bold
                      ${index > 0 ? "mt-1 md:mt-1.5" : ""}
                    `}
                  >
                    {cd.tag}
                  </span>

                  <div className="relative inline-flex items-end justify-center gap-2 sm:gap-3 md:gap-4 w-full">
                    <span
                      aria-hidden
                      className="absolute -inset-x-[20%] -inset-y-[28%] -z-10 rounded-[999px] pointer-events-none"
                      style={{
                        background:
                          "radial-gradient(ellipse at center, rgba(0,0,0,.36) 0%, rgba(0,0,0,.22) 45%, rgba(0,0,0,0) 68%)",
                        filter: "blur(6px)",
                      }}
                    />

                    <TimeBox value={pad(cd.time.days)} label="DÍAS" />
                    <Sep />
                    <TimeBox value={pad(cd.time.hours)} label="HORAS" />
                    <Sep />
                    <TimeBox value={pad(cd.time.minutes)} label="MIN" />
                    <Sep />
                    <TimeBox value={pad(cd.time.seconds)} label="SEG" />
                  </div>

                  {index === 0 && (
                    <div className="mx-auto mt-2 h-[2px] w-[120px] sm:w-[150px] rounded-full bg-white/15" />
                  )}
                </div>
              );
            })}
          </div>

          {/* Chips de fecha y ubicación */}
          <div className="mt-8 md:mt-10 flex flex-wrap items-center justify-center gap-2 sm:gap-3">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/25 px-3 py-1 text-xs sm:text-sm backdrop-blur-[2px]">
              <Calendar className="h-3.5 w-3.5 opacity-90" />
              <span className="opacity-95">Jue 25/12 · 12:00</span>
            </span>
            <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/25 px-3 py-1 text-xs sm:text-sm backdrop-blur-[2px]">
              <MapPin className="h-3.5 w-3.5 opacity-90" />
              <span className="opacity-95">Ubicación secreta</span>
            </span>
          </div>

          <p className="text-sm md:text-base opacity-90 mt-4">
            Recibí el calor con nosotros
          </p>

          {/* Botones */}
          <div className="flex flex-col md:flex-row items-center justify-center gap-3 md:gap-4 pt-6 md:pt-8 px-4 w-full">
            <Button
              size="lg"
              onClick={() => handleTicketModalOpen(true)}
              className={`
                w-full md:w-auto
                text-base sm:text-lg px-6 sm:px-8 py-5 sm:py-6 rounded-full
                bg-white text-[#5b0d0d] font-bold tracking-wide
                transition-transform duration-200 hover:scale-105 shadow-2xl
                hover:bg-[#5b0d0d] hover:text-white
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#5b0d0d]
              `}
            >
              <Ticket className="w-5 h-5 mr-2" />
              ¡Reservá Entradas!
            </Button>

            <Button
              size="lg"
              onClick={() => handleVIPModalOpen(true)}
              className={`
                w-full md:w-auto
                text-base sm:text-lg px-6 sm:px-8 py-5 sm:py-6 rounded-full
                bg-white text-[#5b0d0d] font-bold tracking-wide
                transition-transform duration-200 hover:scale-105 shadow-2xl
                hover:bg-[#5b0d0d] hover:text-white
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#5b0d0d]
              `}
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
        onOpenChange={handleTicketModalOpen}
      />

      <VIPTableModal 
        open={showVIPModal} 
        onOpenChange={handleVIPModalOpen}
      />

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

// ----------------------------------------------------
// Componentes Auxiliares
// ----------------------------------------------------

interface TimeBoxProps {
  value: string;
  label: string;
}

function TimeBox({ value, label }: TimeBoxProps) {
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