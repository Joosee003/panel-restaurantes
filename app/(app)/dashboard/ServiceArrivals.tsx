"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { useServiceClock } from "../components/product/ServiceClock";
import styles from "./service-board.module.css";

type Arrival = { id: string; nombre_cliente: string | null; personas: number | null; estado: string | null; fecha_hora_reserva: string | null };

const time = (value: string | null) => value ? new Date(value).toLocaleTimeString("es-ES", { timeZone: "Europe/Madrid", hour: "2-digit", minute: "2-digit" }) : "—";

export default function ServiceArrivals({ reservations, loading }: { reservations: Arrival[]; loading: boolean }) {
  const now = useServiceClock();
  const upcoming = reservations.filter((item) => {
    const difference = item.fecha_hora_reserva && now ? new Date(item.fecha_hora_reserva).getTime() - now.getTime() : -1;
    return difference >= 0 && difference <= 3600000 && !["cancelada", "no-show"].includes(item.estado || "");
  });
  return (
    <section className={styles.arrivals} aria-labelledby="service-arrivals-title">
      <div className={styles.sectionHeading}>
        <div><span className={styles.kicker}>Agenda del restaurante</span><h2 id="service-arrivals-title">Las reservas de hoy <small>{loading ? "…" : reservations.length}</small></h2></div>
        <Link href="/reservas">Abrir agenda <ArrowUpRight size={15} /></Link>
      </div>
      <div className={styles.nextHour}>
        <div className={styles.nextHourLabel}><span className={styles.liveDot} />Reservas · próxima hora</div>
        <div className={styles.nextHourItems}>
          {loading ? <span>Cargando reservas…</span> : upcoming.length ? upcoming.map((item) => (
            <Link href="/reservas" key={item.id}><time>{time(item.fecha_hora_reserva)}</time><span>{item.nombre_cliente || "Cliente"}</span><small>{item.personas || 0} p.</small></Link>
          )) : <span className={styles.muted}>Sin reservas previstas en los próximos 60 minutos.</span>}
        </div>
      </div>
      <div className={styles.agendaHeader} aria-hidden="true"><span>Hora</span><span>Cliente</span><span>Personas</span><span>Estado</span><span /></div>
      {loading ? <div role="status" className={styles.loadingRows}>{Array.from({ length: 7 }, (_, index) => <div key={index} />)}<span className="sr-only">Cargando reservas</span></div> : reservations.length ? (
        <ol className={styles.agenda}>
          {reservations.map((item, index) => {
            const date = item.fecha_hora_reserva ? new Date(item.fecha_hora_reserva) : null;
            const following = date && now && date >= now;
            const firstFollowing = following && !reservations.slice(0, index).some((previous) => previous.fecha_hora_reserva && new Date(previous.fecha_hora_reserva) >= now!);
            return (
              <li key={item.id}>
                {firstFollowing ? <div className={styles.nowDivider}><span>Ahora · {time(now!.toISOString())}</span></div> : null}
                <Link href="/reservas" className={`${styles.agendaRow} ${following ? styles.following : ""}`}>
                  <time dateTime={item.fecha_hora_reserva ?? undefined}>{time(item.fecha_hora_reserva)}</time>
                  <strong>{item.nombre_cliente || "Cliente"}</strong>
                  <span className={styles.party}>{item.personas || 0}<span> personas</span></span>
                  <span className={styles.reservationState} data-state={item.estado || "nuevo"}>{item.estado || "nuevo"}</span>
                  <ArrowUpRight size={15} aria-hidden="true" />
                </Link>
              </li>
            );
          })}
        </ol>
      ) : <div className={styles.empty}><h3>El día está por escribir.</h3><p>Aquí aparecerán las reservas del restaurante, por hora.</p><Link href="/reservas">Gestionar reservas <ArrowUpRight size={15} /></Link></div>}
    </section>
  );
}
