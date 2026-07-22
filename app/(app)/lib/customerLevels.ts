export type CustomerLevel = "nuevo" | "frecuente" | "habitual" | "vip" | "maestro";

export type CustomerLevelsConfig = {
  nivel_frecuente_desde: number;
  nivel_habitual_desde: number;
  nivel_vip_desde: number;
  nivel_maestro_desde: number;
};

export type CustomerMetrics = {
  visitas_totales?: number | null;
  visitas_reales?: number | null;
  visitas_historial?: number | null;
  total_atendidas?: number | null;
  puntos_totales?: number | null;
  puntos_disponibles?: number | null;
};

export type CustomerLevelDefinition = {
  label: string;
  shortLabel: string;
  range: string;
  description: string;
  multiplier: string;
  min: number;
  next: number | null;
};

export const DEFAULT_CUSTOMER_LEVELS: CustomerLevelsConfig = {
  nivel_frecuente_desde: 2,
  nivel_habitual_desde: 5,
  nivel_vip_desde: 10,
  nivel_maestro_desde: 20,
};

function finiteInteger(value: unknown, fallback: number) {
  const parsed = Math.floor(Number(value));
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function normalizeCustomerLevels(
  input?: Partial<CustomerLevelsConfig> | null,
): CustomerLevelsConfig {
  const frequent = Math.max(
    1,
    finiteInteger(input?.nivel_frecuente_desde, DEFAULT_CUSTOMER_LEVELS.nivel_frecuente_desde),
  );
  const regular = Math.max(
    frequent + 1,
    finiteInteger(input?.nivel_habitual_desde, DEFAULT_CUSTOMER_LEVELS.nivel_habitual_desde),
  );
  const vip = Math.max(
    regular + 1,
    finiteInteger(input?.nivel_vip_desde, DEFAULT_CUSTOMER_LEVELS.nivel_vip_desde),
  );
  const master = Math.max(
    vip + 1,
    finiteInteger(input?.nivel_maestro_desde, DEFAULT_CUSTOMER_LEVELS.nivel_maestro_desde),
  );

  return {
    nivel_frecuente_desde: frequent,
    nivel_habitual_desde: regular,
    nivel_vip_desde: vip,
    nivel_maestro_desde: master,
  };
}

export function buildCustomerLevels(
  input: CustomerLevelsConfig = DEFAULT_CUSTOMER_LEVELS,
): Record<CustomerLevel, CustomerLevelDefinition> {
  const config = normalizeCustomerLevels(input);
  const frequent = config.nivel_frecuente_desde;
  const regular = config.nivel_habitual_desde;
  const vip = config.nivel_vip_desde;
  const master = config.nivel_maestro_desde;

  return {
    nuevo: {
      label: "Nuevo",
      shortLabel: "Nuevo",
      range: `0-${Math.max(frequent - 1, 0)} visitas`,
      description: "Acaba de llegar. El siguiente objetivo es conseguir su primera repetición.",
      multiplier: "x1",
      min: 0,
      next: frequent,
    },
    frecuente: {
      label: "Frecuente",
      shortLabel: "Frecuente",
      range: `${frequent}-${regular - 1} visitas`,
      description: "Ya ha repetido y empieza a crear hábito con el restaurante.",
      multiplier: "x1,2",
      min: frequent,
      next: regular,
    },
    habitual: {
      label: "Habitual",
      shortLabel: "Habitual",
      range: `${regular}-${vip - 1} visitas`,
      description: "Cliente consolidado. Es buen momento para ofrecer ventajas relevantes.",
      multiplier: "x1,5",
      min: regular,
      next: vip,
    },
    vip: {
      label: "VIP",
      shortLabel: "VIP",
      range: `${vip}-${master - 1} visitas`,
      description: "Cliente de alto valor que merece reconocimiento y atención preferente.",
      multiplier: "x2",
      min: vip,
      next: master,
    },
    maestro: {
      label: "Maestro",
      shortLabel: "Maestro",
      range: `${master}+ visitas`,
      description: "La máxima categoría: uno de los clientes más fieles del restaurante.",
      multiplier: "x2,5",
      min: master,
      next: null,
    },
  };
}

export function getCustomerVisits(customer: CustomerMetrics) {
  return Math.max(
    Number(customer.visitas_reales || 0),
    Number(customer.visitas_totales || 0),
    Number(customer.visitas_historial || 0),
    Number(customer.total_atendidas || 0),
  );
}

export function getCustomerPoints(customer: CustomerMetrics) {
  return Number(customer.puntos_disponibles ?? customer.puntos_totales ?? 0);
}

export function getCustomerLevel(
  customer: CustomerMetrics,
  input: CustomerLevelsConfig = DEFAULT_CUSTOMER_LEVELS,
): CustomerLevel {
  const visits = getCustomerVisits(customer);
  const config = normalizeCustomerLevels(input);

  if (visits >= config.nivel_maestro_desde) return "maestro";
  if (visits >= config.nivel_vip_desde) return "vip";
  if (visits >= config.nivel_habitual_desde) return "habitual";
  if (visits >= config.nivel_frecuente_desde) return "frecuente";
  return "nuevo";
}

export function getCustomerLevelProgress(
  customer: CustomerMetrics,
  input: CustomerLevelsConfig = DEFAULT_CUSTOMER_LEVELS,
) {
  const visits = getCustomerVisits(customer);
  const levels = buildCustomerLevels(input);
  const level = getCustomerLevel(customer, input);
  const definition = levels[level];

  if (definition.next === null) return 100;
  const width = ((visits - definition.min) / (definition.next - definition.min)) * 100;
  return Math.max(6, Math.min(100, width));
}

export function getNextCustomerLevelText(
  customer: CustomerMetrics,
  input: CustomerLevelsConfig = DEFAULT_CUSTOMER_LEVELS,
) {
  const visits = getCustomerVisits(customer);
  const levels = buildCustomerLevels(input);
  const level = getCustomerLevel(customer, input);
  const definition = levels[level];

  if (definition.next === null) return "Nivel máximo desbloqueado";

  const nextLevel = (Object.keys(levels) as CustomerLevel[]).find(
    (key) => levels[key].min === definition.next,
  );
  const missing = Math.max(definition.next - visits, 0);
  const label = nextLevel ? levels[nextLevel].label : "el siguiente nivel";

  return missing === 1
    ? `1 visita más para ser ${label}`
    : `${missing} visitas más para ser ${label}`;
}
