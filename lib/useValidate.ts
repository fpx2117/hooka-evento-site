// hooks/useValidate.ts
"use client";
import { useMutation, useQuery } from "@tanstack/react-query";
import { getTicketByCode, validateTicket } from "@/lib/api";

export function useLookupTicket(code?: string) {
  return useQuery({
    queryKey: ["ticket-lookup", code],
    queryFn: () => getTicketByCode(code!),
    enabled: !!code && code.length === 6,
    retry: 1,
  });
}

export function useValidateTicket() {
  return useMutation({
    mutationKey: ["ticket-validate"],
    mutationFn: (code: string) => validateTicket(code),
    retry: 0, // si querés reintentar, poné 1-2
  });
}
