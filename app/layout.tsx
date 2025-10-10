// app/layout.tsx
import type { Metadata } from "next";
import { Poppins, Bebas_Neue } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { Suspense } from "react";
import Providers from "./providers"; // <-- archivo que provee QueryClientProvider
import "./globals.css";

// Fuentes Google con variables CSS
const poppins = Poppins({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
  variable: "--font-poppins",
  display: "swap",
});

const bebasNeue = Bebas_Neue({
  subsets: ["latin"],
  weight: ["400"],
  variable: "--font-bebas-neue",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Tropical Pool Party - ¡Vive el Verano!",
  description:
    "El mejor boliche tropical con pool party, música, fiesta y verano. Fiesta de la espuma, Neon Party, Cumbia Night, RKT Session y más.",
  generator: "v0.app",
  metadataBase: new URL("https://tropicalpoolparty.com"), // ajustá dominio
  openGraph: {
    title: "Tropical Pool Party - ¡Vive el Verano!",
    description:
      "¡Vení a disfrutar de la mejor fiesta tropical del verano! Música, piscina, espuma, luces y diversión sin fin.",
    url: "https://tropicalpoolparty.com",
    siteName: "Tropical Pool Party",
    locale: "es_ES",
    type: "website",
  },
};

// Layout raíz
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body
        className={`min-h-screen bg-white text-gray-900 dark:bg-[#0a0a0a] dark:text-gray-100 antialiased ${poppins.variable} ${bebasNeue.variable}`}
      >
        <Providers>
          <Suspense fallback={null}>{children}</Suspense>
        </Providers>
        <Analytics />
      </body>
    </html>
  );
}
