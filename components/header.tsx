"use client";

import { useState, useEffect } from "react";
import { Instagram, MessageCircle, Music, Ticket, Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TicketSalesModal } from "@/components/ticket-sales-modal";

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
      <header
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          scrolled
            ? "bg-background/95 backdrop-blur-md shadow-lg"
            : "bg-transparent"
        }`}
      >
        <div className="container mx-auto px-4 py-3 md:py-4">
          <div className="flex items-center justify-between">
            {/* Logo + Title (sin animaciones) */}
            <div className="flex items-center gap-2 md:gap-3">
              <div className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-gradient-to-br from-[#F25691] via-[#EF6065] to-[#EAD1A6] flex items-center justify-center shadow-md">
                <span className="text-xl md:text-2xl font-display">
                  <img
                    src="/logo.png"
                    alt="Hooka Party"
                    className="h-7 w-7 md:h-10 md:w-10 object-contain"
                  />
                </span>
              </div>
              <div>
                <h1 className="text-xl md:text-2xl lg:text-3xl font-display tracking-wider text-gradient">
                  Hooka
                </h1>
                <p className="text-[10px] md:text-xs text-muted-foreground tracking-widest">
                  PARTY
                </p>
              </div>
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
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              >
                {mobileMenuOpen ? (
                  <X className="w-5 h-5" />
                ) : (
                  <Menu className="w-5 h-5" />
                )}
              </Button>
            </div>
          </div>

          {/* Mobile menu (sin animaciones) */}
          {mobileMenuOpen && (
            <div className="md:hidden mt-4 pb-4 space-y-4">
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
