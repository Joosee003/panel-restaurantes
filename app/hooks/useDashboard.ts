"use client";

import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "../query/queryKeys";
import { getDashboardStats } from "../services/dashboard.service";

export function useDashboardStats(restauranteId?: string | null) {
  return useQuery({
    queryKey: restauranteId
      ? queryKeys.dashboard.stats(restauranteId)
      : queryKeys.dashboard.all,
    queryFn: () => getDashboardStats(restauranteId as string),
    enabled: Boolean(restauranteId),
    staleTime: 30_000,
  });
}