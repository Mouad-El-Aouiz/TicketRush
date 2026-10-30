import type { Event } from "@ticketrush/api-client";
export const money = (cents: number) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(
    cents / 100,
  );
export default function EventCard({
  event,
  index,
  onSelect,
}: {
  event: Event;
  index: number;
  onSelect: (e: Event) => void;
}) {
  const date = new Date(event.startsAt);
  const price = event.categories.length
    ? Math.min(...event.categories.map((c) => c.priceCents))
    : 0;
  return (
    <article className="event-card">
      <button
        className={`event-art art-${index % 4}`}
        onClick={() => onSelect(event)}
        aria-label={`Découvrir ${event.title}`}
      >
        <span className="art-tag">EXPÉRIENCE LIVE</span>
        <span className="art-orbit" aria-hidden="true" />
        <span className="art-word">
          {["LIVE.", "FEEL.", "MEET.", "MOVE."][index % 4]}
        </span>
        <span className="art-footer">
          TICKETRUSH PRESENTS <span>↗</span>
        </span>
      </button>
      <div className="card-body">
        <div className="date-box">
          <strong>{date.getDate().toString().padStart(2, "0")}</strong>
          <span>{date.toLocaleDateString("fr-FR", { month: "short" })}</span>
        </div>
        <div className="event-copy">
          <h3>{event.title}</h3>
          <p>{event.venue}</p>
          <p>
            {date.toLocaleDateString("fr-FR", {
              weekday: "short",
              day: "numeric",
              month: "long",
            })}{" "}
            ·{" "}
            {date.toLocaleTimeString("fr-FR", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        </div>
      </div>
      <div className="card-bottom">
        <span>
          À partir de <strong>{money(price)}</strong>
        </span>
        <button
          className="circle-button"
          onClick={() => onSelect(event)}
          aria-label={`Réserver ${event.title}`}
        >
          ↗
        </button>
      </div>
    </article>
  );
}
