"use client";

import type React from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { ArrowUpDown, Filter, Search } from "lucide-react";

type Status = "all" | "approved" | "pending" | "rejected";
type TypeFilter = "all" | "general" | "vip";
type Gender = "all" | "hombre" | "mujer";
type Pay = "all" | "efectivo" | "transferencia" | "mercadopago";
type Order = "asc" | "desc";
type OrderBy = "purchaseDate" | "totalPrice";

interface FiltersBarProps {
  q: string;
  setQ: React.Dispatch<React.SetStateAction<string>>;
  fStatus: Status;
  setFStatus: React.Dispatch<React.SetStateAction<Status>>;
  fType: TypeFilter;
  setFType: React.Dispatch<React.SetStateAction<TypeFilter>>;
  fGender: Gender;
  setFGender: React.Dispatch<React.SetStateAction<Gender>>;
  fPay: Pay;
  setFPay: React.Dispatch<React.SetStateAction<Pay>>;
  order: Order;
  setOrder: React.Dispatch<React.SetStateAction<Order>>;
  orderBy: OrderBy;
  setOrderBy: React.Dispatch<React.SetStateAction<OrderBy>>;
}

export default function FiltersBar({
  q,
  setQ,
  fStatus,
  setFStatus,
  fType,
  setFType,
  fGender,
  setFGender,
  fPay,
  setFPay,
  order,
  setOrder,
  orderBy,
  setOrderBy,
}: FiltersBarProps) {
  return (
    <div className="mb-6 border-border/50 shadow-sm rounded-lg overflow-hidden">
      <div className="bg-white px-6 py-4 border-b border-border/50 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
          <Filter className="w-4 h-4 text-blue-600" />
        </div>
        <div>
          <div className="text-base font-semibold">Filtros y Búsqueda</div>
          <div className="text-sm text-muted-foreground">
            Filtrá y ordená las entradas listadas abajo
          </div>
        </div>
      </div>

      <div className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
          <div className="lg:col-span-2">
            <Label className="text-sm font-medium mb-2 block">Búsqueda</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Nombre, email o DNI"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="pl-10 border-border/50"
              />
            </div>
          </div>

          <div>
            <Label className="text-sm font-medium mb-2 block">Estado</Label>
            <Select
              value={fStatus}
              onValueChange={(v) => setFStatus(v as Status)}
            >
              <SelectTrigger className="border-border/50">
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="approved">Aprobado</SelectItem>
                <SelectItem value="pending">Pendiente</SelectItem>
                <SelectItem value="rejected">Rechazado</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-sm font-medium mb-2 block">Tipo</Label>
            <Select
              value={fType}
              onValueChange={(v) => setFType(v as TypeFilter)}
            >
              <SelectTrigger className="border-border/50">
                <SelectValue placeholder="Tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="general">General</SelectItem>
                <SelectItem value="vip">VIP</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-sm font-medium mb-2 block">Género</Label>
            <Select
              value={fGender}
              onValueChange={(v) => setFGender(v as Gender)}
            >
              <SelectTrigger className="border-border/50">
                <SelectValue placeholder="Género" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="hombre">Hombre</SelectItem>
                <SelectItem value="mujer">Mujer</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-sm font-medium mb-2 block">Pago</Label>
            <Select value={fPay} onValueChange={(v) => setFPay(v as Pay)}>
              <SelectTrigger className="border-border/50">
                <SelectValue placeholder="Método" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="efectivo">Efectivo</SelectItem>
                <SelectItem value="transferencia">Transferencia</SelectItem>
                <SelectItem value="mercadopago">Mercado Pago</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-border/50 flex flex-col sm:flex-row sm:items-end gap-3">
          <div className="flex-1">
            <Label className="text-sm font-medium mb-2 block">
              Ordenar por
            </Label>
            <Select
              value={orderBy}
              onValueChange={(v) => setOrderBy(v as OrderBy)}
            >
              <SelectTrigger className="border-border/50">
                <SelectValue placeholder="Campo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="purchaseDate">Fecha compra</SelectItem>
                <SelectItem value="totalPrice">Precio total</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => setOrder(order === "asc" ? "desc" : "asc")}
            className="border-border/50"
          >
            <ArrowUpDown className="w-4 h-4 mr-2" />{" "}
            {order === "asc" ? "Ascendente" : "Descendente"}
          </Button>
        </div>
      </div>
    </div>
  );
}
