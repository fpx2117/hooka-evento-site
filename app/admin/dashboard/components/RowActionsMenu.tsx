"use client";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CheckCircle, Edit, Mail, MoreVertical, Trash2 } from "lucide-react";

export default function RowActionsMenu({
  onApprove,
  onSendEmail,
  onEdit,
  onDelete,
  canApprove,
  canEmail,
  sending,
}: {
  onApprove: () => void;
  onSendEmail: () => void;
  onEdit: () => void;
  onDelete: () => void;
  canApprove: boolean;
  canEmail: boolean;
  sending: boolean;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="outline" className="sm:hidden">
          <MoreVertical className="w-4 h-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {canApprove && (
          <DropdownMenuItem onClick={onApprove} className="gap-2">
            <CheckCircle className="w-4 h-4" /> Aprobar
          </DropdownMenuItem>
        )}
        {canEmail && (
          <DropdownMenuItem onClick={onSendEmail} className="gap-2">
            <Mail className="w-4 h-4" /> {sending ? "Enviando…" : "Enviar mail"}
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={onEdit} className="gap-2">
          <Edit className="w-4 h-4" /> Editar
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onDelete} className="gap-2 text-red-600">
          <Trash2 className="w-4 h-4" /> Eliminar
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
