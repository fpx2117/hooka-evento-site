import {
  Instagram,
  MessageCircle,
  Music,
  Clock,
  Mail,
  Phone,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export function Footer() {
  return (
    <footer className="bg-foreground text-background py-16">
      <div className="container mx-auto px-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-12 mb-12">
          {/* Brand */}
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary via-secondary to-accent flex items-center justify-center">
                <span className="text-2xl">🌴</span>
              </div>
              <div>
                <h3 className="text-2xl font-display tracking-wider">Hooka</h3>
                <p className="text-xs tracking-widest opacity-70">PARTY</p>
              </div>
            </div>
            <p className="text-sm opacity-80 leading-relaxed">
              La mejor fiesta de la ciudad. Música, diversión y verano todo el
              año.
            </p>
          </div>

          {/* Información */}
          <div className="space-y-4">
            <h4 className="text-lg font-display tracking-wide">INFORMACIÓN</h4>
            <div className="space-y-3 text-sm opacity-80">
              <div className="flex items-start gap-3">
                <Clock className="w-5 h-5 flex-shrink-0 mt-0.5" />
                <p>
                  Domingo
                  <br />
                  10am - 18pm
                </p>
              </div>
              <p className="text-xs leading-relaxed">
                La ubicación exacta se confirma por email una vez realizada la
                compra. Nuestras fiestas rotan entre diferentes locaciones para
                ofrecerte experiencias únicas.
              </p>
            </div>
          </div>

          {/* Contacto */}
          <div className="space-y-4">
            <h4 className="text-lg font-display tracking-wide">CONTACTO</h4>
            <div className="space-y-3 text-sm opacity-80">
              <div className="flex items-center gap-3">
                <Mail className="w-5 h-5 flex-shrink-0" />
                <p>info@hooka.com.ar</p>
                <p>info@vasconceldiego.com</p>
              </div>
            </div>
          </div>

          {/* Redes Sociales */}
          <div className="space-y-4">
            <h4 className="text-lg font-display tracking-wide">SEGUINOS</h4>
            <div className="flex gap-3">
              <Button
                size="icon"
                variant="outline"
                className="rounded-full border-background/20 hover:bg-primary hover:border-primary transition-all bg-transparent"
                asChild
              >
                <a
                  href="https://instagram.com"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Instagram className="w-5 h-5" />
                </a>
              </Button>
              <Button
                size="icon"
                variant="outline"
                className="rounded-full border-background/20 hover:bg-secondary hover:border-secondary transition-all bg-transparent"
                asChild
              >
                <a
                  href="https://wa.me/1234567890"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <MessageCircle className="w-5 h-5" />
                </a>
              </Button>
              <Button
                size="icon"
                variant="outline"
                className="rounded-full border-background/20 hover:bg-accent hover:border-accent transition-all bg-transparent"
                asChild
              >
                <a
                  href="https://tiktok.com"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Music className="w-5 h-5" />
                </a>
              </Button>
            </div>
            <p className="text-sm opacity-80 leading-relaxed mt-3">
              Etiquetanos en tus historias con #HookaParty
            </p>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="pt-8 border-t border-background/10 flex flex-col md:flex-row items-center justify-between gap-4 text-sm opacity-70">
          <p>© 2025 Hooka Party. Todos los derechos reservados.</p>
          <div className="flex gap-6">
            <a href="#" className="hover:opacity-100 transition-opacity">
              Términos y Condiciones
            </a>
            <a href="#" className="hover:opacity-100 transition-opacity">
              Política de Privacidad
            </a>
            <Link
              href="/admin/login"
              className="hover:opacity-100 transition-opacity"
            >
              Panel administrador
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
