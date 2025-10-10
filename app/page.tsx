import { Header } from "@/components/header"
import { Hero } from "@/components/hero"
import { Lineup } from "@/components/lineup"
import { FAQ } from "@/components/faq"
import { CTA } from "@/components/cta"
import { Footer } from "@/components/footer"

export default function Home() {
  return (
    <main className="min-h-screen overflow-x-hidden">
      <Header />
      <Hero />
      <Lineup />
      <FAQ />
      <CTA />
      <Footer />
    </main>
  )
}
