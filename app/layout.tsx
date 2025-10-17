// app/layout.tsx
import type { Metadata } from "next";
import { Poppins, Bebas_Neue } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { Suspense } from "react";
import Providers from "./providers";
import "./globals.css";

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
  metadataBase: new URL("https://hooka.com.ar"),
  title: {
    default: "Hooka Party",
    template: "%s | Hooka Party",
  },
  description:
    "La mejor fiesta de zona norte, música, fiesta y verano. Fiesta de la espuma, Neon Party, Cumbia Night, RKT Session y más.",
  openGraph: {
    type: "website",
    url: "/",
    siteName: "Hooka Party",
    locale: "es_ES",
    title: "Hooka Party",
    description: "La mejor fiesta de zona norte.",
  },
  alternates: { canonical: "/" },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        {/* Favicon clásico desde /public */}
        <link rel="icon" href="/logov1.png" />
        {/* Si preferís PNG en /public/icon.png, usá esta en lugar de la anterior: */}
        {/* <link rel="icon" href="/icon.png" type="image/png" sizes="32x32" /> */}

        {/* Opcional: iOS y manifest si los agregás en /public */}
        {/* <link rel="apple-touch-icon" href="/apple-touch-icon.png" /> */}
        {/* <link rel="manifest" href="/site.webmanifest" /> */}
      </head>
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
