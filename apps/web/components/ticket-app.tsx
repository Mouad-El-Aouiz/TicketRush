"use client";
import { useEffect, useState, type FormEvent } from "react";
import {
  api,
  refresh,
  setToken,
  type Event,
  type User,
  type Page,
} from "@ticketrush/api-client";
import AuthDialog from "./auth-dialog";
import EventCard from "./event-card";
import ReservationDialog from "./reservation-dialog";
import OrdersPanel from "./orders-panel";
import StaffPanel from "./staff-panel";
import AssistantDialog from "./assistant-dialog";

export default function TicketApp() {
  const [user, setUser] = useState<User | null>(null);
  const [tab, setTab] = useState("explore");
  const [auth, setAuth] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [selected, setSelected] = useState<Event | null>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => {
    let active = true;
    const query = new URLSearchParams(window.location.search);
    if (query.get("authError") === "google") {
      setNotice(
        "Connexion Google impossible. Vérifiez la configuration puis réessayez.",
      );
      window.history.replaceState({}, "", window.location.pathname);
    }
    void refresh()
      .then(() => api<User>("/auth/me"))
      .then((u) => {
        if (active) setUser(u);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    void api<Page<Event>>(
      `/events?page=${page}&limit=9&search=${encodeURIComponent(search)}`,
      { signal: controller.signal },
    )
      .then((data) => {
        setEvents(data.data);
        setTotal(data.total);
        setError("");
      })
      .catch((err) => {
        if (!controller.signal.aborted)
          setError(
            err instanceof Error ? err.message : "Catalogue indisponible.",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [search, page]);
  function select(event: Event) {
    if (!user) {
      setNotice("Connectez-vous pour réserver vos places.");
      setAuth(true);
      return;
    }
    if (user.role !== "CLIENT") {
      setNotice("La réservation est disponible avec un compte client.");
      return;
    }
    setSelected(event);
  }
  async function logout() {
    try {
      await api("/auth/logout", { method: "POST" });
    } finally {
      setToken(undefined);
      setUser(null);
      setTab("explore");
    }
  }
  function find(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    setPage(1);
    setSearch(String(data.get("search") ?? ""));
    document
      .getElementById("catalogue")
      ?.scrollIntoView({ behavior: "smooth" });
  }
  return (
    <>
      <header className="header">
        <a className="brand" href="/" aria-label="TicketRush accueil">
          <span className="brand-mark">
            t<span>r</span>
          </span>
          ticket<span>rush</span>
          <span className="brand-dot">●</span>
        </a>
        <nav aria-label="Navigation principale">
          <button
            className={tab === "explore" ? "nav-active" : ""}
            onClick={() => setTab("explore")}
          >
            Explorer
          </button>
          {user && (
            <button
              className={tab === "orders" ? "nav-active" : ""}
              onClick={() => setTab("orders")}
            >
              Mes billets
            </button>
          )}
          <button onClick={() => setAssistantOpen(true)}>Aide IA</button>
          {user && user.role !== "CLIENT" && (
            <button
              className={tab === "staff" ? "nav-active" : ""}
              onClick={() => setTab("staff")}
            >
              Mon espace
            </button>
          )}
        </nav>
        <div className="account">
          {user ? (
            <>
              <span className="account-name">{user.email.split("@")[0]}</span>
              <button className="secondary small" onClick={() => void logout()}>
                Déconnexion
              </button>
            </>
          ) : (
            <button className="primary small" onClick={() => setAuth(true)}>
              Se connecter <span>↗</span>
            </button>
          )}
        </div>
      </header>
      <main>
        {notice && (
          <div className="notice banner" role="status">
            {notice}
            <button
              aria-label="Fermer le message"
              onClick={() => setNotice("")}
            >
              ×
            </button>
          </div>
        )}
        {tab === "explore" ? (
          <>
            <section className="hero">
              <div className="hero-copy">
                <p className="eyebrow">
                  <span className="live-dot" /> POUR CEUX QUI VEULENT Y ÊTRE
                </p>
                <h1>
                  Les meilleurs
                  <br />
                  moments ne
                  <br />
                  <span>s’attendent pas.</span>
                </h1>
                <p className="hero-description">
                  Une scène, une rencontre, une émotion.
                  <br />
                  Trouvez votre prochaine expérience et prenez votre place.
                </p>
                <form className="search-box" onSubmit={find}>
                  <span aria-hidden="true">⌕</span>
                  <input
                    aria-label="Rechercher un événement ou un lieu"
                    name="search"
                    placeholder="Un événement, une ville, une envie…"
                  />
                  <button type="submit" aria-label="Rechercher">
                    ↗
                  </button>
                </form>
                <div className="hero-note">
                  <span className="mini-ticket">↗</span>Vos envies. Votre place.
                  Votre moment.
                </div>
              </div>
              <div className="hero-visual" aria-hidden="true">
                <div className="visual-top">
                  <span>
                    THE NEXT
                    <br />
                    BIG FEELING.
                  </span>
                  <span>↗</span>
                </div>
                <div className="visual-ring ring-one" />
                <div className="visual-ring ring-two" />
                <div className="visual-ring ring-three" />
                <div className="visual-star">✳</div>
                <div className="visual-ticket">
                  <span>ADMIT ONE</span>
                  <strong>
                    VIVEZ
                    <br />
                    L’INSTANT.
                  </strong>
                  <div className="barcode" />
                  <small>TICKETRUSH — LIVE MORE</small>
                </div>
                <div className="visual-bottom">
                  <span>
                    MADE FOR
                    <br />
                    REAL MOMENTS
                  </span>
                  <span>01 — ∞</span>
                </div>
              </div>
            </section>
            <div className="ticker" aria-hidden="true">
              <span>PLUS DE LIVE</span>✳<span>PLUS DE RENCONTRES</span>✳
              <span>PLUS D’ÉMOTIONS</span>✳<span>PLUS DE VOUS</span>✳
            </div>
            <section id="catalogue" className="catalogue">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">LE PROCHAIN RENDEZ-VOUS</p>
                  <h2>
                    Ça se passe bientôt<span className="lime">.</span>
                  </h2>
                </div>
                <span className="result-count">
                  {total} expérience{total !== 1 ? "s" : ""} à découvrir
                </span>
              </div>
              <div className="filters">
                <button
                  className={!search ? "filter active" : "filter"}
                  onClick={() => {
                    setSearch("");
                    setPage(1);
                  }}
                >
                  Tous les événements
                </button>
                {["Concert", "Conférence", "Festival"].map((s) => (
                  <button
                    key={s}
                    className={search === s ? "filter active" : "filter"}
                    onClick={() => {
                      setSearch(s);
                      setPage(1);
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
              {error ? (
                <div className="error" role="alert">
                  {error} Vérifiez que l’API est démarrée.
                </div>
              ) : loading ? (
                <div
                  className="skeleton-grid"
                  aria-label="Chargement des événements"
                >
                  {[0, 1, 2].map((i) => (
                    <div className="skeleton" key={i} />
                  ))}
                </div>
              ) : events.length === 0 ? (
                <div className="empty">
                  <h3>Un peu de calme avant le live.</h3>
                  <p>
                    Aucun événement pour cette recherche. Essayez un autre
                    mot-clé.
                  </p>
                </div>
              ) : (
                <div className="event-grid">
                  {events.map((event, i) => (
                    <EventCard
                      key={event.id}
                      event={event}
                      index={i}
                      onSelect={select}
                    />
                  ))}
                </div>
              )}
              {total > 9 && (
                <div className="pagination">
                  <button
                    className="secondary"
                    disabled={page === 1}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    ← Précédent
                  </button>
                  <span>
                    Page {page} / {Math.ceil(total / 9)}
                  </span>
                  <button
                    className="secondary"
                    disabled={page * 9 >= total}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Suivant →
                  </button>
                </div>
              )}
            </section>
            <section className="manifesto">
              <span className="manifesto-symbol" aria-hidden="true">
                ✳
              </span>
              <div>
                <p className="eyebrow">POUR LES ORGANISATEURS</p>
                <h2>
                  Vous créez l’événement.
                  <br />
                  On s’occupe des places.
                </h2>
                <p>
                  Un espace pour publier vos événements et accueillir votre
                  public.
                </p>
              </div>
              <button
                className="primary"
                onClick={() =>
                  user?.role === "ORGANISATEUR"
                    ? setTab("staff")
                    : setNotice(
                        "Un administrateur peut attribuer le rôle organisateur à votre compte.",
                      )
                }
              >
                Créer des moments ↗
              </button>
            </section>
          </>
        ) : tab === "orders" && user ? (
          <OrdersPanel />
        ) : user ? (
          <StaffPanel user={user} />
        ) : null}
      </main>
      <footer>
        <a className="brand" href="/">
          ticket<span>rush</span>
          <span className="brand-dot">●</span>
        </a>
        <span>Moins d’attente. Plus de moments.</span>
        <span className="muted">Démonstration locale · Paiements simulés</span>
      </footer>
      {auth && <AuthDialog onClose={() => setAuth(false)} onUser={setUser} />}
      {assistantOpen && (
        <AssistantDialog onClose={() => setAssistantOpen(false)} />
      )}
      {selected && (
        <ReservationDialog
          event={selected}
          onClose={() => setSelected(null)}
          onPaid={() => {
            setTab("orders");
            setNotice(
              "Paiement confirmé. Vos billets arrivent dans quelques instants.",
            );
          }}
        />
      )}
    </>
  );
}
