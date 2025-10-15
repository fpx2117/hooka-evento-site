"use client";

import { useState, useEffect } from "react";
import { Instagram, MessageCircle, Music, Ticket, Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TicketSalesModal } from "@/components/ticket-sales-modal";
import Image from "next/image";

export function Header() {
  const [scrolled, setScrolled] = useState(false);
  const [ticketModalOpen, setTicketModalOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <>
      {/* HEADER: transparente por defecto; blanco solo si hay scroll */}
      <header
        className={`fixed top-0 left-0 right-0 z-50 transition-colors duration-300 ${
          scrolled ? "bg-white/95 backdrop-blur-md shadow-lg" : "bg-transparent"
        }`}
      >
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between h-16 md:h-20 lg:h-24">
            {/* Logo */}
            <div className="flex items-center">
              <a href="/" className="block" aria-label="Hooka Party">
                <Image
                  src="/logov1.png"
                  alt="Hooka Party"
                  width={800}
                  height={300}
                  priority
                  className="h-full w-auto max-h-16 md:max-h-20 lg:max-h-24 shrink-0"
                  sizes="(max-width: 768px) 64px, (max-width: 1024px) 80px, 96px"
                />
              </a>
            </div>

            {/* Desktop actions */}
            <div className="hidden md:flex items-center gap-3">
              <Button
                size="sm"
                onClick={() => setTicketModalOpen(true)}
                className="rounded-full bg-gradient-to-r from-primary to-secondary text-primary-foreground font-semibold hover:scale-105 transition-transform"
              >
                <Ticket className="w-4 h-4 mr-2" />
                Comprar Entrada
              </Button>

              <div className="flex items-center gap-2">
                <Button
                  size="icon"
                  variant="ghost"
                  className="rounded-full hover:bg-primary hover:text-primary-foreground transition-all hover:scale-110"
                  asChild
                >
                  <a
                    href="https://instagram.com"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Instagram className="w-5 h-5" />
                  </a>
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="rounded-full hover:bg-secondary hover:text-secondary-foreground transition-all hover:scale-110"
                  asChild
                >
                  <a
                    href="https://wa.me/1234567890"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <MessageCircle className="w-5 h-5" />
                  </a>
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="rounded-full hover:bg-accent hover:text-accent-foreground transition-all hover:scale-110"
                  asChild
                >
                  <a
                    href="https://tiktok.com"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Music className="w-5 h-5" />
                  </a>
                </Button>
              </div>
            </div>

            {/* Mobile burger */}
            <div className="flex md:hidden items-center gap-2">
              <Button
                size="icon"
                variant="ghost"
                className="rounded-full"
                onClick={() => setMobileMenuOpen((v) => !v)}
                aria-expanded={mobileMenuOpen}
                aria-controls="mobile-menu"
              >
                {mobileMenuOpen ? (
                  <X className="w-5 h-5" />
                ) : (
                  <Menu className="w-5 h-5" />
                )}
              </Button>
            </div>
          </div>

          {/* MOBILE MENU: solo el panel es blanco */}
          {mobileMenuOpen && (
            <div
              id="mobile-menu"
              className="md:hidden mt-2 mb-4 rounded-xl bg-white border border-black/10 p-4 space-y-4 shadow-xl"
            >
              <Button
                size="sm"
                onClick={() => {
                  setTicketModalOpen(true);
                  setMobileMenuOpen(false);
                }}
                className="w-full rounded-full bg-gradient-to-r from-primary to-secondary text-primary-foreground font-semibold"
              >
                <Ticket className="w-4 h-4 mr-2" />
                Comprar Entrada
              </Button>

              <div className="flex items-center justify-center gap-3">
                <Button
                  size="icon"
                  variant="ghost"
                  className="rounded-full hover:bg-primary hover:text-primary-foreground transition-all"
                  asChild
                >
                  <a
                    href="https://instagram.com"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Instagram className="w-5 h-5" />
                  </a>
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="rounded-full hover:bg-secondary hover:text-secondary-foreground transition-all"
                  asChild
                >
                  <a
                    href="https://wa.me/1234567890"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <MessageCircle className="w-5 h-5" />
                  </a>
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="rounded-full hover:bg-accent hover:text-accent-foreground transition-all"
                  asChild
                >
                  <a
                    href="https://tiktok.com"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Music className="w-5 h-5" />
                  </a>
                </Button>
              </div>
            </div>
          )}
        </div>
      </header>

      <TicketSalesModal
        open={ticketModalOpen}
        onOpenChange={setTicketModalOpen}
      />
    </>
  );
}
