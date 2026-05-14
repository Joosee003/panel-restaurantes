"use client";

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

type Props = {
  open: boolean;
  onClose: () => void;
  restauranteId: string | null;
  onCreated?: () => void | Promise<void>;
};

export default function AddReservaModal({
  open,
  onClose,
  restauranteId,
  onCreated,
}: Props) {
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [fecha, setFecha] = useState("");
  const [hora, setHora] = useState("");
  const [personas, setPersonas] = useState<number | "">("");
  const [loading, setLoading] = useState(false);

  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const read = () =>
      setIsDark(document.documentElement.classList.contains("dark"));

    read();

    const obs = new MutationObserver(read);
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    const resetAlVolver = () => {
      if (document.visibilityState === "visible") {
        setLoading(false);
      }
    };

    document.addEventListener("visibilitychange", resetAlVolver);

    return () => {
      document.removeEventListener("visibilitychange", resetAlVolver);
    };
  }, []);

  if (!open) return null;

  const limpiarFormulario = () => {
    setNombre("");
    setTelefono("");
    setFecha("");
    setHora("");
    setPersonas("");
  };

  const cerrarModal = () => {
    if (loading) return;
    onClose();
  };

  const guardar = async () => {
    if (loading) return;

    const nombreLimpio = nombre.trim();
    const telefonoLimpio = telefono.trim();

    if (!restauranteId) {
      alert("El restaurante aún se está cargando.");
      return;
    }

    if (!nombreLimpio || !telefonoLimpio || !fecha || !hora || !personas) {
      alert("Rellena todos los campos.");
      return;
    }

    setLoading(true);

    try {
      const { data: clienteExistente, error: errorClienteExistente } =
        await supabase
          .from("clientes")
          .select("id")
          .eq("telefono", telefonoLimpio)
          .eq("restaurante_id", restauranteId)
          .maybeSingle();

      if (errorClienteExistente) {
        console.error("Error buscando cliente:", errorClienteExistente);
        alert("Error buscando cliente.");
        return;
      }

      let clienteId = clienteExistente?.id ?? null;

      if (!clienteId) {
        const { data: nuevoCliente, error: errorNuevoCliente } = await supabase
          .from("clientes")
          .insert({
            restaurante_id: restauranteId,
            nombre: nombreLimpio,
            telefono: telefonoLimpio,
            canal_contacto: "panel",
          })
          .select("id")
          .single();

        if (errorNuevoCliente || !nuevoCliente) {
          console.error("Error creando cliente:", errorNuevoCliente);
          alert("Error creando cliente.");
          return;
        }

        clienteId = nuevoCliente.id;
      }

      const fechaHoraReserva = `${fecha}T${hora}:00`;

      const { data: reservaCreada, error: errorReserva } = await supabase
        .from("reservas")
        .insert({
          restaurante_id: restauranteId,
          cliente_id: clienteId,
          nombre_cliente: nombreLimpio,
          telefono: telefonoLimpio,
          personas: Number(personas),
          fecha_hora_reserva: fechaHoraReserva,
          estado: "pendiente",
          origen: "panel",
        })
        .select("id, restaurante_id")
        .single();

      if (errorReserva || !reservaCreada) {
        console.error("Error creando reserva:", errorReserva);
        alert("Error creando reserva.");
        return;
      }

      const reservaId = reservaCreada.id;
      const rid = reservaCreada.restaurante_id;

      limpiarFormulario();

      setLoading(false);
      onClose();

      window.setTimeout(() => {
        Promise.resolve(onCreated?.()).catch((err) => {
          console.error("Error recargando reservas:", err);
        });

        fetch("https://n8n.gastrohelp.es/webhook/panel-reserva-creada", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            reserva_id: reservaId,
            restaurante_id: rid,
            origen: "panel",
          }),
        }).catch((err) => {
          console.log("No se pudo notificar a n8n:", err);
        });
      }, 0);
    } catch (err) {
      console.error("Error general guardando reserva:", err);
      alert("Error guardando la reserva.");
    } finally {
      setLoading(false);
    }
  };

  const overlayClass = isDark ? "bg-black/60" : "bg-black/30";

  const modalClass = isDark
    ? "bg-[#0b1220] text-gray-100"
    : "bg-white text-gray-900";

  const inputClass = isDark
    ? "px-3 py-2 border rounded-md text-sm bg-[#050b18] text-gray-100 border-gray-700"
    : "px-3 py-2 border rounded-md text-sm bg-white text-gray-900 border-gray-300";

  const cancelBtnClass = isDark
    ? "px-4 py-2 rounded-md border text-sm border-gray-700 text-gray-200 disabled:opacity-50"
    : "px-4 py-2 rounded-md border text-sm border-gray-300 text-gray-700 disabled:opacity-50";

  const saveBtnClass =
    "px-4 py-2 rounded-md text-sm text-white disabled:opacity-50 disabled:cursor-not-allowed " +
    (isDark ? "bg-black hover:bg-gray-800" : "bg-gray-900 hover:bg-gray-800");

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center ${overlayClass}`}
    >
      <div className={`rounded-lg w-full max-w-lg p-6 space-y-4 ${modalClass}`}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Añadir reserva</h2>

          <button
            type="button"
            onClick={cerrarModal}
            disabled={loading}
            className="text-sm opacity-70 hover:opacity-100 disabled:opacity-40"
          >
            Cerrar
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Nombre cliente"
            className={`${inputClass} col-span-2`}
          />

          <input
            value={telefono}
            onChange={(e) => setTelefono(e.target.value)}
            placeholder="Teléfono"
            className={`${inputClass} col-span-2`}
          />

          <input
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            className={inputClass}
          />

          <input
            type="time"
            value={hora}
            onChange={(e) => setHora(e.target.value)}
            className={inputClass}
          />

          <input
            type="number"
            value={personas}
            onChange={(e) =>
              setPersonas(e.target.value === "" ? "" : Number(e.target.value))
            }
            placeholder="Personas"
            className={`${inputClass} col-span-2`}
          />
        </div>

        <div className="flex justify-end gap-2 pt-4">
          <button
            type="button"
            onClick={cerrarModal}
            disabled={loading}
            className={cancelBtnClass}
          >
            Cancelar
          </button>

          <button
            type="button"
            disabled={loading}
            onClick={guardar}
            className={saveBtnClass}
          >
            {loading ? "Guardando..." : "Guardar reserva"}
          </button>
        </div>
      </div>
    </div>
  );
}