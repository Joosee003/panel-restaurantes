"use client";

import Image from "next/image";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, ArrowUpRight, Menu, Plus, Utensils, X, ZoomIn } from "lucide-react";
import type { PublicRestaurant } from "../../lib/publicRestaurant";
import styles from "./la-reserva.module.css";

const BookingContext = createContext<() => void>(() => {});
type Dish = PublicRestaurant["menu"]["sections"][number]["items"][number];
const price = (value: number | null) => value == null ? "Consultar" : new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(value);

export function TableSignature() {
  return <svg className={styles.tableSignature} viewBox="0 0 48 34" width="42" height="30" fill="none" aria-hidden="true"><path d="M16 27C-3 23-2 4 24 4S51 23 32 27" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /><circle className={styles.tableSeat} cx="24" cy="27" r="3" fill="currentColor" /></svg>;
}

export function ReservaShell({ children, booking, bookingEnabled }: { children: ReactNode; booking: ReactNode; bookingEnabled: boolean }) {
  const root = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const [visited, setVisited] = useState(false);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        entry.target.animate([{ opacity: 0, transform: "translateY(28px)" }, { opacity: 1, transform: "translateY(0)" }], { duration: 750, easing: "cubic-bezier(.16,1,.3,1)" });
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.12 });
    root.current?.querySelectorAll("[data-reveal]").forEach(el => observer.observe(el));
    return () => observer.disconnect();
  }, []);
  function openBooking() {
    if (!bookingEnabled) return;
    setVisited(true);
    dialog.current?.showModal();
  }
  return <BookingContext.Provider value={openBooking}><div className={styles.site} ref={root}>
    {children}
    <div className={styles.mobileBar}><a href="#carta">Ver carta</a>{bookingEnabled ? <ReserveButton>Reservar mesa <TableSignature /></ReserveButton> : null}</div>
    <dialog ref={dialog} className={`${styles.dialog} ${styles.bookingDialog}`} aria-labelledby="booking-dialog-title" onClick={event => { if (event.target === event.currentTarget) dialog.current?.close(); }}>
      <div className={styles.drawerTop}><div><span>LA RESERVA · TU SITIO EN LA MESA</span><h2 id="booking-dialog-title">El plan empieza aquí.</h2></div><button className={styles.closeButton} type="button" aria-label="Cerrar reserva" onClick={() => dialog.current?.close()}><X size={23} /></button></div>
      <div className={styles.drawerSignature}><TableSignature /><span>Elige con quién, cuándo y a qué hora.</span></div><div className={styles.bookingWidget}>{visited ? booking : null}</div>
    </dialog>
  </div></BookingContext.Provider>;
}

export function ReserveButton({ children, className }: { children: ReactNode; className?: string }) {
  const openBooking = useContext(BookingContext);
  return <button type="button" className={className} onClick={openBooking}>{children}</button>;
}

export function ReservaHeader({ name, bookingEnabled }: { name: string; bookingEnabled: boolean }) {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [active, setActive] = useState("");
  const toggle = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const marker = document.querySelector("#reserva-title");
    const headerObserver = new IntersectionObserver(entries => setScrolled(!entries[0].isIntersecting), { rootMargin: "-50px 0px 0px 0px" });
    if (marker) headerObserver.observe(marker);
    const sections = new IntersectionObserver(entries => {
      entries.forEach(entry => { if (entry.isIntersecting) setActive(entry.target.id); });
    }, { rootMargin: "-20% 0px -55% 0px" });
    document.querySelectorAll("#la-casa,#carta,#el-ambiente,#reservar").forEach(el => sections.observe(el));
    return () => { headerObserver.disconnect(); sections.disconnect(); };
  }, []);
  const links = [{ id: "la-casa", label: "La casa" }, { id: "carta", label: "La carta" }, { id: "el-ambiente", label: "El ambiente" }];
  return <header className={`${styles.header} ${scrolled || open ? styles.headerSolid : ""}`}>
    <a className={styles.brand} href="#contenido" onClick={() => setOpen(false)} aria-label={`${name}, inicio`}>La Reserva<span>COCINA & SOBREMESA</span></a>
    <nav className={styles.desktopNav} aria-label="Navegación principal">{links.map(link => <a key={link.id} href={`#${link.id}`} aria-current={active === link.id ? "location" : undefined}>{link.label}</a>)}</nav>
    {bookingEnabled ? <ReserveButton className={styles.headerBooking}>Reservar <TableSignature /></ReserveButton> : null}
    <button ref={toggle} className={styles.menuToggle} type="button" onClick={() => setOpen(!open)} aria-label={open ? "Cerrar menú" : "Abrir menú"} aria-expanded={open} aria-controls="reserva-mobile-nav">{open ? <X /> : <Menu />}</button>
    {open ? <nav id="reserva-mobile-nav" className={styles.mobileNav} aria-label="Navegación móvil" onKeyDown={event => { if (event.key === "Escape") { setOpen(false); toggle.current?.focus(); } }}><span>ELIGE TU PLAN</span>{links.map((link, i) => <a key={link.id} href={`#${link.id}`} onClick={() => setOpen(false)}><span>0{i + 1}</span>{link.label}<ArrowUpRight size={25} aria-hidden="true" /></a>)}<p>Producto. Fuego. Sobremesa.</p></nav> : null}
  </header>;
}

// Illustrations replace only seeded demo photos; custom uploaded photos keep priority.
const demoDishPhotos: Record<string, { cell: number; source?: string }> = {
  "Tataki de atún": { cell: 0, source: "photo-1546069901-ba9599a7e63c" },
  "Croquetas de jamón": { cell: 1, source: "photo-1625944230945-1b7dd3b949ab" },
  "Arroz meloso de mar": { cell: 2, source: "photo-1534080564583-6be75777b70a" },
  "Entrecot madurado": { cell: 3, source: "photo-1544025162-d76694265947" },
  "Pasta trufada": { cell: 4, source: "photo-1473093295043-cdd812d0e601" },
  "Tarta de queso": { cell: 5, source: "photo-1578985545062-69928b1d9587" },
  "Agua mineral": { cell: 6 },
  "Copa de vino tinto": { cell: 7 },
};

function DishImage({ item, sizes }: { item: Dish; sizes: string }) {
  const [failed, setFailed] = useState(false);
  const photo = demoDishPhotos[item.name];
  const useIllustration = photo && (!item.imageUrl || (photo.source ? item.imageUrl.includes(photo.source) : item.imageUrl.startsWith("https://images.unsplash.com/")));
  if (useIllustration) return <span className={styles.dishSprite} role="img" aria-label={`${item.name}, imagen ilustrativa`} style={{ backgroundPosition: `${(photo.cell % 4) * 100 / 3}% ${Math.floor(photo.cell / 4) * 100}%` }} />;
  return item.imageUrl && !failed ? <Image src={item.imageUrl} alt={item.name} fill unoptimized sizes={sizes} onError={() => setFailed(true)} /> : <div className={styles.imageFallback}><Utensils size={36} aria-hidden="true" /><span>{item.name}</span></div>;
}

export function ReservaMenu({ sections, bookingEnabled }: { sections: PublicRestaurant["menu"]["sections"]; bookingEnabled: boolean }) {
  const [selected, setSelected] = useState(0);
  const [dish, setDish] = useState<Dish | null>(null);
  const [preview, setPreview] = useState(0);
  const detail = useRef<HTMLDialogElement>(null);
  const openBooking = useContext(BookingContext);
  const current = sections[selected] || sections[0];
  if (!current) return <p className={styles.emptyMenu}>Estamos preparando la carta. Vuelve a consultar en un momento.</p>;
  const featured = current.items[preview] || current.items[0];
  return <div className={styles.menu}>
    <div className={styles.menuTabs} role="tablist" aria-label="Categorías de la carta">{sections.map((section, index) => <button type="button" key={section.title} role="tab" id={`menu-tab-${index}`} aria-controls="menu-panel" aria-selected={index === selected} tabIndex={index === selected ? 0 : -1} onClick={() => { setSelected(index); setPreview(0); }} onKeyDown={event => {
      let next = index;
      if (event.key === "ArrowRight") next = (index + 1) % sections.length;
      else if (event.key === "ArrowLeft") next = (index - 1 + sections.length) % sections.length;
      else if (event.key === "Home") next = 0;
      else if (event.key === "End") next = sections.length - 1;
      else return;
      event.preventDefault(); setSelected(next); setPreview(0); document.getElementById(`menu-tab-${next}`)?.focus();
    }}>{section.title}<span>{String(section.items.length).padStart(2, "0")}</span></button>)}</div>
    <div className={styles.menuSpread} role="tabpanel" id="menu-panel" aria-labelledby={`menu-tab-${selected}`} tabIndex={0}>
      <div className={styles.menuList}>{current.items.map((item, index) => <button type="button" className={`${styles.menuRow} ${index === preview ? styles.menuRowActive : ""}`} key={item.name} onPointerEnter={event => { if (event.pointerType === "mouse") setPreview(index); }} onFocus={() => setPreview(index)} aria-label={`Ver ${item.name}, ${price(item.price)}`} onClick={() => { setPreview(index); setDish(item); detail.current?.showModal(); }}><span className={styles.rowIndex}>{String(index + 1).padStart(2, "0")}</span><span className={styles.rowCopy}><strong>{item.name}</strong><span>{item.description}</span>{item.recommended ? <small>DE LOS FAVORITOS</small> : null}</span><span className={styles.rowPrice}>{price(item.price)}<Plus size={18} aria-hidden="true" /></span></button>)}<p className={styles.menuHint}>Cada plato tiene su momento. Elige el tuyo.</p></div>
      {featured ? <button type="button" className={styles.featuredDish} aria-label={`Ampliar ${featured.name}`} onClick={() => { setDish(featured); detail.current?.showModal(); }}><div className={styles.featuredPhoto} key={featured.name}><DishImage item={featured} sizes="(max-width: 760px) 90vw, 50vw" /></div><div className={styles.featuredCaption}><span>{featured.name}</span><span>Ver de cerca <ZoomIn size={17} aria-hidden="true" /></span></div></button> : null}
    </div>
    <dialog className={`${styles.dialog} ${styles.dishDialog}`} ref={detail} aria-labelledby="dish-title" onClick={event => { if (event.target === event.currentTarget) detail.current?.close(); }}>
      <button type="button" className={styles.closeButton} aria-label="Cerrar detalle del plato" onClick={() => detail.current?.close()}><X size={22} /></button>
      {dish ? <><div className={styles.detailPhoto}><DishImage key={dish.name} item={dish} sizes="(max-width: 760px) 95vw, 480px" /></div><div className={styles.detailCopy}><p className={styles.eyebrow}>DE NUESTRA CARTA</p><h2 id="dish-title">{dish.name}</h2><p>{dish.description}</p><strong>{price(dish.price)}</strong><p className={styles.dishDisclaimer}>Imagen ilustrativa · Precio de demostración · IVA incluido.<br />Para alérgenos e intolerancias, consulta al equipo.</p>{bookingEnabled ? <button type="button" className={styles.redButton} onClick={() => { detail.current?.close(); openBooking(); }}>Me apetece. Reservar mesa <ArrowUpRight size={20} aria-hidden="true" /></button> : null}</div></> : null}
    </dialog>
  </div>;
}

export function ReservaGallery({ images }: { images: string[] }) {
  const [selected, setSelected] = useState(0);
  const enlarged = useRef<HTMLDialogElement>(null);
  function move(amount: number) { setSelected(current => (current + amount + images.length) % images.length); }
  if (!images.length) return null;
  return <div className={styles.gallery}>
    <div className={styles.galleryStage}><Image key={selected} src={images[selected]} alt={`La Reserva, fotografía de ambiente ${selected + 1}`} fill unoptimized sizes="100vw" className={styles.galleryPhoto} /><button type="button" className={styles.expandButton} aria-label="Ampliar fotografía del ambiente" onClick={() => enlarged.current?.showModal()}><ZoomIn size={19} aria-hidden="true" /><span>Ver de cerca</span></button><span className={styles.galleryCaption}>BUENA MESA.<br /><em>Buenos momentos.</em></span></div>
    <div className={styles.galleryControls}><span className={styles.galleryCount} aria-live="polite">{String(selected + 1).padStart(2, "0")} <span>/ {String(images.length).padStart(2, "0")}</span></span><div className={styles.galleryDots}>{images.map((_, index) => <button type="button" key={index} aria-label={`Ver fotografía ${index + 1}`} aria-pressed={selected === index} onClick={() => setSelected(index)} />)}</div><div className={styles.galleryArrows}><button type="button" aria-label="Fotografía anterior" onClick={() => move(-1)}><ArrowLeft size={23} /></button><button type="button" aria-label="Fotografía siguiente" onClick={() => move(1)}><ArrowRight size={23} /></button></div></div>
    <dialog className={`${styles.dialog} ${styles.galleryDialog}`} ref={enlarged} aria-label="Fotografía del ambiente ampliada" onKeyDown={event => { if (event.key === "ArrowRight") { event.preventDefault(); move(1); } if (event.key === "ArrowLeft") { event.preventDefault(); move(-1); } }} onClick={event => { if (event.target === event.currentTarget) enlarged.current?.close(); }}><button className={styles.closeButton} type="button" aria-label="Cerrar fotografía" onClick={() => enlarged.current?.close()}><X size={24} /></button><div className={styles.enlargedPhoto}><Image src={images[selected]} alt={`Ambiente de La Reserva, fotografía ${selected + 1}`} fill unoptimized sizes="95vw" /></div><div className={styles.enlargedControls}><button type="button" aria-label="Anterior en pantalla ampliada" onClick={() => move(-1)}><ArrowLeft /></button><span aria-live="polite">{selected + 1} / {images.length}</span><button type="button" aria-label="Siguiente en pantalla ampliada" onClick={() => move(1)}><ArrowRight /></button></div></dialog>
  </div>;
}
