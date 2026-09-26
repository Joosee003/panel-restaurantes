import { useMemo, useState } from "react";
import styles from "./crm.module.css";

type Reservation = { id: string; fecha_hora_reserva: string | null; personas: number | null; estado: string | null; turno: string | null; origen: string | null; notas: string | null; atendida: boolean | null; resena_solicitada: boolean | null };
type Movement = { id: string; tipo: string | null; puntos: number | null; referencia: string | null; nota: string | null; creado_en: string | null };
type Notification = { id: string; tipo: string | null; titulo: string | null; mensaje: string | null; leida: boolean | null; created_at: string | null };
type Event = { kind: "reserva"; date: string | null; value: Reservation } | { kind: "puntos"; date: string | null; value: Movement } | { kind: "accion"; date: string | null; value: Notification };

function timestamp(date: string | null) {
  const parsed = date ? new Date(date).getTime() : Number.NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Merges only the already-loaded records for display; no inferred visits or review events. */
export function CustomerTimeline({ reservas, movimientos, notificaciones, fidelizacionActiva }: {
  reservas: Reservation[];
  movimientos: Movement[];
  notificaciones: Notification[];
  fidelizacionActiva: boolean;
}) {
  const [filter, setFilter] = useState<"todo" | Event["kind"]>("todo");
  const events = useMemo(() => {
    const all: Event[] = [
      ...reservas.map((value): Event => ({ kind: "reserva", date: value.fecha_hora_reserva, value })),
      ...(fidelizacionActiva ? movimientos.map((value): Event => ({ kind: "puntos", date: value.creado_en, value })) : []),
      ...notificaciones.map((value): Event => ({ kind: "accion", date: value.created_at, value })),
    ];
    return all.sort((a, b) => timestamp(b.date) - timestamp(a.date));
  }, [reservas, movimientos, notificaciones, fidelizacionActiva]);
  const visible = events.filter((event) => filter === "todo" || event.kind === filter);

  return <section className={styles.timelineArea} aria-label="Cronología del cliente">
    <header className={styles.sectionHeading}><h2>La relación, visita a visita</h2><span>Últimos registros disponibles de cada historial</span></header>
    <div className={styles.filters} style={{ marginBottom: 26 }} aria-label="Filtrar cronología">
      <button className={styles.filter} aria-pressed={filter === "todo"} onClick={() => setFilter("todo")}>Todo <small>{events.length}</small></button>
      <button className={styles.filter} aria-pressed={filter === "reserva"} onClick={() => setFilter("reserva")}>Reservas <small>{reservas.length}</small></button>
      {fidelizacionActiva && <button className={styles.filter} aria-pressed={filter === "puntos"} onClick={() => setFilter("puntos")}>Puntos <small>{movimientos.length}</small></button>}
      <button className={styles.filter} aria-pressed={filter === "accion"} onClick={() => setFilter("accion")}>Acciones <small>{notificaciones.length}</small></button>
    </div>
    {visible.length === 0 ? <div className={styles.empty}><strong>Sin actividad en este historial.</strong>Los registros aparecerán aquí cuando existan.</div> : <ol className={styles.timeline}>
      {visible.map((event) => <li className={styles.event} data-kind={event.kind} key={`${event.kind}-${event.value.id}`}>
        <div className={styles.eventTime}>{timestamp(event.date) ? <time dateTime={event.date!}>{new Date(event.date!).toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" })}<span>{new Date(event.date!).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}</span></time> : "Sin fecha"}</div>
        <div className={styles.eventBody}>
          {event.kind === "reserva" && <>
            <div className={styles.eventTitle}><h3>Reserva · {Number(event.value.personas || 0)} personas</h3><span>{event.value.estado || "Sin estado"}</span></div>
            <div className={styles.eventContext}><span className={event.value.atendida === true ? styles.positive : event.value.atendida === false ? styles.negative : ""}>{event.value.atendida === true ? "Vino" : event.value.atendida === false ? "No show" : "Sin marcar"}</span>{event.value.turno && <span>{event.value.turno}</span>}{event.value.origen && <span>{event.value.origen}</span>}<span>Reseña: {event.value.resena_solicitada ? "pedida" : "no"}</span></div>
            {event.value.notas && <p className={styles.eventNote}>{event.value.notas}</p>}
          </>}
          {event.kind === "puntos" && <>
            <div className={styles.eventTitle}><h3>{event.value.tipo || "Movimiento de puntos"}</h3><span className={Number(event.value.puntos || 0) >= 0 ? styles.positive : styles.negative}>{Number(event.value.puntos || 0) > 0 ? "+" : ""}{Number(event.value.puntos || 0)} puntos</span></div>
            {event.value.nota && <p>{event.value.nota}</p>}
          </>}
          {event.kind === "accion" && <>
            <div className={styles.eventTitle}><h3>{event.value.titulo || event.value.tipo || "Acción guardada"}</h3><span className={styles.quiet}>Acción guardada</span></div>
            {event.value.mensaje && <p>{event.value.mensaje}</p>}
          </>}
        </div>
      </li>)}
    </ol>}
  </section>;
}
