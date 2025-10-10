"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

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

  return (
    <section className="py-24 bg-gradient-to-b from-muted/30 to-background">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16 space-y-4">
          <h2 className="text-5xl md:text-7xl font-display text-gradient tracking-tight">
            PREGUNTAS FRECUENTES
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Todo lo que necesitas saber sobre nuestras fiestas
          </p>
        </div>

        <div className="max-w-3xl mx-auto space-y-4">
          {faqs.map((faq, index) => (
            <Card
              key={index}
              className="border-2 hover:border-primary/50 transition-colors cursor-pointer overflow-hidden"
              onClick={() => setOpenIndex(openIndex === index ? null : index)}
            >
              <CardContent className="p-0">
                <div className="p-6 flex items-center justify-between">
                  <h3 className="text-lg font-semibold pr-4">{faq.question}</h3>
                  <ChevronDown
                    className={`w-5 h-5 flex-shrink-0 transition-transform duration-300 ${
                      openIndex === index ? "rotate-180" : ""
                    }`}
                  />
                </div>
                <div
                  className={`overflow-hidden transition-all duration-300 ${
                    openIndex === index ? "max-h-96" : "max-h-0"
                  }`}
                >
                  <div className="px-6 pb-6 text-muted-foreground leading-relaxed">
                    {faq.answer}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
