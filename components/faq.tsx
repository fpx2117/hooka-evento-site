"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

const RED = "#5b0d0d";

const faqs = [
  {
    question: "¿Cuándo se realizan las fiestas?",
    answer:
      "Las fiestas se realizan los domingos a principios de cada mes. La ubicación se confirma una vez realizada la compra de la entrada.",
  },
  {
    question: "¿Cómo recibo mi entrada?",
    answer:
      "Una vez confirmado el pago, recibirás un email con tu código QR único. Este código debe ser presentado en la entrada de la fiesta para acceder.",
  },
  {
    question: "¿Hay límite de edad?",
    answer:
      "El evento es exclusivo para mayores de 18 años. Se solicitará documento de identidad en la entrada.",
  },
  {
    question: "¿Qué métodos de pago aceptan?",
    answer:
      "Aceptamos todos los métodos de pago disponibles en Mercado Pago: tarjetas de crédito, débito, efectivo en puntos de pago, y transferencias bancarias.",
  },
  {
    question: "¿Dónde se realiza la fiesta?",
    answer:
      "La ubicación exacta se revela una vez confirmada la compra, ya que las fiestas rotan de lugar constantemente para ofrecerte experiencias únicas en diferentes espacios.",
  },
];

export function FAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const toggle = (i: number) => setOpenIndex((curr) => (curr === i ? null : i));

  return (
    <section className="py-24 bg-gradient-to-b from-muted/30 to-background">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16 space-y-4">
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
            PREGUNTAS FRECUENTES
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Todo lo que necesitas saber sobre nuestras fiestas
          </p>
        </div>

        <div className="max-w-3xl mx-auto space-y-4">
          {faqs.map((faq, index) => {
            const isOpen = openIndex === index;
            const panelId = `faq-panel-${index}`;
            const btnId = `faq-btn-${index}`;

            return (
              <Card
                key={index}
                className="
                  group cursor-pointer overflow-hidden transition-colors bg-white border-2
                  hover:bg-[var(--red)] hover:text-white
                  focus-within:bg-[var(--red)] focus-within:text-white
                "
                style={{ borderColor: RED, ["--red" as any]: RED }}
                role="region"
                aria-labelledby={btnId}
              >
                <CardContent className="p-0">
                  {/* Botón cabecera (único que toggla) */}
                  <button
                    id={btnId}
                    type="button"
                    aria-expanded={isOpen}
                    aria-controls={panelId}
                    onClick={() => toggle(index)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        toggle(index);
                      }
                    }}
                    className="
                      w-full text-left p-6 flex items-center justify-between
                      outline-none focus-visible:ring-2 focus-visible:ring-offset-2
                    "
                    style={{
                      ["--tw-ring-color" as any]: RED,
                      color: "inherit",
                    }}
                  >
                    <h3
                      className="text-lg font-semibold pr-4"
                      style={{ color: "inherit" }}
                    >
                      {faq.question}
                    </h3>
                    <ChevronDown
                      className="w-5 h-5 flex-shrink-0 transition-transform duration-300"
                      style={{
                        transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
                        color: "inherit",
                      }}
                      aria-hidden="true"
                    />
                  </button>

                  {/* Panel respuesta */}
                  <div
                    id={panelId}
                    aria-hidden={!isOpen}
                    className={`overflow-hidden transition-[max-height] duration-300 ${
                      isOpen ? "max-h-96" : "max-h-0"
                    }`}
                  >
                    <div
                      className="px-6 pb-6 leading-relaxed"
                      style={{ color: isOpen ? "inherit" : RED }}
                    >
                      {faq.answer}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </section>
  );
}
