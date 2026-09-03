export type RestaurantModules = {
  reservas: boolean;
  clientes: boolean;
  resenas: boolean;
  fidelizacion: boolean;
  metricas: boolean;
  rentabilidad: boolean;
  chatbot: boolean;
  camarero_digital: boolean;
  menu_digital: boolean;
  automatizaciones: boolean;
};

export type RestaurantModuleKey = keyof RestaurantModules;

export const restaurantModuleColumns =
  "reservas, clientes, resenas, fidelizacion, metricas, rentabilidad, chatbot, camarero_digital, menu_digital, automatizaciones";

export const defaultRestaurantModules: RestaurantModules = {
  reservas: true,
  clientes: true,
  resenas: false,
  fidelizacion: false,
  metricas: false,
  rentabilidad: false,
  chatbot: false,
  camarero_digital: false,
  menu_digital: false,
  automatizaciones: false,
};

export function parseRestaurantModules(
  row: Partial<Record<RestaurantModuleKey, unknown>> | null | undefined,
): RestaurantModules {
  if (!row) return defaultRestaurantModules;

  return {
    reservas: Boolean(row.reservas),
    clientes: Boolean(row.clientes),
    resenas: Boolean(row.resenas),
    fidelizacion: Boolean(row.fidelizacion),
    metricas: Boolean(row.metricas),
    rentabilidad: Boolean(row.rentabilidad),
    chatbot: Boolean(row.chatbot),
    camarero_digital: Boolean(row.camarero_digital),
    menu_digital: Boolean(row.menu_digital),
    automatizaciones: Boolean(row.automatizaciones),
  };
}

type RequiredModule = {
  key: RestaurantModuleKey;
  label: string;
};

const protectedRoutes: Array<RequiredModule & { paths: string[] }> = [
  { key: "reservas", label: "Reservas", paths: ["/reservas", "/sala"] },
  { key: "clientes", label: "Clientes", paths: ["/clientes"] },
  { key: "resenas", label: "Reseñas", paths: ["/resenas"] },
  { key: "metricas", label: "Métricas", paths: ["/estadisticas"] },
  {
    key: "rentabilidad",
    label: "Rentabilidad",
    paths: ["/dashboard/rentabilidad"],
  },
  {
    key: "fidelizacion",
    label: "Fidelización",
    paths: ["/dashboard/fidelizacion"],
  },
  {
    key: "menu_digital",
    label: "Carta QR",
    paths: ["/panel/carta-productos", "/panel/menu-dia"],
  },
  {
    key: "camarero_digital",
    label: "Camarero digital",
    paths: ["/panel/qr-mesas", "/panel/pedidos-qr"],
  },
];

export function requiredModuleForPath(pathname: string): RequiredModule | null {
  for (const route of protectedRoutes) {
    if (
      route.paths.some(
        (path) => pathname === path || pathname.startsWith(`${path}/`),
      )
    ) {
      return { key: route.key, label: route.label };
    }
  }

  return null;
}
