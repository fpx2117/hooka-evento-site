"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Headphones, Play, ChevronLeft, ChevronRight } from "lucide-react";

const RED = "#5b0d0d";

// Ajusta estas rutas/links a tus assets reales
const INITIAL_DJS = [
  {
    name: "Cris DJ",
    specialty: "",
    image: "/cris_dj.jpeg",
    spotifyUrl: "",
    youtubeUrl: "https://www.youtube.com/channel/UCR5t8xZVE9YbTqbmfGbSe3A",
  },
  {
    name: "Juanc RMX",
    specialty: "",
    image: "/juanc_rmx.jpg",
    spotifyUrl: "",
    youtubeUrl: "https://www.instagram.com/juanc_rmx",
  },
  {
    name: "joabenitezz",
    specialty: "",
    image: "/joa.jpg",
    spotifyUrl: "",
    youtubeUrl: "",
  },
  {
    name: "Tato Remix",
    specialty: "",
    image: "/tatormx.jpg",
    spotifyUrl: "",
    youtubeUrl: "",
  },
  {
    name: "Pome DJ",
    specialty: "",
    image: "/pomedj.jpg",
    spotifyUrl: "",
    youtubeUrl: "",
  },
] as const;

type DJ = (typeof INITIAL_DJS)[number];

export function Lineup({ djs = INITIAL_DJS }: { djs?: ReadonlyArray<DJ> }) {
  const djList: DJ[] = useMemo(
    () => (djs ?? INITIAL_DJS).slice(0, 12) as DJ[],
    [djs]
  );
  const [selectedDJ, setSelectedDJ] = useState<DJ | null>(null);

  const vpRef = useRef<HTMLDivElement | null>(null);
  const [active, setActive] = useState(0);
  const [hovering, setHovering] = useState(false);
  const autoplayMs = 3500;

  // Botones (inline styles para el rojo corporativo)
  const btnSwapStyles: React.CSSProperties = {
    borderRadius: 9999,
    border: `1px solid ${RED}`,
    backgroundColor: "#fff",
    color: RED,
  };
  const outlineSwapStyles: React.CSSProperties = {
    borderRadius: 9999,
    border: `1px solid ${RED}`,
    color: RED,
    background: "transparent",
  };

  // Actualiza índice activo por scroll
  useEffect(() => {
    const el = vpRef.current;
    if (!el) return;
    let rAf = 0;

    const onScroll = () => {
      cancelAnimationFrame(rAf);
      rAf = requestAnimationFrame(() => {
        const item = el.querySelector<HTMLElement>("[data-item]");
        const itemWidth = item ? item.offsetWidth : el.clientWidth;
        const gap = parseInt(getComputedStyle(el).columnGap || "24", 10) || 24;
        const idx = Math.round(el.scrollLeft / (itemWidth + gap));
        setActive(Math.max(0, Math.min(idx, djList.length - 1)));
      });
    };

    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(rAf);
    };
  }, [djList.length]);

  // Autoplay (pausa en hover/touch o con modal abierto)
  useEffect(() => {
    if (hovering || selectedDJ) return;
    const id = setInterval(() => goTo(active + 1), autoplayMs);
    return () => clearInterval(id);
  }, [active, hovering, selectedDJ]); // eslint-disable-line

  // Teclado ← →
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (selectedDJ) return;
      if (e.key === "ArrowRight") goTo(active + 1);
      if (e.key === "ArrowLeft") goTo(active - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, selectedDJ]); // eslint-disable-line

  const goTo = useCallback(
    (idx: number) => {
      const el = vpRef.current;
      if (!el) return;
      const clamped = ((idx % djList.length) + djList.length) % djList.length;
      const target = el.querySelectorAll<HTMLElement>("[data-item]")[clamped];
      if (!target) return;
      el.scrollTo({
        left: target.offsetLeft - (el.offsetLeft || 0),
        behavior: "smooth",
      });
      setActive(clamped);
    },
    [djList.length]
  );

  if (!djList.length) return null;

  return (
    <>
      <section className="py-20 sm:py-24 bg-gradient-to-b from-background to-muted/30">
        <div className="container mx-auto px-4">
          {/* Encabezado */}
          <div className="text-center mb-10 sm:mb-14 space-y-4">
            <div
              className="inline-flex items-center gap-3 px-6 py-3 rounded-full bg-white border"
              style={{ borderColor: RED, color: RED }}
            >
              <Headphones className="w-5 h-5" />
              <span className="text-sm font-semibold tracking-wider">
                LINEUP
              </span>
            </div>

            <h2
              className="text-4xl md:text-6xl font-display tracking-tight"
              style={{
                backgroundImage: `linear-gradient(90deg, ${RED}, #8a1010)`,
                backgroundSize: "200% 200%",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                color: "transparent",
              }}
            >
              DJS DESTACADOS
            </h2>

            <p className="text-base sm:text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              Los mejores artistas para hacer vibrar cada noche
            </p>
          </div>

          {/* Carrusel */}
          <div
            className="relative"
            onMouseEnter={() => setHovering(true)}
            onMouseLeave={() => setHovering(false)}
            onTouchStart={() => setHovering(true)}
            onTouchEnd={() => setHovering(false)}
          >
            {/* Flecha Izquierda (solo desktop) */}
            <motion.button
              aria-label="Anterior"
              onClick={() => goTo(active - 1)}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              className="hidden lg:flex absolute -left-3 top-1/2 -translate-y-1/2 z-10 h-10 w-10 rounded-full bg-white/90 shadow border items-center justify-center hover:bg-white"
              style={{ borderColor: RED, color: RED }}
              whileTap={{ scale: 0.95 }}
            >
              <ChevronLeft className="h-6 w-6" />
            </motion.button>

            {/* Wrapper que recorta los bordes para que no asome el 4.º */}
            <div className="overflow-hidden">
              {/* Viewport (snap) */}
              <div
                ref={vpRef}
                className="
                  flex overflow-x-auto snap-x snap-mandatory scroll-smooth 
                  gap-6 pb-2 px-0
                "
                style={{ scrollbarWidth: "none" }}
              >
                {djList.map((dj, i) => (
                  <motion.div
                    key={dj.name}
                    data-item
                    className="
                      snap-start shrink-0
                      basis-full     /* móvil: 1 por vista */
                      sm:basis-1/2   /* tablet: 2 por vista */
                      lg:basis-1/3   /* desktop: 3 por vista */
                    "
                    initial={{ opacity: 0, y: 12 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: "-10% 0px -10% 0px" }}
                    transition={{ duration: 0.35, ease: "easeOut" }}
                  >
                    <motion.div
                      whileHover={{ scale: 1.02 }}
                      transition={{
                        type: "spring",
                        stiffness: 260,
                        damping: 20,
                      }}
                    >
                      <Card
                        onClick={() => setSelectedDJ(dj)}
                        className="group relative overflow-hidden cursor-pointer rounded-2xl"
                        style={{ borderWidth: 2, borderColor: RED }}
                      >
                        <CardContent className="p-0">
                          {/* 4:5 en mobile, 1:1 en md+ para encuadre limpio */}
                          <div className="relative aspect-[4/5] md:aspect-[1/1] overflow-hidden rounded-2xl">
                            <Image
                              src={dj.image || "/placeholder.svg"}
                              alt={dj.name}
                              fill
                              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                              className="object-cover object-center transition-transform duration-500 group-hover:scale-110 will-change-transform"
                              priority={i < 2}
                              loading={i < 2 ? "eager" : "lazy"}
                              decoding="async"
                            />

                            {/* Degradado inferior para legibilidad */}
                            <div
                              className="absolute inset-0 pointer-events-none"
                              style={{
                                background:
                                  "linear-gradient(180deg, rgba(0,0,0,0) 52%, rgba(0,0,0,0.3) 100%)",
                              }}
                            />

                            {/* Botón play animado */}
                            <motion.div
                              className="absolute inset-0 flex items-center justify-center"
                              initial={{ opacity: 0 }}
                              whileHover={{ opacity: 1 }}
                              transition={{ duration: 0.25 }}
                            >
                              <motion.div
                                className="w-16 h-16 rounded-full flex items-center justify-center"
                                style={{ backgroundColor: RED }}
                                whileHover={{ scale: 1.07 }}
                              >
                                <Play className="w-8 h-8 text-white ml-1" />
                              </motion.div>
                            </motion.div>

                            {/* Nombre */}
                            <div className="absolute bottom-0 left-0 right-0 p-5 space-y-1.5">
                              <h3 className="text-xl sm:text-2xl font-display tracking-wide text-white drop-shadow">
                                {dj.name}
                              </h3>
                              {!!dj.specialty && (
                                <p className="text-xs sm:text-sm text-white/85 font-medium">
                                  {dj.specialty}
                                </p>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  </motion.div>
                ))}
              </div>
            </div>

            {/* Flecha Derecha (solo desktop) */}
            <motion.button
              aria-label="Siguiente"
              onClick={() => goTo(active + 1)}
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              className="hidden lg:flex absolute -right-3 top-1/2 -translate-y-1/2 z-10 h-10 w-10 rounded-full bg-white/90 shadow border items-center justify-center hover:bg-white"
              style={{ borderColor: RED, color: RED }}
              whileTap={{ scale: 0.95 }}
            >
              <ChevronRight className="h-6 w-6" />
            </motion.button>

            {/* Fades laterales (opcional, solo desktop) */}
            <div className="pointer-events-none absolute inset-y-0 left-0 w-6 bg-gradient-to-r from-background to-transparent z-10 hidden lg:block" />
            <div className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-background to-transparent z-10 hidden lg:block" />
          </div>

          {/* Dots */}
          <div className="mt-6 flex items-center justify-center gap-2">
            {djList.map((_, i) => {
              const activeDot = i === active;
              return (
                <motion.button
                  key={i}
                  aria-label={`Ir a la tarjeta ${i + 1}`}
                  onClick={() => goTo(i)}
                  className="h-2.5 rounded-full"
                  style={{
                    width: activeDot ? 26 : 8,
                    backgroundColor: activeDot ? RED : "rgba(0,0,0,0.18)",
                  }}
                  whileTap={{ scale: 0.9 }}
                  transition={{ type: "spring", stiffness: 300, damping: 20 }}
                />
              );
            })}
          </div>
        </div>
      </section>

      {/* Modal */}
      <AnimatePresence>
        {selectedDJ && (
          <Dialog
            open={!!selectedDJ}
            onOpenChange={(open) => {
              if (!open) setSelectedDJ(null);
            }}
          >
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="text-2xl font-display">
                  {selectedDJ?.name}
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-4">
                {!!selectedDJ?.specialty && (
                  <p className="text-muted-foreground">
                    {selectedDJ.specialty}
                  </p>
                )}

                <div className="space-y-3">
                  {!!selectedDJ?.spotifyUrl?.trim() && (
                    <Button
                      asChild
                      style={btnSwapStyles}
                      className="transition-colors hover:text-white"
                    >
                      <a
                        href={selectedDJ!.spotifyUrl!}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label="Escuchar en Spotify"
                      >
                        <svg
                          className="w-5 h-5 mr-2"
                          fill="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path d="M12 2a10 10 0 1 0 .001 20.001A10 10 0 0 0 12 2zm-1 6.5a1 1 0 0 1 1.555-.832l5 3.5a1 1 0 0 1 0 1.664l-5 3.5A1 1 0 0 1 11 15.5v-7z" />
                        </svg>
                        Escuchar
                      </a>
                    </Button>
                  )}

                  {!!selectedDJ?.youtubeUrl?.trim() && (
                    <Button asChild variant="outline" style={outlineSwapStyles}>
                      <a
                        href={selectedDJ!.youtubeUrl!}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label="Ver contenido"
                      >
                        <svg
                          className="w-5 h-5 mr-2"
                          fill="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6A3 3 0 0 0 .5 6.2C0 8.1 0 12 0 12s0 3.9.5 5.8a3 3 0 0 0 2.1 2.1c1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6a3 3 0 0 0 2.1-2.1C24 15.9 24 12 24 12s0-3.9-.5-5.8zM9.5 15.6V8.4L15.8 12 9.5 15.6z" />
                        </svg>
                        Ver
                      </a>
                    </Button>
                  )}
                </div>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </AnimatePresence>
    </>
  );
}
