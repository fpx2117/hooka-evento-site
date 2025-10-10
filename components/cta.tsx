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

  return (
    <>
      <section className="py-32 relative overflow-hidden">
        {/* Animated Background */}
        <div className="absolute inset-0 gradient-tropical opacity-90" />

        {/* Decorative Elements */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-10 left-10 w-64 h-64 rounded-full bg-primary-foreground/10 blur-3xl animate-float" />
          <div
            className="absolute bottom-10 right-10 w-72 h-72 rounded-full bg-primary-foreground/10 blur-3xl animate-float"
            style={{ animationDelay: "1.5s" }}
          />
        </div>

        <div className="container mx-auto px-4 relative z-10">
          <div className="max-w-4xl mx-auto text-center space-y-8">
            {/* Icon */}
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-primary-foreground/20 backdrop-blur-sm animate-pulse-glow">
              <Ticket className="w-10 h-10 text-primary-foreground" />
            </div>

            {/* Title */}
            <h2 className="text-5xl md:text-7xl font-display text-primary-foreground tracking-tight leading-tight">
              ¡RESERVÁ TU LUGAR!
            </h2>

            {/* Description */}
            <p className="text-xl md:text-2xl text-primary-foreground/90 max-w-2xl mx-auto leading-relaxed">
              No te quedes afuera de la mejor fiesta. Asegurá tu entrada o
              reservá tu mesa VIP.
            </p>

            {/* Features */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-6 pt-4">
              <div className="flex items-center gap-3 text-primary-foreground/90">
                <Calendar className="w-5 h-5" />
                <span className="font-medium">Domingo 2 de noviembre</span>
              </div>
              <div className="flex items-center gap-3 text-primary-foreground/90">
                <MapPin className="w-5 h-5" />
                <span className="font-medium">Ubicación secreta</span>
              </div>
            </div>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-8">
              <Button
                size="lg"
                onClick={() => setTicketModalOpen(true)}
                className="text-lg px-10 py-7 rounded-full bg-primary-foreground text-primary font-bold tracking-wide hover:scale-105 transition-transform shadow-2xl hover:shadow-primary-foreground/50 hover:bg-primary hover:text-primary-foreground"
                //                                                                                        ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ <-- Corrección aquí
              >
                <Ticket className="w-5 h-5 mr-2" />
                Comprar Entradas
              </Button>
              <Button
                size="lg"
                variant="outline"
                onClick={() => setVipModalOpen(true)}
                className="text-lg px-10 py-7 rounded-full border-2 border-primary-foreground text-primary-foreground hover:bg-primary-foreground/10 backdrop-blur-sm font-semibold tracking-wide hover:scale-105 transition-transform bg-transparent"
              >
                Reservar Mesa VIP
              </Button>
            </div>

            {/* Trust Badge */}
            <p className="text-sm text-primary-foreground/70 pt-4">
              ✨ Más de 10,000 personas ya disfrutaron nuestras fiestas
            </p>
          </div>
        </div>
      </section>

      {/* Brand Carousel */}
      <BrandCarousel />

      <TicketSalesModal
        open={ticketModalOpen}
        onOpenChange={setTicketModalOpen}
      />
      <VIPTableModal open={vipModalOpen} onOpenChange={setVipModalOpen} />
    </>
  );
}
