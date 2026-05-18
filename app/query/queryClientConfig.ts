import type { DefaultOptions } from "@tanstack/react-query";

export const queryClientConfig: DefaultOptions = {
  queries: {
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    retry: 1,
  },
  mutations: {
    retry: 0,
  },
};