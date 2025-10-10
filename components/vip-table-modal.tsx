"use client"

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Sparkles, Users, CreditCard, Calendar, MapPin, Award as IdCard } from "lucide-react"
import { useState } from "react"

interface VIPTableModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const tablePackages = [
  {
    id: "standard",
    name: "Mesa VIP Standard",
    capacity: "Hasta 6 personas",
    price: 35000,
    includes: ["Botella de Fernet", "Botella de Vodka", "Gaseosas ilimitadas", "Zona VIP exclusiva"],
    color: "from-primary to-secondary",
  },
  {
    id: "premium",
    name: "Mesa VIP Premium",
    capacity: "Hasta 8 personas",
    price: 55000,
    includes: [
      "2 Botellas de Fernet",
      "Botella de Vodka Premium",
      "Botella de Champagne",
      "Gaseosas y jugos ilimitados",
      "Zona VIP exclusiva",
      "Servicio de mesero dedicado",
    ],
    color: "from-secondary to-accent",
    popular: true,
  },
  {
    id: "deluxe",
    name: "Mesa VIP Deluxe",
    capacity: "Hasta 10 personas",
    price: 80000,
    includes: [
      "3 Botellas de Fernet",
      "2 Botellas de Vodka Premium",
      "2 Botellas de Champagne",
      "Gaseosas, jugos y energizantes ilimitados",
      "Zona VIP exclusiva primera fila",
      "Servicio de mesero dedicado",
      "Entrada prioritaria",
      "Decoración especial de mesa",
    ],
    color: "from-accent to-chart-3",
  },
]

const locationOptions = [
  {
    id: "piscina",
    name: "Cerca de la Piscina",
    description: "Vista directa a la piscina, ambiente más relajado",
    icon: "🏊",
  },
  {
    id: "dj",
    name: "Cerca del DJ",
    description: "En el corazón de la fiesta, máxima energía",
    icon: "🎧",
  },
]

export function VIPTableModal({ open, onOpenChange }: VIPTableModalProps) {
  const [selectedPackage, setSelectedPackage] = useState<string>("")
  const [selectedDate, setSelectedDate] = useState<string>("")
  const [selectedLocation, setSelectedLocation] = useState<string>("")
  const [customerInfo, setCustomerInfo] = useState({
    name: "",
    email: "",
    phone: "",
    dni: "",
    guests: "",
  })
  const [isProcessing, setIsProcessing] = useState(false)

  const selectedTable = tablePackages.find((pkg) => pkg.id === selectedPackage)

  const handleCheckout = async () => {
    if (!selectedPackage) {
      alert("Por favor seleccioná un paquete de mesa VIP")
      return
    }

    if (!selectedDate) {
      alert("Por favor seleccioná una fecha")
      return
    }

    if (!selectedLocation) {
      alert("Por favor seleccioná la ubicación de tu mesa")
      return
    }

    if (!customerInfo.name || !customerInfo.email || !customerInfo.phone || !customerInfo.dni || !customerInfo.guests) {
      alert("Por favor completá todos tus datos")
      return
    }

    setIsProcessing(true)

    try {
      const table = tablePackages.find((pkg) => pkg.id === selectedPackage)
      if (!table) throw new Error("Paquete no encontrado")

      const response = await fetch("/api/create-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: [
            {
              title: `${table.name} - ${selectedDate}`,
              description: `${table.capacity} - ${table.includes.join(", ")}`,
              quantity: 1,
              unit_price: table.price,
            },
          ],
          payer: {
            ...customerInfo,
            additionalInfo: {
              date: selectedDate,
              guests: customerInfo.guests,
              location: selectedLocation,
              packageType: selectedPackage,
            },
          },
          type: "vip-table",
        }),
      })

      const data = await response.json()

      if (data.init_point) {
        window.location.href = data.init_point
      } else {
        throw new Error("No se pudo crear la preferencia de pago")
      }
    } catch (error) {
      console.error("Error al procesar la reserva:", error)
      alert("Hubo un error al procesar tu reserva. Por favor intentá nuevamente.")
      setIsProcessing(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-3xl font-display flex items-center gap-3">
            <Sparkles className="w-8 h-8 text-accent" />
            Reservar Mesa VIP
          </DialogTitle>
          <DialogDescription>Elegí tu paquete VIP y asegurá la mejor experiencia para tu grupo</DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Package Selection */}
          <div className="space-y-4">
            <h3 className="font-semibold text-lg">Seleccioná tu paquete</h3>
            <RadioGroup value={selectedPackage} onValueChange={setSelectedPackage}>
              {tablePackages.map((pkg) => (
                <div key={pkg.id} className="relative">
                  {pkg.popular && (
                    <div className="absolute -top-3 left-4 z-10">
                      <span className="bg-accent text-white text-xs font-bold px-3 py-1 rounded-full">MÁS ELEGIDO</span>
                    </div>
                  )}
                  <label
                    htmlFor={pkg.id}
                    className={`block border-2 rounded-xl p-6 cursor-pointer transition-all hover:border-primary ${
                      selectedPackage === pkg.id ? "border-primary bg-primary/5" : "border-border"
                    }`}
                  >
                    <div className="flex items-start gap-4">
                      <RadioGroupItem value={pkg.id} id={pkg.id} className="mt-1" />
                      <div className="flex-1 space-y-3">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <div
                              className={`inline-block px-3 py-1 rounded-full bg-gradient-to-r ${pkg.color} text-white text-xs font-bold mb-2`}
                            >
                              {pkg.name}
                            </div>
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <Users className="w-4 h-4" />
                              {pkg.capacity}
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-3xl font-bold">${pkg.price.toLocaleString()}</p>
                            <p className="text-xs text-muted-foreground">por mesa</p>
                          </div>
                        </div>
                        <div className="space-y-1">
                          <p className="text-sm font-semibold">Incluye:</p>
                          <ul className="text-sm text-muted-foreground space-y-1">
                            {pkg.includes.map((item, idx) => (
                              <li key={idx} className="flex items-start gap-2">
                                <span className="text-primary mt-0.5">✓</span>
                                {item}
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </div>
                  </label>
                </div>
              ))}
            </RadioGroup>
          </div>

          {selectedPackage && (
            <div className="space-y-4 pt-4 border-t">
              <h3 className="font-semibold text-lg flex items-center gap-2">
                <MapPin className="w-5 h-5" />
                Ubicación de tu mesa
              </h3>
              <RadioGroup value={selectedLocation} onValueChange={setSelectedLocation}>
                <div className="grid gap-4 md:grid-cols-2">
                  {locationOptions.map((location) => (
                    <label
                      key={location.id}
                      htmlFor={`location-${location.id}`}
                      className={`block border-2 rounded-xl p-4 cursor-pointer transition-all hover:border-primary ${
                        selectedLocation === location.id ? "border-primary bg-primary/5" : "border-border"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <RadioGroupItem value={location.id} id={`location-${location.id}`} className="mt-1" />
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-2xl">{location.icon}</span>
                            <span className="font-semibold">{location.name}</span>
                          </div>
                          <p className="text-sm text-muted-foreground">{location.description}</p>
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              </RadioGroup>
            </div>
          )}

          {/* Date Selection */}
          {selectedPackage && selectedLocation && (
            <div className="space-y-4 pt-4 border-t">
              <h3 className="font-semibold text-lg flex items-center gap-2">
                <Calendar className="w-5 h-5" />
                Seleccioná la fecha
              </h3>
              <Input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                min={new Date().toISOString().split("T")[0]}
                className="text-lg"
              />
              <p className="text-sm text-muted-foreground">
                Las mesas VIP están disponibles de miércoles a sábado. Te contactaremos para confirmar disponibilidad.
              </p>
            </div>
          )}

          {/* Customer Information */}
          {selectedPackage && selectedLocation && selectedDate && (
            <div className="space-y-4 pt-4 border-t">
              <h3 className="font-semibold text-lg">Tus datos</h3>
              <div className="grid gap-4">
                <div className="space-y-2">
                  <Label htmlFor="vip-name">Nombre completo</Label>
                  <Input
                    id="vip-name"
                    placeholder="Juan Pérez"
                    value={customerInfo.name}
                    onChange={(e) => setCustomerInfo({ ...customerInfo, name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="vip-dni" className="flex items-center gap-2">
                    <IdCard className="w-4 h-4" />
                    DNI
                  </Label>
                  <Input
                    id="vip-dni"
                    placeholder="12345678"
                    value={customerInfo.dni}
                    onChange={(e) => setCustomerInfo({ ...customerInfo, dni: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="vip-email">Email</Label>
                  <Input
                    id="vip-email"
                    type="email"
                    placeholder="juan@ejemplo.com"
                    value={customerInfo.email}
                    onChange={(e) => setCustomerInfo({ ...customerInfo, email: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="vip-phone">Teléfono</Label>
                  <Input
                    id="vip-phone"
                    type="tel"
                    placeholder="+54 11 1234-5678"
                    value={customerInfo.phone}
                    onChange={(e) => setCustomerInfo({ ...customerInfo, phone: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="guests">Cantidad de invitados</Label>
                  <Input
                    id="guests"
                    type="number"
                    min="1"
                    max={selectedTable ? Number.parseInt(selectedTable.capacity.match(/\d+/)?.[0] || "10") : 10}
                    placeholder="6"
                    value={customerInfo.guests}
                    onChange={(e) => setCustomerInfo({ ...customerInfo, guests: e.target.value })}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Total */}
          {selectedPackage && selectedLocation && selectedDate && selectedTable && (
            <div className="bg-gradient-to-r from-accent/10 to-chart-3/10 rounded-xl p-6 space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="font-semibold">Paquete:</span>
                  <span className="font-bold">{selectedTable.name}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="font-semibold">Ubicación:</span>
                  <span className="font-bold">{locationOptions.find((l) => l.id === selectedLocation)?.name}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="font-semibold">Fecha:</span>
                  <span className="font-bold">{new Date(selectedDate + "T00:00:00").toLocaleDateString("es-AR")}</span>
                </div>
              </div>
              <div className="flex justify-between items-center text-2xl pt-4 border-t">
                <span className="font-bold">Total a pagar:</span>
                <span className="font-bold text-accent">${selectedTable.price.toLocaleString()}</span>
              </div>
              <Button
                size="lg"
                onClick={handleCheckout}
                disabled={isProcessing}
                className="w-full text-lg py-6 rounded-full bg-gradient-to-r from-accent via-chart-3 to-primary hover:scale-105 transition-transform"
              >
                <CreditCard className="w-5 h-5 mr-2" />
                {isProcessing ? "Procesando..." : "Reservar con Mercado Pago"}
              </Button>
              <p className="text-xs text-center text-muted-foreground">
                Serás redirigido a Mercado Pago para completar tu reserva de forma segura
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
