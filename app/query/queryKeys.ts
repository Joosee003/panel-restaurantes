export const queryKeys = {
  restaurante: {
    all: ["restaurante"] as const,
    byUser: (userId: string) => ["restaurante", "user", userId] as const,
    byId: (restauranteId: string) => ["restaurante", restauranteId] as const,
  },

  dashboard: {
    all: ["dashboard"] as const,
    stats: (restauranteId: string) =>
      ["dashboard", "stats", restauranteId] as const,
  },

  reservas: {
    all: ["reservas"] as const,
    byRestaurante: (restauranteId: string) =>
      ["reservas", restauranteId] as const,
    byRange: (restauranteId: string, desde: string, hasta: string) =>
      ["reservas", restauranteId, desde, hasta] as const,
  },

  clientes: {
    all: ["clientes"] as const,
    byRestaurante: (restauranteId: string) =>
      ["clientes", restauranteId] as const,
  },

  resenas: {
    all: ["resenas"] as const,
    byRestaurante: (restauranteId: string) =>
      ["resenas", restauranteId] as const,
  },

  fidelizacion: {
    all: ["fidelizacion"] as const,
    config: (restauranteId: string) =>
      ["fidelizacion", "config", restauranteId] as const,
    premios: (restauranteId: string) =>
      ["fidelizacion", "premios", restauranteId] as const,
  },

  ocupacion: {
    all: ["ocupacion"] as const,
    byDate: (restauranteId: string, fecha: string) =>
      ["ocupacion", restauranteId, fecha] as const,
  },
};