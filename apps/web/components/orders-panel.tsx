"use client";
import { useEffect, useState } from "react";
import { api, downloadTicket, type Order } from "@ticketrush/api-client";
import { money } from "./event-card";
export default function OrdersPanel() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const data = await api<Order[]>("/orders");
        if (active) {
          setOrders(data);
          setError("");
        }
      } catch (err) {
        if (active)
          setError(
            err instanceof Error ? err.message : "Chargement impossible.",
          );
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    const timer = setInterval(() => void load(), 5000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);
  async function download(id: string) {
    try {
      await downloadTicket(id);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Téléchargement impossible.",
      );
    }
  }
  return (
    <section className="dashboard">
      <p className="eyebrow">VOS SOUVENIRS COMMENCENT ICI</p>
      <h1>Mes billets.</h1>
      <p className="muted">
        Vos commandes et billets sont mis à jour automatiquement.
      </p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {loading ? (
        <p>Chargement de vos commandes…</p>
      ) : orders.length === 0 ? (
        <div className="empty">
          Votre prochaine expérience reste à écrire. Explorez le catalogue pour
          réserver.
        </div>
      ) : (
        <div className="order-list">
          {orders.map((order) => (
            <article className="order" key={order.id}>
              <div>
                <span
                  className={`badge ${order.status === "PAID" ? "success" : ""}`}
                >
                  {(
                    {
                      PAID: "Payée",
                      PENDING: "En attente",
                      EXPIRED: "Expirée",
                    } as Record<string, string>
                  )[order.status] ?? order.status}
                </span>
                <h3>{order.hold.category.event.title}</h3>
                <p className="muted">
                  {order.hold.quantity} × {order.hold.category.name} ·{" "}
                  {money(order.totalCents)}
                </p>
                <small>Commande {order.id.slice(0, 8)}</small>
              </div>
              <div className="ticket-actions">
                {order.status === "PAID" && order.tickets.length === 0 ? (
                  <span className="muted">
                    Vos billets sont en préparation…
                  </span>
                ) : (
                  order.tickets.map((ticket, i) => (
                    <div key={ticket.id}>
                      <button
                        className="secondary"
                        disabled={!ticket.pdfReady}
                        onClick={() => void download(ticket.id)}
                      >
                        {ticket.pdfReady
                          ? `↓ Billet ${i + 1} · PDF`
                          : "Génération…"}
                      </button>
                      <small className="ticket-code">
                        {ticket.scannedAt ? "Déjà utilisé" : ticket.code}
                      </small>
                    </div>
                  ))
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
