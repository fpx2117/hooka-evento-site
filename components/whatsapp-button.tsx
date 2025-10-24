"use client";

import { usePathname } from "next/navigation";

type SizeVariant = "compact" | "cozy" | "spacious";

type Props = {
  src?: string;
  text?: string; // texto base SIN emoji
  phone?: string; // sin "+"
  positionClassName?: string;
  variant?: SizeVariant;
  addLipEmoji?: boolean; // 🫦
  /** Prefijos de ruta a ocultar: ej. ["/admin", "/dashboard"] */
  excludePrefixes?: string[];
  /** Patrones regex en STRING: ej. ["^/gestion(/|$)"] */
  excludeRegex?: string[];
};

const SIZE_CLASSES: Record<SizeVariant, string> = {
  compact: "w-12 h-12 md:w-14 md:h-14 lg:w-16 lg:h-16",
  cozy: "w-14 h-14 md:w-16 md:h-16 lg:w-20 lg:h-20",
  spacious: "w-16 h-16 md:w-20 md:h-20 lg:w-24 lg:h-24",
};

function shouldHide(
  pathname: string,
  prefixes: string[] = [],
  regexStrs: string[] = []
) {
  if (prefixes.some((p) => pathname.startsWith(p))) return true;
  // construimos RegExp aquí (lado cliente)
  for (const pat of regexStrs) {
    try {
      const rx = new RegExp(pat);
      if (rx.test(pathname)) return true;
    } catch {
      /* ignora patrones inválidos */
    }
  }
  return false;
}

export default function WhatsAppButton({
  src = "/WhatsApp_icon.png",
  text = "¡Hola! Vengo de la web de Hooka Party",
  phone = "5491136529318",
  positionClassName = "bottom-4 right-4",
  variant = "compact",
  addLipEmoji = true,
  excludePrefixes = [],
  excludeRegex = [],
}: Props) {
  const pathname = usePathname();
  if (pathname && shouldHide(pathname, excludePrefixes, excludeRegex))
    return null;

  const clean = (s: string) =>
    s
      .replace(/\uFFFD/gu, "")
      .replace(/\p{Cf}/gu, "")
      .normalize("NFC");

  const base = clean(text);
  const lip = String.fromCodePoint(0x1fae6); // 🫦
  const msg = addLipEmoji ? `${base} ${lip}` : base;

  const url = new URL("https://api.whatsapp.com/send");
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
      <div className={`relative ${SIZE_CLASSES[variant]}`}>
        <span className="absolute inset-0 rounded-full animate-ping opacity-25 bg-green-500" />
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
