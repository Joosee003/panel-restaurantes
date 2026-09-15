"use client";
import { useRef, useState } from "react";
import { supabase } from "@/app/(app)/lib/supabaseClient";
import type { RestaurantOverview } from "@/lib/admin/overview";
export function RestaurantContact({
  restaurant,
  onSaved,
}: {
  restaurant: RestaurantOverview;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false),
    [phone, setPhone] = useState(restaurant.phone || ""),
    [address, setAddress] = useState(restaurant.address || ""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const pending = useRef(false);
  async function save() {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error("La sesión ha caducado.");
      const response = await fetch("/api/admin/restaurantes", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          restaurante_id: restaurant.id,
          telefono: phone,
          direccion: address,
        }),
      });
      if (!response.ok)
        throw new Error(
          response.status === 400
            ? "Revisa el teléfono y la dirección."
            : "No se han podido guardar los datos. Vuelve a intentarlo.",
        );
      setEditing(false);
      onSaved();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No se han podido guardar los datos.",
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <div>
      <span className="agency-eyebrow">Ficha del restaurante</span>
      <h2>Datos y acceso</h2>
      {editing ? (
        <form
          className="agency-wizard-form"
          style={{ marginTop: 16 }}
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <label>
            Teléfono de contacto
            <input
              type="tel"
              maxLength={40}
              value={phone}
              disabled={busy}
              onChange={(event) => setPhone(event.target.value)}
            />
          </label>
          <label>
            Dirección
            <input
              maxLength={300}
              value={address}
              disabled={busy}
              onChange={(event) => setAddress(event.target.value)}
            />
          </label>
          {error && (
            <p className="agency-error" role="alert">
              {error}
            </p>
          )}
          <div className="agency-actions">
            <button className="agency-button" disabled={busy} type="submit">
              {busy ? "Guardando…" : "Guardar contacto"}
            </button>
            <button
              className="agency-button secondary"
              disabled={busy}
              type="button"
              onClick={() => setEditing(false)}
            >
              Cancelar
            </button>
          </div>
        </form>
      ) : (
        <>
          <p>{restaurant.address || "Dirección pendiente"}</p>
          <p>{restaurant.phone || "Teléfono pendiente"}</p>
          <p className="agency-muted">Servicio: {restaurant.plan}</p>
          <button
            type="button"
            className="agency-text-button"
            onClick={() => setEditing(true)}
          >
            Editar contacto
          </button>
        </>
      )}
    </div>
  );
}
