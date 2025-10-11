"use client";

import { Button } from "@/components/ui/button";
import { Waves, Sparkles } from "lucide-react";
import { useState, useEffect } from "react";
import { TicketSalesModal } from "./ticket-sales-modal";

export function Hero() {
  const [timeLeft, setTimeLeft] = useState({
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0,
  });
  const [showTicketModal, setShowTicketModal] = useState(false);

  useEffect(() => {
    const targetDate = new Date("2025-11-02T22:00:00").getTime();

    const updateCountdown = () => {
      const now = new Date().getTime();
      const difference = targetDate - now;

      if (difference > 0) {
        setTimeLeft({
          days: Math.floor(difference / (1000 * 60 * 60 * 24)),
          hours: Math.floor(
            (difference % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)
          ),
          minutes: Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60)),
          seconds: Math.floor((difference % (1000 * 60)) / 1000),
        });
      }
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);

    return () => clearInterval(interval);
  }, []);

  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
      {/* Animated gradient background */}
      <div className="absolute inset-0 z-0">
        <div className="absolute inset-0 bg-gradient-to-b from-[oklch(0.85_0.15_95)] via-[oklch(0.7_0.18_35)] to-[oklch(0.65_0.18_210)] animate-gradient" />

        {/* Sun */}
        <div className="absolute top-20 right-20 w-32 h-32 md:w-48 md:h-48 rounded-full bg-gradient-radial from-[oklch(0.95_0.2_90)] to-transparent opacity-60 blur-2xl animate-pulse-slow" />

        <div className="absolute top-1/4 left-10 w-20 h-20 md:w-24 md:h-24 rounded-full bg-primary/20 blur-xl animate-float-slow" />
        <div className="absolute bottom-1/3 right-20 w-24 h-24 md:w-32 md:h-32 rounded-full bg-secondary/20 blur-xl animate-float-slower" />
        <div className="absolute top-1/2 left-1/4 w-12 h-12 md:w-16 md:h-16 rounded-full bg-accent/20 blur-lg animate-float" />
        <div className="absolute top-1/3 right-1/3 w-16 h-16 md:w-20 md:h-20 rounded-full bg-primary/15 blur-xl animate-float" />
        <div className="absolute bottom-1/4 left-1/3 w-14 h-14 md:w-18 md:h-18 rounded-full bg-accent/15 blur-lg animate-float-slower" />

        <div className="absolute bottom-0 left-0 right-0 -mb-1">
          <svg
            viewBox="0 0 1440 200"
            className="w-full h-40 md:h-56"
            preserveAspectRatio="none"
          >
            <path
              d="M0,100 Q360,50 720,100 T1440,100 L1440,200 L0,200 Z"
              fill="oklch(0.65 0.2 210 / 0.5)"
              className="animate-wave"
            />
            <path
              d="M0,120 Q360,80 720,120 T1440,120 L1440,200 L0,200 Z"
              fill="oklch(0.6 0.22 215 / 0.4)"
              className="animate-wave-slow"
            />
            <path
              d="M0,140 Q360,110 720,140 T1440,140 L1440,200 L0,200 Z"
              fill="oklch(0.55 0.25 220 / 0.3)"
              className="animate-wave"
            />
          </svg>
        </div>
      </div>

      <div className="absolute inset-0 z-10 bg-gradient-to-b from-background/50 via-background/30 to-background/40" />

      {/* Content */}
      <div className="relative z-20 container mx-auto px-4 text-center pt-24 md:pt-32 pb-12">
        <div className="max-w-5xl mx-auto space-y-6 md:space-y-8">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-2 md:px-6 md:py-3 rounded-full bg-background/80 backdrop-blur-sm border-2 border-primary/50 animate-pulse-glow">
            <Sparkles className="w-4 h-4 md:w-5 md:h-5 text-accent" />
            <span className="text-xs md:text-sm font-semibold tracking-wider text-foreground">
              TEMPORADA 2025
            </span>
            <Sparkles className="w-4 h-4 md:w-5 md:h-5 text-secondary" />
          </div>

          {/* Main Title - Improved responsive sizing */}
          <h1 className="text-5xl sm:text-6xl md:text-8xl lg:text-9xl font-display tracking-tight leading-none">
            <span className="block neon-glow text-primary-foreground">
              ¡VIENE EL
            </span>
            <span className="block text-gradient mt-2">VERANO!</span>
          </h1>

          {/* Subtitle - Improved responsive sizing */}
          <p className="text-xl sm:text-2xl md:text-4xl font-display text-primary-foreground/90 tracking-wide">
            Hooka Party
          </p>

          <div className="flex items-center justify-center gap-3 sm:gap-4 md:gap-6 pt-4">
            <div className="text-center">
              <div className="text-3xl sm:text-4xl md:text-5xl font-display text-gradient font-bold">
                {timeLeft.days.toString().padStart(2, "0")}
              </div>
              <div className="text-xs md:text-sm text-primary-foreground/70 mt-1">
                DÍAS
              </div>
            </div>
            <div className="text-2xl sm:text-3xl md:text-4xl text-primary-foreground/50">
              :
            </div>
            <div className="text-center">
              <div className="text-3xl sm:text-4xl md:text-5xl font-display text-gradient font-bold">
                {timeLeft.hours.toString().padStart(2, "0")}
              </div>
              <div className="text-xs md:text-sm text-primary-foreground/70 mt-1">
                HORAS
              </div>
            </div>
            <div className="text-2xl sm:text-3xl md:text-4xl text-primary-foreground/50">
              :
            </div>
            <div className="text-center">
              <div className="text-3xl sm:text-4xl md:text-5xl font-display text-gradient font-bold">
                {timeLeft.minutes.toString().padStart(2, "0")}
              </div>
              <div className="text-xs md:text-sm text-primary-foreground/70 mt-1">
                MIN
              </div>
            </div>
            <div className="text-2xl sm:text-3xl md:text-4xl text-primary-foreground/50">
              :
            </div>
            <div className="text-center">
              <div className="text-3xl sm:text-4xl md:text-5xl font-display text-gradient font-bold">
                {timeLeft.seconds.toString().padStart(2, "0")}
              </div>
              <div className="text-xs md:text-sm text-primary-foreground/70 mt-1">
                SEG
              </div>
            </div>
          </div>

          <p className="text-base sm:text-lg md:text-xl text-primary-foreground/80 max-w-2xl mx-auto leading-relaxed px-4">
            La mejor fiesta de zona norte. Música, diversión y energía para
            disfrutar al máximo.
          </p>

          <div className="flex items-center justify-center pt-6 md:pt-8 px-4">
            <Button
              size="lg"
              onClick={() => setShowTicketModal(true)}
              className="text-base sm:text-lg px-6 sm:px-8 py-5 sm:py-6 rounded-full bg-gradient-to-r from-primary via-secondary to-accent text-primary-foreground font-bold tracking-wide hover:scale-105 transition-transform shadow-2xl w-full sm:w-auto"
            >
              <Waves className="w-5 h-5 mr-2" />
              ¡Reservá Ahora!
            </Button>
          </div>
        </div>
      </div>

      <TicketSalesModal
        open={showTicketModal}
        onOpenChange={setShowTicketModal}
      />
    </section>
  );
}
