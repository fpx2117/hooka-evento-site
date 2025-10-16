"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { XCircle, Home, RotateCcw } from "lucide-react";
import HeroBackgroundEasy from "@/components/HeroBackgroundEasy";

export default function PaymentFailurePage() {
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
          <div className="px-6 pt-8 text-center space-y-4">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-white/10">
              <XCircle className="w-12 h-12 text-red-400" />
            </div>
            <h1 className="text-3xl font-display">Pago rechazado</h1>
            <p className="text-sm text-white/80">
              Hubo un problema al procesar tu pago. Verificá tus datos e intentá
              nuevamente.
            </p>
          </div>

          {/* Causas */}
          <div className="px-6 pt-4">
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <p className="font-semibold text-white/90 text-sm mb-2">
                Posibles causas
              </p>
              <ul className="text-[13px] text-white/75 space-y-1.5">
                <li>• Fondos insuficientes</li>
                <li>• Datos de tarjeta incorrectos</li>
                <li>• Límite de compra excedido</li>
                <li>• Problemas con el banco emisor</li>
              </ul>
            </div>
          </div>

          {/* CTAs */}
          <div className="p-6 space-y-3">
            {/* Primario: swap blanco ↔ bordó en hover */}
            <Button
              asChild
              size="lg"
              className="
                w-full rounded-full
                bg-white text-[#5b0d0d] font-bold
                hover:bg-[#5b0d0d] hover:text-white
                transition-colors
              "
            >
              <Link href="/">
                <RotateCcw className="w-4 h-4 mr-2" />
                Intentar nuevamente
              </Link>
            </Button>

            <Button
              asChild
              size="lg"
              variant="outline"
              className="
                w-full rounded-full
                border-white/30 text-white bg-transparent
                hover:bg-white hover:text-[#5b0d0d]
                transition-colors
              "
            >
              <Link href="/">
                <Home className="w-4 h-4 mr-2" />
                Volver al inicio
              </Link>
            </Button>

            <p className="text-center text-[11px] text-white/70 pt-1">
              Si el problema persiste, contactanos con el ID de tu pago.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
