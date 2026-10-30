"use client";
import { useEffect, useState, useCallback, type FormEvent } from "react";
import { api, type User, type Event, type Page } from "@ticketrush/api-client";

export default function StaffPanel({ user }: { user: User }) {
  const [events, setEvents] = useState<Event[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try {
      if (user.role === "ORGANISATEUR")
        setEvents((await api<Page<Event>>("/events/mine?limit=50")).data);
      if (user.role === "ADMIN")
        setUsers(await api<User[]>("/admin/users?limit=50"));
      if (user.role === "CONTROLEUR") {
        const data = await api<{ event: Event }[]>("/controller/events");
        setEvents(data.map((a) => a.event));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Chargement impossible.");
    }
  }, [user.role]);
  useEffect(() => {
    void load();
  }, [load]);
  async function action(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await fn();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action impossible.");
    } finally {
      setBusy(false);
    }
  }
  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const d = new FormData(form);
    await action(async () => {
      const event = await api<Event>("/events", {
        method: "POST",
        body: JSON.stringify({
          title: d.get("title"),
          description: d.get("description"),
          venue: d.get("venue"),
          startsAt: new Date(String(d.get("startsAt"))).toISOString(),
        }),
      });
      await api(`/events/${event.id}/categories`, {
        method: "POST",
        body: JSON.stringify({
          name: d.get("category"),
          capacity: Number(d.get("capacity")),
          priceCents: Math.round(Number(d.get("price")) * 100),
        }),
      });
      await api(`/events/${event.id}/publish`, { method: "POST" });
      setMessage("Votre événement est publié.");
      form.reset();
    });
  }
  async function scan(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    await action(async () => {
      await api("/tickets/scan", {
        method: "POST",
        body: JSON.stringify({
          eventId: d.get("eventId"),
          code: String(d.get("code")).trim(),
        }),
      });
      setMessage("Entrée acceptée. Le billet est maintenant utilisé.");
    });
  }
  async function assign(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    await action(async () => {
      await api(`/events/${String(d.get("eventId"))}/controllers`, {
        method: "POST",
        body: JSON.stringify({ userId: d.get("userId") }),
      });
      setMessage("Contrôleur affecté.");
    });
  }
  return (
    <section className="dashboard">
      <p className="eyebrow">LES COULISSES DE L’EXPÉRIENCE</p>
      <h1>
        {user.role === "ORGANISATEUR"
          ? "Votre scène."
          : user.role === "CONTROLEUR"
            ? "Contrôle des entrées."
            : "Administration."}
      </h1>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="notice" role="status">
          {message}
        </p>
      )}
      {user.role === "ORGANISATEUR" && (
        <>
          <div className="staff-grid">
            <form className="panel" onSubmit={(e) => void create(e)}>
              <h2>Publier un événement</h2>
              <label>
                Titre
                <input name="title" required minLength={3} maxLength={150} />
              </label>
              <label>
                Description
                <textarea name="description" required minLength={10} />
              </label>
              <div className="form-row">
                <label>
                  Lieu
                  <input name="venue" required minLength={2} />
                </label>
                <label>
                  Date et heure
                  <input name="startsAt" type="datetime-local" required />
                </label>
              </div>
              <div className="form-row">
                <label>
                  Catégorie
                  <input name="category" defaultValue="Standard" required />
                </label>
                <label>
                  Capacité
                  <input
                    name="capacity"
                    type="number"
                    min={1}
                    max={100000}
                    defaultValue={100}
                    required
                  />
                </label>
                <label>
                  Prix en €
                  <input
                    name="price"
                    type="number"
                    min={0}
                    step="0.01"
                    defaultValue={25}
                    required
                  />
                </label>
              </div>
              <button className="primary" disabled={busy}>
                Créer et publier →
              </button>
            </form>
            <div className="panel">
              <h2>Mes événements</h2>
              {events.length === 0 ? (
                <p className="muted">Créez votre premier événement.</p>
              ) : (
                events.map((e) => (
                  <div className="list-row" key={e.id}>
                    <strong>{e.title}</strong>
                    <span className="badge">{e.status}</span>
                    {e.status === "DRAFT" && e.categories.length > 0 && (
                      <button
                        className="secondary"
                        onClick={() =>
                          void action(async () => {
                            await api(`/events/${e.id}/publish`, {
                              method: "POST",
                            });
                          })
                        }
                      >
                        Publier
                      </button>
                    )}
                  </div>
                ))
              )}
              <form onSubmit={(e) => void assign(e)}>
                <h3>Affecter un contrôleur</h3>
                <label>
                  Événement
                  <select name="eventId" required>
                    {events.map((e) => (
                      <option value={e.id} key={e.id}>
                        {e.title}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Identifiant du contrôleur
                  <input
                    name="userId"
                    required
                    placeholder="UUID du compte contrôleur"
                  />
                </label>
                <button
                  className="secondary"
                  disabled={busy || events.length === 0}
                >
                  Affecter
                </button>
              </form>
            </div>
          </div>
        </>
      )}
      {user.role === "CONTROLEUR" && (
        <form className="panel scan-panel" onSubmit={(e) => void scan(e)}>
          <h2>Valider un billet</h2>
          <p className="muted">
            Sélectionnez l’événement puis saisissez le code du QR ou utilisez un
            lecteur USB.
          </p>
          <label>
            Événement
            <select name="eventId" required>
              {events.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.title}
                </option>
              ))}
            </select>
          </label>
          <label>
            Code du billet
            <input
              name="code"
              required
              placeholder="Code UUID du QR"
              autoComplete="off"
            />
          </label>
          <button className="primary" disabled={busy || events.length === 0}>
            Contrôler l’entrée →
          </button>
          {events.length === 0 && (
            <p className="muted">Aucun événement ne vous est affecté.</p>
          )}
        </form>
      )}
      {user.role === "ADMIN" && (
        <div className="panel">
          <h2>Comptes et permissions</h2>
          {users.map((u) => (
            <div className="list-row" key={u.id}>
              <div>
                <strong>{u.email}</strong>
                <small>{u.id}</small>
              </div>
              <select
                aria-label={`Rôle de ${u.email}`}
                disabled={busy || u.role === "ADMIN"}
                value={u.role}
                onChange={(e) => {
                  const role = e.target.value;
                  void action(async () => {
                    await api(`/admin/users/${u.id}/role`, {
                      method: "POST",
                      body: JSON.stringify({ role }),
                    });
                    setMessage(
                      "Rôle modifié ; les sessions du compte ont été révoquées.",
                    );
                  });
                }}
              >
                {["CLIENT", "ORGANISATEUR", "CONTROLEUR", "ADMIN"].map((r) => (
                  <option value={r} key={r} disabled={r === "ADMIN"}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
          ))}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const d = new FormData(e.currentTarget);
              void action(async () => {
                await api(
                  `/admin/events/${String(d.get("eventId"))}/withdraw`,
                  {
                    method: "POST",
                    body: JSON.stringify({ reason: d.get("reason") }),
                  },
                );
                setMessage("Événement retiré de la vente.");
              });
            }}
          >
            <h3>Retirer un événement de la vente</h3>
            <label>
              Identifiant de l’événement
              <input name="eventId" required />
            </label>
            <label>
              Motif
              <input name="reason" required minLength={5} />
            </label>
            <button className="secondary" disabled={busy}>
              Retirer de la vente
            </button>
          </form>
        </div>
      )}
    </section>
  );
}
