import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { ClipboardList, LayoutDashboard, Store } from "lucide-react";
import {
  OverviewContent,
  RestaurantDetail,
} from "@/app/admin/components/AgencyViews";
import { OnboardingWizard } from "@/app/admin/components/OnboardingWorkspace";
import {
  buildAgencyOverview,
  createPeriod,
  shiftDay,
  type AgencyData,
} from "@/lib/admin/overview";
import "../../app/globals.css";
import "../../app/admin/agency.css";
const period = createPeriod(30, new Date("2026-09-15T12:00:00Z"));
const data: AgencyData = {
  restaurants: [
    {
      id: "a",
      nombre: "Casa del Puerto",
      telefono: "+34600000301",
      direccion: "Dirección de prueba",
    },
    {
      id: "b",
      nombre: "La Mesa Verde",
      telefono: "+34600000302",
      direccion: "Dirección de prueba",
    },
    { id: "c", nombre: "Restaurante Demo" },
  ],
  modules: [
    {
      restaurante_id: "a",
      estado: "activo",
      plan: "premium",
      reservas: true,
      clientes: true,
      resenas: true,
      chatbot: true,
      menu_digital: true,
      automatizaciones: true,
    },
    { restaurante_id: "c", estado: "demo", reservas: true },
  ],
  opinionConfig: [
    {
      restaurante_id: "a",
      active: true,
      slug: "puerto",
      google_review_url: "https://g.page/r/fixture/review",
    },
    {
      restaurante_id: "b",
      active: true,
      slug: "mesa",
      google_review_url: "https://g.page/r/fixture/review",
    },
  ],
  bookings: [],
  opinions: [],
  requests: [],
  access: [{ restaurante_id: "a" }, { restaurante_id: "b" }],
  channels: [
    {
      restaurante_id: "a",
      status: "WORKING",
      enabled: true,
      chatbot_enabled: true,
    },
  ],
  openOpinions: [
    { restaurante_id: "b", seguimiento: "pendiente" },
    { restaurante_id: "b", seguimiento: "pendiente" },
  ],
};
for (let i = 0; i < 60; i++) {
  const day = shiftDay(period.previousStart, i);
  for (let j = 0; j < (i % 4) + 1; j++)
    data.bookings.push({
      restaurante_id: "a",
      inicio_at: `${day}T13:00:00Z`,
      created_at: `${day}T10:00:00Z`,
      estado: "confirmada",
      atendida: j !== 3,
    });
  for (let j = 0; j < i % 3; j++)
    data.opinions.push({
      restaurante_id: i % 2 ? "a" : "b",
      created_at: `${day}T15:00:00Z`,
      rating: j ? 4 : 5,
    });
  if (i % 4 === 0)
    data.requests.push({
      restaurante_id: "a",
      sent_at: `${day}T15:00:00Z`,
      confirmed_at: i % 8 === 0 ? `${day}T16:00:00Z` : null,
      google_opened_at: `${day}T15:10:00Z`,
    });
}
const overview = buildAgencyOverview(data, period);
function Preview() {
  const [view, setView] = useState("control"),
    [dark, setDark] = useState(false);
  useEffect(() => {
    const handler = (event: Event) => {
      const path = (event as CustomEvent<string>).detail;
      setView(
        path.includes("onboarding")
          ? "onboarding"
          : path.endsWith("/a")
            ? "a"
            : path.endsWith("/b")
              ? "b"
              : "control",
      );
    };
    window.addEventListener("agency-preview-navigate", handler);
    return () => window.removeEventListener("agency-preview-navigate", handler);
  }, []);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);
  const restaurant = overview.restaurants.find((row) => row.id === view);
  return (
    <div className="agency-app">
      <nav className="agency-nav" aria-label="GastroHelp interno">
        <a className="agency-logo" href="#" onClick={() => setView("control")}>
          <span className="agency-logo-mark">g.</span>GastroHelp
        </a>
        <div>
          <p className="agency-nav-label">Tu espacio de trabajo</p>
          <div className="agency-nav-links">
            {[
              ["control", "Centro de control", LayoutDashboard],
              ["a", "Restaurantes", Store],
              ["onboarding", "Puesta en marcha", ClipboardList],
            ].map(([key, label, Icon]) => (
              <a
                key={String(key)}
                href="#"
                aria-current={view === key ? "page" : undefined}
                onClick={() => setView(String(key))}
              >
                <Icon size={17} />
                {String(label)}
              </a>
            ))}
          </div>
        </div>
        <div className="agency-nav-bottom">Datos ficticios · Prueba visual</div>
      </nav>
      <div className="agency-main">
        <header className="agency-header">
          <span>Prueba de GastroHelp · datos ficticios</span>
          <button className="agency-text-button" onClick={() => setDark(!dark)}>
            {dark ? "Modo claro" : "Modo oscuro"}
          </button>
        </header>
        <div className="agency-content">
          {view === "onboarding" ? (
            <>
              <h1>Un buen comienzo, paso a paso.</h1>
              <OnboardingWizard
                create={async (form) => ({
                  restaurante_id: "a",
                  invited_email: form.email,
                })}
              />
            </>
          ) : restaurant ? (
            <RestaurantDetail
              restaurant={restaurant}
              days={30}
              setDays={() => {}}
              open={(href) => window.alert(`Navegación de prueba: ${href}`)}
              reload={() => {}}
            />
          ) : (
            <>
              <div className="agency-page-heading">
                <div>
                  <span className="agency-eyebrow">Centro de control</span>
                  <h1>Tu cartera, de un vistazo.</h1>
                  <p>
                    Resultados, próximos pasos y servicios de todos tus
                    restaurantes.
                  </p>
                </div>
                <button
                  className="agency-button"
                  onClick={() => setView("onboarding")}
                >
                  Añadir restaurante
                </button>
              </div>
              <OverviewContent data={overview} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<Preview />);
