"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Clock, Home, Mail } from "lucide-react";
import HeroBackgroundEasy from "@/components/HeroBackgroundEasy";

export default function PaymentPendingPage() {
  return (
    <main className="relative min-h-[100svh] overflow-hidden text-white">
      {/* Fondo con patrón HOOKA */}
      <HeroBackgroundEasy
        mobile={{ rows: 4, cols: 1 }}
        desktop={{ rows: 4, cols: 3 }}
        fontMobile="clamp(2.6rem, 21vw, 9rem)"
        opacity={0.55}
        gap="clamp(0px, 1vh, 10px)"
        navTopPx={0}
      />
      {/* Velo para contraste */}
      <div aria-hidden className="absolute inset-0 bg-black/55" />

      {/* Contenido */}
      <section className="relative z-10 grid min-h-[100svh] place-items-center p-4">
        <div className="w-full max-w-md rounded-2xl border border-white/15 bg-white/5 backdrop-blur-xl shadow-2xl">
          {/* Header */}
          <div className="px-6 pt-6 text-center space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full bg-yellow-500/20 text-yellow-100 px-3 py-1 text-xs">
              <Clock className="w-4 h-4" />
              Pago pendiente
            </div>

            <h1 className="text-3xl font-display">
              Estamos procesando tu pago…
            </h1>
            <p className="text-sm text-white/80">
              Te avisaremos por email apenas se confirme. Puede demorar algunos
              minutos.
            </p>
          </div>

          {/* Body */}
          <div className="p-6 space-y-6">
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <div className="flex items-center justify-center gap-2 text-sm text-white/85">
                <Mail className="w-4 h-4" />
                <span>Recibirás una confirmación por email</span>
              </div>
              <p className="mt-2 text-[12px] text-white/70 text-center">
                Si no ves el mensaje, revisá la bandeja de spam o promociones.
              </p>
            </div>

            {/* CTA Volver */}
            <Button
              asChild
              size="lg"
              className="w-full rounded-full bg-white text-[#5b0d0d] hover:bg-white/90"
            >
              <Link href="/">
                <Home className="w-4 h-4 mr-2" />
                Volver al inicio
              </Link>
            </Button>

            <p className="text-center text-[11px] text-white/70 pb-1">
              Gracias por tu paciencia 💫
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
