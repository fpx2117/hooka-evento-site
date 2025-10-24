// components/whatsapp-button.tsx
"use client";

type SizeVariant = "compact" | "cozy" | "spacious";

type Props = {
  src?: string; // PNG en /public (ej: "/whatsapp.png")
  text?: string; // Texto base SIN emoji
  phone?: string; // sin "+"
  positionClassName?: string; // Ej: "bottom-4 right-4"
  variant?: SizeVariant; // compact | cozy | spacious
  addLipEmoji?: boolean; // 🫦
};

const SIZE_CLASSES: Record<SizeVariant, string> = {
  // w/h por breakpoint: mobile | md | lg
  compact: "w-12 h-12 md:w-14 md:h-14 lg:w-16 lg:h-16", // 48 | 56 | 64
  cozy: "w-14 h-14 md:w-16 md:h-16 lg:w-20 lg:h-20", // 56 | 64 | 80
  spacious: "w-16 h-16 md:w-18 md:h-18 lg:w-22 lg:h-22", // 64 | 72 | 88 (tailwind 18/22 requiere plugin; usa cozy si no)
};

export default function WhatsAppButton({
  src = "/whatsapp.webp",
  text = "¡Hola! Vengo de la web de Hooka Party",
  phone = "5491136529318",
  positionClassName = "bottom-5 right-5", // también lo acerqué un poco al borde
  variant = "compact",
  addLipEmoji = true,
}: Props) {
  // Limpia invisibles/� y normaliza
  const clean = (s: string) =>
    s
      .replace(/\uFFFD/gu, "")
      .replace(/\p{Cf}/gu, "")
      .normalize("NFC");

  const base = clean(text);
  const lip = String.fromCodePoint(0x1fae6); // 🫦 (Unicode 14)
  const msg = addLipEmoji ? `${base} ${lip}` : base;

  // URL de WhatsApp con codificación correcta
  const url = new URL(`https://api.whatsapp.com/send`);
  url.search = new URLSearchParams({
    phone,
    text: msg,
    type: "phone_number",
    app_absent: "0",
  }).toString();
  const href = url.toString();

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Contactar por WhatsApp"
      className={`fixed ${positionClassName} z-[9999] group`}
    >
      {/* Contenedor responsive (más chico en mobile) */}
      <div className={`relative ${SIZE_CLASSES[variant]}`}>
        {/* Halo sutil */}
        <span className="absolute inset-0 rounded-full animate-ping opacity-25 bg-green-500" />
        {/* Ícono PNG: object-contain y SIN rounded-full para no cortar la “colita” */}
        <img
          src={src}
          alt="WhatsApp"
          className="relative w-full h-full object-contain drop-shadow-lg transition-transform duration-200 group-hover:scale-105"
          draggable={false}
        />
      </div>
    </a>
  );
}
