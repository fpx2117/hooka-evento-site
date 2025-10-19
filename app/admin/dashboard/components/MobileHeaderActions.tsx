"use client";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  DollarSign,
  LogOut,
  MoreVertical,
  SlidersHorizontal,
} from "lucide-react";

export default function MobileHeaderActions({
  onOpenConfig,
  onOpenDiscounts,
  onLogout,
}: {
  onOpenConfig: () => void;
  onOpenDiscounts: () => void;
  onLogout: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="sm:hidden" aria-label="Abrir menú">
          <MoreVertical className="w-4 h-4 mr-2" /> Menú
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem onClick={onOpenConfig} className="gap-2">
          <SlidersHorizontal className="w-4 h-4" /> Configuración
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onOpenDiscounts} className="gap-2">
          <DollarSign className="w-4 h-4" /> Descuentos
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onLogout} className="gap-2 text-red-600">
          <LogOut className="w-4 h-4" /> Salir
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
