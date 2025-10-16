"use client";

import type React from "react";
import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Lock, User } from "lucide-react";
import HeroBackgroundEasy from "@/components/HeroBackgroundEasy";

export default function AdminLoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Error al iniciar sesión");
        return;
      }

      router.push("/admin/dashboard");
    } catch {
      setError("Error de conexión");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="relative min-h-[100svh] overflow-hidden text-white">
      {/* Fondo HOOKA */}
      <HeroBackgroundEasy
        mobile={{ rows: 4, cols: 1 }}
        desktop={{ rows: 4, cols: 3 }}
        fontMobile="clamp(2.6rem, 21vw, 9rem)"
        opacity={0.65}
        gap="clamp(0px, 1vh, 10px)"
        navTopPx={0}
      />

      {/* Velo para contraste */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,rgba(0,0,0,.45),rgba(0,0,0,.65))]"
      />

      {/* Contenido */}
      <section className="relative z-10 grid min-h-[100svh] place-items-center px-4">
        <Card className="w-full max-w-md backdrop-blur-xl bg-black/50 text-white shadow-2xl border border-white/20">
          <CardHeader className="space-y-1 text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-br from-[#5b0d0d] via-[#7a0a0a] to-[#a11212] flex items-center justify-center shadow-lg">
              <Lock className="w-8 h-8 text-white" />
            </div>
            <CardTitle className="text-2xl font-display text-white">
              Panel de Administración
            </CardTitle>
            <CardDescription className="text-white/80">
              Ingresa tus credenciales para acceder
            </CardDescription>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="username" className="text-white">
                  Usuario
                </Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/80" />
                  <Input
                    id="username"
                    type="text"
                    placeholder="admin"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="
                      pl-10
                      bg-white/0
                      text-white
                      placeholder:text-white/60
                      border-white/30
                      focus-visible:ring-[#a11212]
                      focus-visible:border-white
                    "
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-white">
                  Contraseña
                </Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/80" />
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="
                      pl-10
                      bg-white/0
                      text-white
                      placeholder:text-white/60
                      border-white/30
                      focus-visible:ring-[#a11212]
                      focus-visible:border-white
                    "
                    required
                  />
                </div>
              </div>

              {error && (
                <div className="text-sm text-white bg-[#7a0a0a]/80 p-3 rounded-md border border-white/20">
                  {error}
                </div>
              )}

              <Button
                type="submit"
                className="w-full bg-[#5b0d0d] hover:bg-[#7a0a0a] text-white"
                disabled={loading}
              >
                {loading ? "Iniciando sesión..." : "Iniciar Sesión"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
