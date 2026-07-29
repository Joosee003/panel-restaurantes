export type DashboardTab =
  | "resumen"
  | "opiniones"
  | "insights"
  | "materiales"
  | "ajustes";

export type OpinionStatus = "nueva" | "revisada" | "respondida";
export type FollowUpStatus = "pendiente" | "en_revision" | "resuelto";
export type AlertStatus = "pendiente" | "enviada" | "descartada";
export type OriginKey =
  | "mesa"
  | "caja"
  | "entrada"
  | "portacuentas"
  | "redes"
  | "desconocido";
export type AspectKey =
  | "comida"
  | "servicio"
  | "ambiente"
  | "espera"
  | "limpieza"
  | "calidad_precio";

export type OpinionConfig = {
  id: string;
  restaurante_id: string;
  slug: string;
  google_review_url: string;
  logo_url: string | null;
  color_primary: string;
  color_secondary: string;
  color_background: string;
  headline: string;
  subheadline: string;
  feedback_email: string | null;
  feedback_whatsapp: string | null;
  auto_open_google: boolean;
  google_delay_ms: number;
  low_rating_threshold: number;
  contact_prompt_enabled: boolean;
  aspect_labels?: Partial<Record<AspectKey, string>>;
  seo_keywords?: string[];
  active: boolean;
};

export type Restaurant = {
  id: string;
  nombre: string;
};

export type Opinion = {
  id: string;
  restaurante_id: string;
  rating: number;
  comentario: string | null;
  nombre_cliente: string | null;
  origen: OriginKey;
  estado: OpinionStatus;
  aspectos: AspectKey[];
  contacto: string | null;
  contacto_tipo: "telefono" | "email" | "ninguno";
  solicita_contacto: boolean;
  seguimiento: FollowUpStatus;
  nota_interna: string | null;
  resuelto_at: string | null;
  google_abierto: boolean;
  google_abierto_at: string | null;
  created_at: string;
  updated_at: string;
};

export type OpinionEvent = {
  id: string;
  restaurante_id: string;
  submission_token: string | null;
  event_type:
    | "view"
    | "rating_selected"
    | "details_opened"
    | "submitted"
    | "copy_succeeded"
    | "copy_failed"
    | "google_opened"
    | "returned_from_google";
  origen: OriginKey;
  rating: number | null;
  created_at: string;
};

export type OpinionAlert = {
  id: string;
  restaurante_id: string;
  opinion_id: string;
  tipo: "valoracion_baja" | "seguimiento_solicitado";
  estado: AlertStatus;
  destino_email: string | null;
  destino_whatsapp: string | null;
  payload: Record<string, unknown>;
  created_at: string;
  sent_at: string | null;
  dismissed_at: string | null;
};

export const originLabels: Record<OriginKey, string> = {
  mesa: "Mesa",
  caja: "Caja",
  entrada: "Entrada",
  portacuentas: "Portacuentas",
  redes: "Redes",
  desconocido: "Sin identificar",
};

export const aspectLabels: Record<AspectKey, string> = {
  comida: "Comida",
  servicio: "Servicio",
  ambiente: "Ambiente",
  espera: "Tiempo de espera",
  limpieza: "Limpieza",
  calidad_precio: "Calidad-precio",
};
