"use client";
import { useState, type FormEvent } from "react";
import { api, setToken, type User } from "@ticketrush/api-client";
import Modal from "./modal";
export default function AuthDialog({
  onClose,
  onUser,
}: {
  onClose: () => void;
  onUser: (u: User) => void;
}) {
  const [register, setRegister] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(e.currentTarget);
    try {
      const result = await api<{ accessToken: string }>(
        `/auth/${register ? "register" : "login"}`,
        {
          method: "POST",
          body: JSON.stringify({
            email: form.get("email"),
            password: form.get("password"),
          }),
        },
      );
      setToken(result.accessToken);
      onUser(await api<User>("/auth/me"));
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connexion impossible.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal onClose={onClose}>
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-title"
        className="dialog"
      >
        <button className="close" aria-label="Fermer" onClick={onClose}>
          ×
        </button>
        <p className="eyebrow">LE PROCHAIN MOMENT VOUS ATTEND</p>
        <h2 id="auth-title">
          {register
            ? "Bienvenue dans la communauté."
            : "Heureux de vous retrouver."}
        </h2>
        <p className="muted">
          {register
            ? "Créez votre compte pour réserver vos places."
            : "Connectez-vous pour retrouver vos billets."}
        </p>
        <form onSubmit={submit}>
          <label>
            Adresse email
            <input
              autoFocus
              name="email"
              type="email"
              autoComplete="email"
              required
            />
          </label>
          <label>
            Mot de passe
            <input
              name="password"
              type="password"
              minLength={12}
              maxLength={128}
              autoComplete={register ? "new-password" : "current-password"}
              required
            />
            <small>12 caractères minimum.</small>
          </label>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <button className="primary wide" disabled={busy}>
            {busy
              ? "Un instant…"
              : register
                ? "Créer mon compte"
                : "Me connecter"}
          </button>
        </form>
        <button
          className="text-button"
          onClick={() => {
            setRegister(!register);
            setError("");
          }}
        >
          {register
            ? "Déjà membre ? Se connecter"
            : "Première visite ? Créer un compte"}
        </button>
      </section>
    </Modal>
  );
}
