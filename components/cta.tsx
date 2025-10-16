"use client";

import { Button } from "@/components/ui/button";
import { Ticket, Calendar, MapPin } from "lucide-react";
import { useState } from "react";
import { TicketSalesModal } from "@/components/ticket-sales-modal";
import { VIPTableModal } from "@/components/vip-table-modal";
import { BrandCarousel } from "@/components/brand-carousel";

export function CTA() {
  const [ticketModalOpen, setTicketModalOpen] = useState(false);
  const [vipModalOpen, setVipModalOpen] = useState(false);

  // Botones: blanco+rojo; hover al revés
  const swapSolid =
    "rounded-full border-2 transition-colors shadow-sm " +
    "border-[#5b0d0d] bg-white text-[#5b0d0d] " +
    "hover:bg-[#5b0d0d] hover:text-white " +
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#5b0d0d]";

  return (
    <>
      <section className="py-32 relative overflow-hidden">
        {/* Fondo gradiente animado (rojos) */}
        <div className="absolute inset-0 -z-10">
          {/* Capa base para profundidad */}
          <div className="absolute inset-0 bg-[#5b0d0d]" />

          {/* Gradiente animado principal */}
          <div className="absolute inset-0 cta-gradient" />

          {/* Vignette para legibilidad */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                "radial-gradient(120% 120% at 50% 50%, rgba(0,0,0,0) 55%, rgba(0,0,0,0.28) 92%)",
            }}
          />
        </div>

        <div className="container mx-auto px-4 relative z-10">
          <div className="max-w-4xl mx-auto text-center space-y-8">
            {/* Icono */}
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-white/15 backdrop-blur-sm animate-pulse">
              <Ticket className="w-10 h-10 text-white" />
            </div>

            {/* Título */}
            <h2 className="text-5xl md:text-7xl font-display tracking-tight leading-tight text-white">
              ¡RESERVÁ TU LUGAR!
            </h2>

            {/* Descripción */}
            <p className="text-xl md:text-2xl text-white/90 max-w-2xl mx-auto leading-relaxed">
              No te quedes afuera de la mejor fiesta. Asegurá tu entrada o
              reservá tu mesa VIP.
            </p>

            {/* Features */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-6 pt-4">
              <div className="flex items-center gap-3 text-white/90">
                <Calendar className="w-5 h-5" />
                <span className="font-medium">Domingo 2 de noviembre</span>
              </div>
              <div className="flex items-center gap-3 text-white/90">
                <MapPin className="w-5 h-5" />
                <span className="font-medium">Ubicación secreta</span>
              </div>
            </div>

            {/* Botones */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-8">
              <Button
                size="lg"
                onClick={() => setTicketModalOpen(true)}
                className={`${swapSolid} text-lg px-10 py-7 font-bold tracking-wide hover:scale-105 transition-transform shadow-2xl`}
              >
                <Ticket className="w-5 h-5 mr-2" />
                Comprar Entradas
              </Button>

              <Button
                size="lg"
                onClick={() => setVipModalOpen(true)}
                className={`${swapSolid} text-lg px-10 py-7 font-semibold tracking-wide hover:scale-105 transition-transform bg-white`}
              >
                Reservar Mesa VIP
              </Button>
            </div>

            {/* Trust Badge */}
            <p className="text-sm text-white/80 pt-4">
              ¡Esto va a explotar! no te lo pierdas. 💣🫦
            </p>
          </div>
        </div>

        {/* CSS del gradiente animado */}
        <style jsx>{`
          /* Gradiente lineal animado — rojos MUY oscuros */
          .cta-gradient {
            background:
              radial-gradient(
                1200px 600px at 12% 18%,
                rgba(58, 8, 8, 0.14),
                transparent 55%
              ),
              radial-gradient(
                900px 500px at 88% 82%,
                rgba(42, 6, 6, 0.16),
                transparent 60%
              ),
              linear-gradient(
                100deg,
                #2a0606,
                #3a0808,
                #4a0a0a,
                #5b0d0d,
                #3a0808,
                #2a0606
              );
            background-size:
              100% 100%,
              100% 100%,
              320% 320%;
            animation: gradientShift 18s ease-in-out infinite;
            opacity: 0.98; /* más sólido */
          }

          @keyframes gradientShift {
            0% {
              background-position:
                0% 0%,
                100% 100%,
                0% 50%;
            }
            50% {
              background-position:
                10% 6%,
                90% 94%,
                100% 50%;
            }
            100% {
              background-position:
                0% 0%,
                100% 100%,
                0% 50%;
            }
          }

          @media (prefers-reduced-motion: reduce) {
            .cta-gradient {
              animation: none !important;
            }
          }
        `}</style>
      </section>

      {/* Carrusel de marcas */}
      <BrandCarousel />

      <TicketSalesModal
        open={ticketModalOpen}
        onOpenChange={setTicketModalOpen}
      />
      <VIPTableModal open={vipModalOpen} onOpenChange={setVipModalOpen} />
    </>
  );
}
