"use client";

import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "../query/queryKeys";
import { getCurrentRestaurante } from "../services/restaurante.service";

export function useRestaurante() {
  return useQuery({
    queryKey: queryKeys.restaurante.all,
    queryFn: getCurrentRestaurante,
    staleTime: 60_000,
  });
}