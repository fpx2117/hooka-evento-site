import { Button } from "@/components/ui/button"
import { Clock, Home, Mail } from "lucide-react"
import Link from "next/link"

export default function PaymentPendingPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-yellow-500/20 via-orange-500/20 to-primary/20">
      <div className="max-w-md w-full bg-background rounded-2xl shadow-2xl p-8 text-center space-y-6">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-yellow-500/20 animate-pulse">
          <Clock className="w-12 h-12 text-yellow-600" />
        </div>

        <div className="space-y-2">
          <h1 className="text-3xl font-display text-balance">Pago Pendiente</h1>
          <p className="text-muted-foreground leading-relaxed">
            Tu pago está siendo procesado. Te notificaremos por email cuando se confirme.
          </p>
        </div>

        <div className="bg-muted/50 rounded-xl p-4 space-y-2 text-sm">
          <div className="flex items-center justify-center gap-2 text-muted-foreground">
            <Mail className="w-4 h-4" />
            <span>Recibirás una confirmación por email</span>
          </div>
          <p className="text-xs text-muted-foreground">
            El proceso puede demorar algunos minutos. No te preocupes, te mantendremos informado.
          </p>
        </div>

        <div className="space-y-3 pt-4">
          <Button asChild size="lg" className="w-full rounded-full">
            <Link href="/">
              <Home className="w-4 h-4 mr-2" />
              Volver al inicio
            </Link>
          </Button>
          <p className="text-xs text-muted-foreground">Gracias por tu paciencia</p>
        </div>
      </div>
    </div>
  )
}
