"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { useServiceClock } from "../components/product/ServiceClock";
import { groupServiceArrivals, type ServiceArrival } from "./service-agenda";
import styles from "./service-board.module.css";

const time = (value: string | null) => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleTimeString("es-ES", { timeZone: "Europe/Madrid", hour: "2-digit", minute: "2-digit" }) : "—";

function ArrivalRows({ rows }: { rows: ServiceArrival[] }) {
  return <ol className={styles.agenda}>
    {rows.map(item => <li key={item.id}>
      <Link href="/reservas" className={styles.agendaRow}>
        <time dateTime={item.fecha_hora_reserva ?? undefined}>{time(item.fecha_hora_reserva)}</time>
        <strong title={item.nombre_cliente || "Cliente"}>{item.nombre_cliente || "Cliente"}</strong>
        <span className={styles.party}>{item.personas || 0}<span> personas</span></span>
        <span className={styles.reservationState} data-state={item.estado || "nuevo"}>{item.estado || "nuevo"}</span>
        <ArrowUpRight size={15} aria-hidden="true" />
      </Link>
    </li>)}
  </ol>;
}

export default function ServiceArrivals({ reservations, loading }: { reservations: ServiceArrival[]; loading: boolean }) {
  const now = useServiceClock();
  const groups = groupServiceArrivals(reservations, now);
  return (
    <section className={styles.arrivals} aria-labelledby="service-arrivals-title">
      <div className={styles.sectionHeading}>
        <div><span className={styles.kicker}>Agenda del restaurante</span><h2 id="service-arrivals-title">El servicio, ahora <small>{loading ? "…" : `${reservations.length} reservas hoy`}</small></h2></div>
        <Link href="/reservas">Abrir agenda <ArrowUpRight size={15} /></Link>
      </div>
      {loading ? <div role="status" className={styles.loadingRows}>{Array.from({ length: 7 }, (_, index) => <div key={index} />)}<span className="sr-only">Cargando reservas</span></div> : reservations.length ? <>
        <div className={styles.agendaHeader} aria-hidden="true"><span>Hora</span><span>Cliente</span><span>Personas</span><span>Estado</span><span /></div>
        <section className={styles.currentGroup} aria-label="Reservas de la franja actual">
          <div className={styles.groupHeading}><h3><span className={styles.liveDot} />Ahora <span>{groups.current.length}</span></h3><small>Hora prevista · últimos 90 min</small></div>
          {groups.current.length ? <ArrivalRows rows={groups.current} /> : <p className={styles.groupEmpty}>Sin reservas abiertas con hora prevista en esta franja.</p>}
        </section>
        <section className={styles.upcomingGroup} aria-label="Próximas llegadas">
          <div className={styles.groupHeading}><h3>Próximos 90 min <span>{groups.next.length}</span></h3><small>{now ? `${time(now.toISOString())} — ${time(new Date(now.getTime() + 90 * 60_000).toISOString())}` : "Según hora prevista"}</small></div>
          {groups.next.length ? <ArrivalRows rows={groups.next} /> : <p className={styles.groupEmpty}>Sin próximas llegadas en los siguientes 90 minutos.</p>}
        </section>
        {groups.earlier.length ? <details className={`${styles.agendaDisclosure} ${styles.earlierGroup}`}>
          <summary><span>Antes de esta franja <b>{groups.earlier.length}</b></span><small>Sin estado de cierre</small></summary>
          <p className={styles.disclosureNote}>Conservan su estado registrado. La hora prevista no confirma asistencia ni retraso.</p>
          <ArrivalRows rows={groups.earlier} />
        </details> : null}
        {groups.later.length ? <details className={styles.agendaDisclosure} open={!now}>
          <summary><span>{now ? "Después" : "Agenda del día"} <b>{groups.later.length}</b></span><small>Consultar horarios</small></summary>
          <ArrivalRows rows={groups.later} />
        </details> : null}
        {groups.finished.length ? <details className={styles.agendaDisclosure}>
          <summary><span>Completadas y bajas <b>{groups.finished.length}</b></span><small>Consultar registro</small></summary>
          <ArrivalRows rows={groups.finished} />
        </details> : null}
        {groups.undated.length ? <details className={styles.agendaDisclosure} open>
          <summary><span>Sin hora válida <b>{groups.undated.length}</b></span><small>Revisar en agenda</small></summary>
          <ArrivalRows rows={groups.undated} />
        </details> : null}
      </> : <div className={styles.empty}><h3>El día está por escribir.</h3><p>Aquí aparecerán las reservas del restaurante, por hora.</p><Link href="/reservas">Gestionar reservas <ArrowUpRight size={15} /></Link></div>}
    </section>
  );
}
