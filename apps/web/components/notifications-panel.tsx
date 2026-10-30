"use client";
import { useEffect, useState } from "react";
import { api } from "@ticketrush/api-client";
type Notice = {
  id: string;
  orderId: string;
  message: string;
  createdAt: string;
};
export default function NotificationsPanel() {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const items = await api<Notice[]>("/notifications");
        if (active) {
          setNotices(items);
          setUnavailable(false);
        }
      } catch {
        if (active) setUnavailable(true);
      }
    }
    void load();
    const timer = setInterval(() => void load(), 5000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);
  return (
    <aside className="panel" aria-label="Notifications">
      <h2>Vos notifications</h2>
      {unavailable ? (
        <p role="status" className="muted">
          Les notifications sont temporairement indisponibles. Vos billets
          restent accessibles ci-dessous.
        </p>
      ) : notices.length ? (
        <ul>
          {notices.slice(0, 5).map((notice) => (
            <li key={notice.id}>
              Vos billets sont prêts pour la commande{" "}
              {notice.orderId.slice(0, 8)}. Retrouvez-les ci-dessous.
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">Vos confirmations apparaîtront ici.</p>
      )}
    </aside>
  );
}
