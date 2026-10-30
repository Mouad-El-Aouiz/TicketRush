"use client";
import { useState, type FormEvent } from "react";
import { api, type CsvImportReport as Report } from "@ticketrush/api-client";
export default function CsvImport({
  onImported,
}: {
  onImported: () => Promise<void>;
}) {
  const [report, setReport] = useState<Report>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const file = data.get("csv");
    if (!(file instanceof File) || !file.size) {
      setError("Choisissez un fichier CSV.");
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setError("Le fichier dépasse 20 Mo.");
      return;
    }
    setBusy(true);
    setReport(undefined);
    setError("");
    try {
      setReport(
        await api<Report>("/imports/events", {
          method: "POST",
          headers: { "content-type": "text/csv" },
          body: file,
        }),
      );
    } catch (err) {
      setError(
        (err instanceof Error ? err.message : "Import impossible.") +
          " Consultez les brouillons avant de relancer : les lots déjà importés sont conservés.",
      );
    } finally {
      setBusy(false);
      await onImported();
    }
  }
  return (
    <form className="panel" onSubmit={(e) => void submit(e)}>
      <h2>Importer des événements</h2>
      <p className="muted">
        Les lignes valides créent des brouillons avec une catégorie.
        Vérifiez-les avant publication. Un nouvel envoi crée de nouveaux
        brouillons.
      </p>
      <p>
        <a href="/events-template.csv" download>
          Télécharger le modèle CSV
        </a>{" "}
        — UTF-8, virgules, dates UTC, prix en centimes ; 20 Mo maximum.
      </p>
      <label>
        Fichier CSV
        <input
          name="csv"
          type="file"
          accept=".csv,text/csv"
          disabled={busy}
          required
        />
      </label>
      <button className="secondary" disabled={busy}>
        {busy ? "Import en cours…" : "Importer les brouillons"}
      </button>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {report && (
        <div role="status">
          <p>
            {report.imported} brouillons importés ; {report.rejected} lignes
            refusées.
          </p>
          {report.errors.length > 0 && (
            <details>
              <summary>
                Voir les erreurs
                {report.errorsTruncated
                  ? " (rapport limité à 1 000 erreurs)"
                  : ""}
              </summary>
              <ul>
                {report.errors.map((row) => (
                  <li key={row.line}>
                    Ligne {row.line} : {row.message}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </form>
  );
}
