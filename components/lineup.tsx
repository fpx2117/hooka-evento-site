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

const RED = "#5b0d0d";

const INITIAL_DJS = [
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
  {
    name: "Pome DJ",
    specialty: "",
    image: "/pomedj.jpg",
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
] as const;

type DJ = (typeof INITIAL_DJS)[number];

export function Lineup({ djs = INITIAL_DJS }: { djs?: ReadonlyArray<DJ> }) {
  const djList: DJ[] = (djs ?? INITIAL_DJS).slice(0, 6) as DJ[];
  const [selectedDJ, setSelectedDJ] = useState<DJ | null>(null);

  if (!djList.length) return null;

  const lgColsClass = djList.length === 4 ? "lg:grid-cols-4" : "lg:grid-cols-3";

  // helpers de estilo (blanco + rojo con hover invertido)
  const btnSwap =
    "rounded-full border transition-colors w-full " +
    "border-[" +
    RED +
    "] bg-white text-[" +
    RED +
    "] " +
    "hover:bg-[" +
    RED +
    "] hover:text-white " +
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[" +
    RED +
    "]";
  const outlineSwap =
    "rounded-full border w-full " +
    "border-[" +
    RED +
    "] text-[" +
    RED +
    "] bg-transparent " +
    "hover:bg-[" +
    RED +
    "] hover:text-white transition-colors " +
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[" +
    RED +
    "]";

  return (
    <>
      <section className="py-24 bg-gradient-to-b from-background to-muted/30">
        <div className="container mx-auto px-4">
          {/* Badge + Título */}
          <div className="text-center mb-16 space-y-4">
            <div
              className="
                inline-flex items-center gap-3 px-6 py-3 rounded-full
                bg-white border
              "
              style={{ borderColor: RED, color: RED }}
            >
              <Headphones className="w-5 h-5" />
              <span className="text-sm font-semibold tracking-wider">
                LINEUP
              </span>
            </div>

            <h2
              className="text-5xl md:text-7xl font-display tracking-tight"
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

            <p className="text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              Los mejores artistas para hacer vibrar cada noche
            </p>
          </div>

          {/* Cards */}
          <div
            className={`grid grid-cols-1 sm:grid-cols-2 ${lgColsClass} gap-8 justify-items-center`}
          >
            {djList.map((dj) => (
              <Card
                key={dj.name}
                onClick={() => setSelectedDJ(dj)}
                className="group relative overflow-hidden transition-all duration-300 hover:scale-[1.02] cursor-pointer w-full max-w-sm"
                style={{ borderWidth: 2, borderColor: RED }}
              >
                <CardContent className="p-0">
                  <div className="relative aspect-square overflow-hidden">
                    <img
                      src={dj.image || "/placeholder.svg"}
                      alt={dj.name}
                      className="w-full h-full object-cover object-center group-hover:scale-110 transition-transform duration-500 brightness-90 group-hover:brightness-100"
                    />

                    {/* tope inferior con degradado rojo oscuro sutil para lectura */}
                    <div
                      className="absolute inset-0"
                      style={{
                        background:
                          "linear-gradient(180deg, rgba(0,0,0,0) 50%, rgba(0,0,0,0.35) 100%)",
                      }}
                    />

                    {/* Botón play centrado con rojo */}
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                      <div
                        className="w-16 h-16 rounded-full flex items-center justify-center"
                        style={{ backgroundColor: RED }}
                      >
                        <Play className="w-8 h-8 text-white ml-1" />
                      </div>
                    </div>

                    {/* Nombre */}
                    <div className="absolute bottom-0 left-0 right-0 p-6 space-y-2">
                      <h3 className="text-2xl font-display tracking-wide text-white drop-shadow">
                        {dj.name}
                      </h3>
                      {!!dj.specialty && (
                        <p className="text-sm text-white/85 font-medium">
                          {dj.specialty}
                        </p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Modal */}
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
              <p className="text-muted-foreground">{selectedDJ.specialty}</p>
            )}

            {/* Botones: blanco/rojo con hover invertido */}
            <div className="space-y-3">
              {!!selectedDJ?.spotifyUrl?.trim() && (
                <Button asChild className={btnSwap}>
                  <a
                    href={selectedDJ!.spotifyUrl!}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {/* Ícono genérico de “play/ondas” en lugar del verde de marca */}
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
                <Button asChild variant="outline" className={outlineSwap}>
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
    </>
  );
}
