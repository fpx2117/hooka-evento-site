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
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const btnSwap =
    "rounded-full border transition-colors shadow-sm " +
    "border-[#5b0d0d] bg-white text-[#5b0d0d] " +
    "hover:bg-[#5b0d0d] hover:text-white " +
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#5b0d0d]";

  const iconSwap =
    "rounded-full border transition-colors w-9 h-9 " +
    "border-[#5b0d0d] bg-white text-[#5b0d0d] " +
    "hover:bg-[#5b0d0d] hover:text-white " +
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#5b0d0d]";

  const showOnScrollMobile = scrolled
    ? "opacity-100 pointer-events-auto"
    : "opacity-0 pointer-events-none";
  const transBase = "transition-opacity duration-300";

  return (
    <>
      <header
        className={`fixed top-0 left-0 right-0 z-50 transition-colors duration-300 ${
          scrolled ? "bg-white/95 backdrop-blur-md shadow-lg" : "bg-transparent"
        }`}
      >
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between h-16 md:h-20 lg:h-24">
            {/* LOGO MOBILE: aparece solo al scrollear */}
            <a
              href="/"
              aria-label="Hooka Party"
              className={`block md:hidden ${transBase} ${showOnScrollMobile}`}
            >
              <Image
                src="/logov1.png"
                alt="Hooka Party"
                width={1000}
                height={400}
                priority
                className="h-auto w-auto max-h-14 xs:max-h-16 sm:max-h-20"
                /* ~56px -> 80px de alto aprox */
                sizes="(max-width: 480px) 120px, (max-width: 768px) 160px, 0px"
              />
            </a>

            {/* LOGO DESKTOP: oculto arriba, visible al scrollear */}
            <a
              href="/"
              aria-label="Hooka Party"
              className={`hidden md:block ${transBase} ${
                scrolled ? "opacity-100" : "opacity-0 pointer-events-none"
              }`}
            >
              <Image
                src="/logov1.png"
                alt="Hooka Party"
                width={1400}
                height={500}
                priority
                className="h-auto w-auto max-h-16 lg:max-h-20 xl:max-h-28"
                /* ~64px -> 80px -> 112px de alto */
                sizes="(min-width: 1280px) 220px, (min-width: 1024px) 180px, (min-width: 768px) 150px, 0px"
              />
            </a>

            {/* ACCIONES DESKTOP */}
            <div className="hidden md:flex items-center gap-3 ml-auto">
              <Button
                size="sm"
                onClick={() => setTicketModalOpen(true)}
                className={`${btnSwap} font-semibold px-5 py-5`}
              >
                <Ticket className="w-4 h-4 mr-2" />
                Comprar Entrada
              </Button>
              <div className="flex items-center gap-2">
                <Button
                  size="icon"
                  variant="ghost"
                  className={iconSwap}
                  asChild
                >
                  <a
                    href="https://www.instagram.com/hooka.official"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Instagram className="w-5 h-5" />
                  </a>
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className={iconSwap}
                  asChild
                >
                  <a
                    href="https://wa.me/+5491136529318"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <MessageCircle className="w-5 h-5" />
                  </a>
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className={iconSwap}
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

            {/* BURGER MOBILE: aparece solo al scrollear */}
            <div
              className={`md:hidden flex items-center gap-2 ${transBase} ${showOnScrollMobile}`}
            >
              <Button
                size="icon"
                variant="ghost"
                className={`rounded-full ${scrolled ? "text-[#5b0d0d]" : "text-white"}`}
                onClick={() => setMobileMenuOpen((v) => !v)}
                aria-expanded={mobileMenuOpen}
                aria-controls="mobile-menu"
              >
                {mobileMenuOpen ? (
                  <X className="w-6 h-6" />
                ) : (
                  <Menu className="w-6 h-6" />
                )}
              </Button>
            </div>
          </div>

          {/* MENÚ MOBILE */}
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
                className={`${btnSwap} w-full font-semibold py-5`}
              >
                <Ticket className="w-4 h-4 mr-2" />
                Comprar Entrada
              </Button>
              <div className="flex items-center justify-center gap-3">
                <Button
                  size="icon"
                  variant="ghost"
                  className={iconSwap}
                  asChild
                >
                  <a
                    href="https://www.instagram.com/hooka.official"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Instagram className="w-5 h-5" />
                  </a>
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className={iconSwap}
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
                  className={iconSwap}
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
