"use client";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  CheckCircle,
  DollarSign,
  Ticket,
  TrendingUp,
  Users,
} from "lucide-react";

export default function StatsCards({
  stats,
  cfg,
  cfgLoading,
  sumVipRemainingTables,
}: {
  stats: { total: number; validated: number; revenue: number };
  cfg: any;
  cfgLoading: boolean;
  sumVipRemainingTables: number;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-6 sm:mb-8">
      <Card className="border-border/50 shadow-sm hover:shadow-md transition-shadow">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Total Entradas
          </CardTitle>
          <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
            <Users className="h-5 w-5 text-blue-600" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-2xl sm:text-3xl font-bold">{stats.total}</div>
          <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
            <TrendingUp className="w-3 h-3" /> Entradas registradas
          </p>
        </CardContent>
      </Card>

      <Card className="border-border/50 shadow-sm hover:shadow-md transition-shadow">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Validadas
          </CardTitle>
          <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center">
            <CheckCircle className="h-5 w-5 text-emerald-600" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-2xl sm:text-3xl font-bold">
            {stats.validated}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {stats.total > 0
              ? Math.round((stats.validated / stats.total) * 100)
              : 0}
            % del total
          </p>
        </CardContent>
      </Card>

      <Card className="border-border/50 shadow-sm hover:shadow-md transition-shadow">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Ingresos
          </CardTitle>
          <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center">
            <DollarSign className="h-5 w-5 text-amber-600" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-2xl sm:text-3xl font-bold">
            ${stats.revenue.toLocaleString("es-AR")}
          </div>
          <p className="text-xs text-muted-foreground mt-1">Ingresos totales</p>
        </CardContent>
      </Card>

      <Card className="border-border/50 shadow-sm hover:shadow-md transition-shadow">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Cupos Disponibles
          </CardTitle>
          <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
            <Ticket className="h-5 w-5 text-purple-600" />
          </div>
        </CardHeader>
        <CardContent className="text-sm">
          {cfgLoading ? (
            <div className="text-muted-foreground">Cargando…</div>
          ) : cfg ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Total:</span>
                <b>{cfg.totals.remainingPersons} restantes</b>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">VIP (mesas):</span>
                <b>{sumVipRemainingTables} mesas</b>
              </div>
            </div>
          ) : (
            <div className="text-muted-foreground">
              Sin configuración disponible
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
