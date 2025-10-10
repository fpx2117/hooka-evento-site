import { Button } from "@/components/ui/button"
import { XCircle, Home, RotateCcw } from "lucide-react"
import Link from "next/link"

export default function PaymentFailurePage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-red-500/20 via-orange-500/20 to-yellow-500/20">
      <div className="max-w-md w-full bg-background rounded-2xl shadow-2xl p-8 text-center space-y-6">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-red-500/20">
          <XCircle className="w-12 h-12 text-red-500" />
        </div>

        <div className="space-y-2">
          <h1 className="text-3xl font-display text-balance">Pago Rechazado</h1>
          <p className="text-muted-foreground leading-relaxed">
            Hubo un problema al procesar tu pago. Por favor verificá tus datos e intentá nuevamente.
          </p>
        </div>

        <div className="bg-muted/50 rounded-xl p-4 space-y-2 text-sm">
          <p className="font-semibold">Posibles causas:</p>
          <ul className="text-xs text-muted-foreground space-y-1 text-left">
            <li>• Fondos insuficientes</li>
            <li>• Datos de tarjeta incorrectos</li>
            <li>• Límite de compra excedido</li>
            <li>• Problemas con el banco emisor</li>
          </ul>
        </div>

        <div className="space-y-3 pt-4">
          <Button asChild size="lg" className="w-full rounded-full">
            <Link href="/">
              <RotateCcw className="w-4 h-4 mr-2" />
              Intentar nuevamente
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="w-full rounded-full bg-transparent">
            <Link href="/">
              <Home className="w-4 h-4 mr-2" />
              Volver al inicio
            </Link>
          </Button>
        </div>
      </div>
    </div>
  )
}
