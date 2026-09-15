type Modules = Record<string, unknown>;
export const panelServiceKeys = [
  "reservas",
  "clientes",
  "resenas",
  "fidelizacion",
  "metricas",
  "rentabilidad",
  "chatbot",
  "camarero_digital",
  "menu_digital",
  "automatizaciones",
];
export function hasPanelServices(modules: Modules | null | undefined) {
  return Boolean(
    modules && panelServiceKeys.some((key) => modules[key] === true),
  );
}
