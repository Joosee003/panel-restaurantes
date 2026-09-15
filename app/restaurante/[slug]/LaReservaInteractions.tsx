"use client";

import { useState } from "react";
import { ArrowUpRight, Menu, X } from "lucide-react";
import type { PublicRestaurant } from "../../lib/publicRestaurant";
import styles from "./la-reserva.module.css";

export function ReservaHeader({ name, bookingEnabled }: { name: string; bookingEnabled: boolean }) {
  const [open, setOpen] = useState(false);
  return <header className={styles.header}>
    <a className={styles.brand} href="#" onClick={() => setOpen(false)}>{name}<span>RESTAURANTE</span></a>
    <nav className={styles.desktopNav} aria-label="Navegación principal"><a href="#la-casa">La casa</a><a href="#carta">La carta</a>{bookingEnabled ? <a href="#reservar">Tu mesa</a> : null}</nav>
    {bookingEnabled ? <a href="#reservar" className={styles.headerBooking}>RESERVAR <ArrowUpRight size={17} aria-hidden="true" /></a> : null}
    <button className={styles.menuToggle} type="button" onClick={() => setOpen(!open)} aria-label={open ? "Cerrar menú" : "Abrir menú"} aria-expanded={open} aria-controls="reserva-mobile-nav">{open ? <X /> : <Menu />}</button>
    {open ? <nav id="reserva-mobile-nav" className={styles.mobileNav} aria-label="Navegación móvil" onKeyDown={(event) => { if (event.key === "Escape") setOpen(false); }}><a href="#la-casa" onClick={() => setOpen(false)}>La casa</a><a href="#carta" onClick={() => setOpen(false)}>La carta</a>{bookingEnabled ? <a href="#reservar" onClick={() => setOpen(false)}>Tu mesa ↗</a> : null}</nav> : null}
  </header>;
}

export function ReservaMenu({ sections }: { sections: PublicRestaurant["menu"]["sections"] }) {
  const [selected, setSelected] = useState(0);
  const current = sections[selected] || sections[0];
  if (!current) return <p className={styles.emptyMenu}>Estamos preparando la carta. Vuelve a consultar en un momento.</p>;
  return <div className={styles.menu}>
    <div className={styles.menuTabs} role="tablist" aria-label="Categorías de la carta">{sections.map((section, index) => <button type="button" key={section.title} role="tab" id={`menu-tab-${index}`} aria-controls="menu-panel" aria-selected={index === selected} tabIndex={index === selected ? 0 : -1} className={index === selected ? styles.activeTab : ""} onClick={() => setSelected(index)} onKeyDown={(event) => {
      let next = index;
      if (event.key === "ArrowRight") next = (index + 1) % sections.length;
      else if (event.key === "ArrowLeft") next = (index - 1 + sections.length) % sections.length;
      else if (event.key === "Home") next = 0;
      else if (event.key === "End") next = sections.length - 1;
      else return;
      event.preventDefault(); setSelected(next); document.getElementById(`menu-tab-${next}`)?.focus();
    }}><span>0{index + 1}</span>{section.title}</button>)}</div>
    <div className={styles.menuGrid} role="tabpanel" id="menu-panel" aria-labelledby={`menu-tab-${selected}`} tabIndex={0}>{current.items.map((item) => <article className={styles.menuItem} key={item.name}><div><h3>{item.name}</h3><p>{item.description}</p>{item.recommended ? <span className={styles.recommended}>DE LOS FAVORITOS</span> : null}</div><span className={styles.price}>{item.price == null ? "Consultar" : new Intl.NumberFormat("es-ES",{style:"currency",currency:"EUR"}).format(item.price)}</span></article>)}</div>
  </div>;
}
