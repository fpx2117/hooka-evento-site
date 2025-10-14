"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Headphones, Play } from "lucide-react";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const INITIAL_DJS = [
  {
    name: "DJ Pirata",
    specialty: "",
    image: "/djpirata.webp",
    spotifyUrl:
      "https://open.spotify.com/intl-es/artist/4MlPk7Q5wc1b5KRKSCDNnh",
    youtubeUrl: "https://www.youtube.com/@DjPirata",
  },
  {
    name: "Braian Segovia DJ",
    specialty: "",
    image: "/braiansegoviadj.jpg",
    spotifyUrl: "",
    youtubeUrl: "https://www.youtube.com/@braiansegoviadj",
  },
  {
    name: "Juanc RMX",
    specialty: "",
    image: "/juanc_rmx.jpg",
    spotifyUrl: "",
    youtubeUrl: "https://www.instagram.com/juanc_rmx",
  },

  // Podés agregar hasta 2 más; el componente recorta a 6
] as const;

type DJ = (typeof INITIAL_DJS)[number];

export function Lineup({ djs = INITIAL_DJS }: { djs?: ReadonlyArray<DJ> }) {
  // Máximo 6 para landing
  const djList: DJ[] = (djs ?? INITIAL_DJS).slice(0, 6) as DJ[];
  const [selectedDJ, setSelectedDJ] = useState<DJ | null>(null);

  if (!djList.length) return null; // si no hay DJs, ocultamos la sección

  // Layout dinámico en desktop:
  // - 4 DJs => 4 columnas (1 fila)
  // - 5 o 6 DJs => 3 columnas (3+2 o 3+3)
  const lgColsClass = djList.length === 4 ? "lg:grid-cols-4" : "lg:grid-cols-3";

  return (
    <>
      <section className="py-24 bg-gradient-to-b from-background to-muted/30">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16 space-y-4">
            <div className="inline-flex items-center gap-3 px-6 py-3 rounded-full bg-primary/10 border border-primary/30">
              <Headphones className="w-5 h-5 text-primary" />
              <span className="text-sm font-semibold tracking-wider">
                LINEUP
              </span>
            </div>
            <h2 className="text-5xl md:text-7xl font-display text-gradient tracking-tight">
              DJS DESTACADOS
            </h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              Los mejores artistas para hacer vibrar cada noche
            </p>
          </div>

          <div
            className={`grid grid-cols-1 sm:grid-cols-2 ${lgColsClass} gap-8 justify-items-center`}
          >
            {djList.map((dj) => (
              <Card
                key={dj.name}
                onClick={() => setSelectedDJ(dj)}
                className="group relative overflow-hidden border-2 hover:border-accent transition-all duration-300 hover:scale-105 cursor-pointer w-full max-w-sm"
              >
                <CardContent className="p-0">
                  <div className="relative aspect-square overflow-hidden">
                    <img
                      src={dj.image || "/placeholder.svg"}
                      alt={dj.name}
                      className="w-full h-full object-cover object-center group-hover:scale-110 transition-transform duration-500 brightness-90 group-hover:brightness-100"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-background via-background/30 to-transparent opacity-30" />

                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                      <div className="w-16 h-16 rounded-full bg-primary/90 flex items-center justify-center">
                        <Play className="w-8 h-8 text-primary-foreground ml-1" />
                      </div>
                    </div>

                    <div className="absolute bottom-0 left-0 right-0 p-6 space-y-2">
                      <h3 className="text-2xl font-display text-primary-foreground tracking-wide">
                        {dj.name}
                      </h3>
                      <p className="text-sm text-primary-foreground/80 font-medium">
                        {dj.specialty}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

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
            <p className="text-muted-foreground">{selectedDJ?.specialty}</p>

            {/* ✅ Mostrar solo los botones con enlaces válidos */}
            <div className="space-y-3">
              {!!selectedDJ?.spotifyUrl?.trim() && (
                <Button
                  asChild
                  className="w-full bg-[#1DB954] hover:bg-[#1ed760] text-white"
                >
                  <a
                    href={selectedDJ!.spotifyUrl!}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <svg
                      className="w-5 h-5 mr-2"
                      fill="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3 .719 1.02 .419 1.56-.299.421-1.02.599-1.559.3z" />
                    </svg>
                    Escuchar en Spotify
                  </a>
                </Button>
              )}

              {!!selectedDJ?.youtubeUrl?.trim() && (
                <Button
                  asChild
                  variant="outline"
                  className="w-full border-red-500 text-red-500 hover:bg-red-600 hover:text-white hover:border-red-600 bg-transparent transition-colors focus-visible:ring-red-600"
                >
                  <a
                    href={selectedDJ!.youtubeUrl!}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <svg
                      className="w-5 h-5 mr-2"
                      fill="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
                    </svg>
                    Ver en YouTube
                  </a>
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
