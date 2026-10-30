"use client";
import { useEffect, useState } from "react";
import { api, type Event, type Hold, type Order } from "@ticketrush/api-client";
import { money } from "./event-card";
import Modal from "./modal";
export default function ReservationDialog({
  event,
  onClose,
  onPaid,
}: {
  event: Event;
  onClose: () => void;
  onPaid: () => void;
}) {
  const [categoryId, setCategory] = useState(event.categories[0]?.id ?? "");
  const [quantity, setQuantity] = useState(1);
  const [order, setOrder] = useState<Order | null>(null);
  const [expires, setExpires] = useState("");
  const [remaining, setRemaining] = useState(600);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [available, setAvailable] = useState<number | null>(null);
  const category = event.categories.find((c) => c.id === categoryId);
  useEffect(() => {
    let active = true;
    void api<{ available: number }>(`/reservations/availability/${categoryId}`)
      .then((r) => {
        if (active) setAvailable(r.available);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [categoryId]);
  useEffect(() => {
    if (!expires) return;
    const tick = () =>
      setRemaining(
        Math.max(0, Math.floor((Date.parse(expires) - Date.now()) / 1000)),
      );
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [expires]);
  async function reserve() {
    setBusy(true);
    setError("");
    try {
      const hold = await api<Hold>("/reservations", {
        method: "POST",
        body: JSON.stringify({ categoryId, quantity }),
      });
      const result = await api<Order>("/orders", {
        method: "POST",
        headers: { "idempotency-key": crypto.randomUUID() },
        body: JSON.stringify({ holdId: hold.id }),
      });
      setExpires(hold.expiresAt);
      setOrder(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Réservation impossible.");
    } finally {
      setBusy(false);
    }
  }
  async function pay(status: "SUCCEEDED" | "FAILED") {
    if (!order) return;
    setBusy(true);
    setError("");
    try {
      const result = await api<Order>(`/orders/${order.id}/simulate-payment`, {
        method: "POST",
        body: JSON.stringify({ status }),
      });
      if (result.status === "PAID") {
        onPaid();
        onClose();
      } else
        setError(
          "Paiement refusé. Votre réservation reste valable jusqu’à son expiration.",
        );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Paiement impossible.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal onClose={onClose}>
      <section
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="reserve-title"
      >
        <button className="close" aria-label="Fermer" onClick={onClose}>
          ×
        </button>
        <p className="eyebrow">VOTRE PROCHAINE EXPÉRIENCE</p>
        <h2 id="reserve-title">{event.title}</h2>
        <p className="muted">
          {event.venue} · {new Date(event.startsAt).toLocaleDateString("fr-FR")}
        </p>
        {!order ? (
          <>
            <p>{event.description}</p>
            <label>
              Catégorie
              <select
                value={categoryId}
                onChange={(e) => setCategory(e.target.value)}
              >
                {event.categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} — {money(c.priceCents)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Nombre de places
              <input
                type="number"
                min={1}
                max={20}
                value={quantity}
                onChange={(e) => setQuantity(Number(e.target.value))}
              />
            </label>
            <p className="muted">
              {available === null
                ? "Disponibilité en cours…"
                : `${available} place(s) disponible(s)`}{" "}
              · Réservation valable 10 minutes.
            </p>
            <div className="total">
              <span>Total</span>
              <strong>{money((category?.priceCents ?? 0) * quantity)}</strong>
            </div>
            <button
              className="primary wide"
              disabled={
                busy ||
                !category ||
                quantity < 1 ||
                quantity > 20 ||
                available === 0
              }
              onClick={() => void reserve()}
            >
              {busy ? "Réservation…" : "Bloquer mes places →"}
            </button>
          </>
        ) : (
          <>
            <div
              className={`countdown ${remaining === 0 ? "expired" : ""}`}
              role="status"
            >
              {remaining === 0
                ? "Réservation expirée"
                : `Places réservées pendant ${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}`}
            </div>
            <div className="total">
              <span>Total à payer</span>
              <strong>{money(order.totalCents)}</strong>
            </div>
            <p className="muted">
              Démonstration locale : aucun montant réel ne sera débité.
            </p>
            <button
              className="primary wide"
              disabled={busy || remaining === 0}
              onClick={() => void pay("SUCCEEDED")}
            >
              {busy ? "Confirmation…" : "Simuler un paiement réussi →"}
            </button>
            <button
              className="text-button"
              disabled={busy || remaining === 0}
              onClick={() => void pay("FAILED")}
            >
              Tester un paiement refusé
            </button>
          </>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </section>
    </Modal>
  );
}
