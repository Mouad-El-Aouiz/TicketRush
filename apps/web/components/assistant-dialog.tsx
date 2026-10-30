"use client";
import { useEffect, useState, type FormEvent } from "react";
import { api } from "@ticketrush/api-client";
import Modal from "./modal";

type Answer = {
  answer: string;
  citations: Array<{ sourceId: string; title: string }>;
  suggestedQuestions: string[];
};

export default function AssistantDialog({ onClose }: { onClose: () => void }) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void api<{ enabled: boolean }>("/assistant/status")
      .then((status) => setEnabled(status.enabled))
      .catch(() => setEnabled(false));
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setAnswer(null);
    try {
      setAnswer(
        await api<Answer>("/assistant/ask", {
          method: "POST",
          body: JSON.stringify({ question }),
        }),
      );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Réponse indisponible.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal onClose={onClose}>
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="assistant-title"
        className="dialog assistant-dialog"
      >
        <button className="close" aria-label="Fermer" onClick={onClose}>
          ×
        </button>
        <p className="eyebrow">AIDE LOCALE · DOCUMENTS ET ÉVÉNEMENTS PUBLICS</p>
        <h2 id="assistant-title">Une question sur TicketRush ?</h2>
        <p className="muted">
          L’assistant consulte les règles du service et le catalogue public.
        </p>
        {enabled === false ? (
          <p className="assistant-disabled" role="status">
            L’assistant est désactivé. Configurez Ollama localement et démarrez
            le profil IA pour l’activer.
          </p>
        ) : (
          <form onSubmit={submit}>
            <label>
              Votre question
              <textarea
                autoFocus
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                minLength={3}
                maxLength={500}
                placeholder="Comment retrouver mon billet ?"
                required
              />
            </label>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <button
              className="primary wide"
              disabled={busy || enabled === null}
            >
              {busy ? "Recherche locale…" : "Poser la question"}
            </button>
          </form>
        )}
        {answer && (
          <div className="assistant-answer" aria-live="polite">
            <h3>Réponse</h3>
            <p>{answer.answer}</p>
            {answer.citations.length > 0 && (
              <div>
                <strong>Sources</strong>
                <ul>
                  {answer.citations.map((citation) => (
                    <li key={citation.sourceId}>{citation.title}</li>
                  ))}
                </ul>
              </div>
            )}
            {answer.suggestedQuestions.length > 0 && (
              <div className="assistant-suggestions">
                <strong>Questions associées</strong>
                {answer.suggestedQuestions.map((suggestion) => (
                  <button
                    className="text-button"
                    key={suggestion}
                    onClick={() => setQuestion(suggestion)}
                    type="button"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </section>
    </Modal>
  );
}
