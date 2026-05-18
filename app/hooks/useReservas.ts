"use client";

import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "../query/queryKeys";
import {
  getConfigPuntosByRestaurante,
  getReservasByRestaurante,
} from "../services/reservas.service";

export function useReservas(params: {
  restauranteId?: string | null;
  desde: string;
  hasta: string;
}) {
  const { restauranteId, desde, hasta } = params;

  return useQuery({
    queryKey: restauranteId
      ? queryKeys.reservas.byRange(restauranteId, desde, hasta)
      : queryKeys.reservas.all,
    queryFn: () =>
      getReservasByRestaurante({
        restauranteId: restauranteId as string,
        desde,
        hasta,
      }),
    enabled: Boolean(restauranteId && desde && hasta),
    staleTime: 30_000,
  });
}

export function useConfigPuntos(restauranteId?: string | null) {
  return useQuery({
    queryKey: restauranteId
      ? queryKeys.fidelizacion.config(restauranteId)
      : queryKeys.fidelizacion.all,
    queryFn: () => getConfigPuntosByRestaurante(restauranteId as string),
    enabled: Boolean(restauranteId),
    staleTime: 60_000,
  });
}