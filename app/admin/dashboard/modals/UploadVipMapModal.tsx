"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import axios from "axios";
import { ImagePlus, UploadCloud, Loader2 } from "lucide-react";

interface UploadVipMapModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  configId: string | null;
  onSuccess?: () => Promise<void> | void;
}

export default function UploadVipMapModal({
  open,
  onOpenChange,
  configId,
  onSuccess,
}: UploadVipMapModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setPreview(URL.createObjectURL(selectedFile));
    }
  };

  const handleUpload = async () => {
    if (!file || !configId) {
      toast.error("Selecciona un archivo antes de subirlo.");
      return;
    }

    try {
      setLoading(true);
      const formData = new FormData();
      formData.append("file", file);
      formData.append("configId", configId);

      const { data } = await axios.post("/api/vip-tables/upload-map", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      if (data.ok) {
        toast.success("Mapa actualizado correctamente ✅");
        if (onSuccess) await onSuccess();
        onOpenChange(false);
        setFile(null);
        setPreview(null);
      } else {
        toast.error(data.error || "No se pudo subir el mapa.");
      }
    } catch (error) {
      console.error("Error subiendo mapa:", error);
      toast.error("Error interno al subir el mapa.");
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    setFile(null);
    setPreview(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Subir o reemplazar mapa VIP</DialogTitle>
          <DialogDescription>
            Selecciona una imagen del mapa de la ubicación VIP. Si ya existe un mapa anterior, será reemplazado automáticamente.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="file">Archivo de imagen (JPG, PNG)</Label>
            <Input
              id="file"
              type="file"
              accept="image/png,image/jpeg"
              onChange={handleFileChange}
            />
          </div>

          {preview ? (
            <div className="mt-4">
              <Label>Vista previa:</Label>
              <img
                src={preview}
                alt="Vista previa del mapa"
                className="rounded-lg border mt-2 w-full object-cover"
              />
            </div>
          ) : (
            <div className="mt-4 p-6 text-center border-2 border-dashed rounded-lg text-muted-foreground">
              <ImagePlus className="w-10 h-10 mx-auto mb-2 opacity-60" />
              <p className="text-sm">Selecciona un archivo para previsualizarlo aquí.</p>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4">
            <Button variant="outline" onClick={handleCancel} disabled={loading}>
              Cancelar
            </Button>
            <Button
              onClick={handleUpload}
              disabled={!file || loading}
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Subiendo...
                </>
              ) : (
                <>
                  <UploadCloud className="w-4 h-4 mr-2" />
                  Subir mapa
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
