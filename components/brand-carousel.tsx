"use client"

export function BrandCarousel() {
  const brands = [
    { name: "Absolut", logo: "/absolut-vodka-logo.jpg" },
    { name: "Smirnoff", logo: "/smirnoff-logo.jpg" },
    { name: "Bacardi", logo: "/bacardi-logo.jpg" },
    { name: "Heineken", logo: "/stylized-green-star.png" },
    { name: "Corona", logo: "/corona-beer-logo.jpg" },
    { name: "Red Bull", logo: "/red-bull-logo.jpg" },
    { name: "Campari", logo: "/campari-logo.jpg" },
    { name: "Jagermeister", logo: "/jagermeister-logo.jpg" },
  ]

  // Duplicate brands for seamless loop
  const duplicatedBrands = [...brands, ...brands]

  return (
    <section className="py-16 bg-background/50 overflow-hidden">
      <div className="container mx-auto px-4 mb-8">
        <h3 className="text-2xl md:text-3xl font-display text-center text-muted-foreground tracking-wide">
          NUESTRAS MARCAS
        </h3>
      </div>

      <div className="relative">
        <div className="flex animate-scroll-left">
          {duplicatedBrands.map((brand, index) => (
            <div
              key={index}
              className="flex-shrink-0 mx-8 flex items-center justify-center grayscale hover:grayscale-0 transition-all duration-300 opacity-70 hover:opacity-100"
            >
              <img
                src={brand.logo || "/placeholder.svg"}
                alt={brand.name}
                className="h-16 md:h-20 w-auto object-contain"
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
