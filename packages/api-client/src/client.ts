import type { components } from "./schema";
export type User = components["schemas"]["User"];
export type CsvImportReport = components["schemas"]["CsvImportReport"];
export type Category = components["schemas"]["Category"];
export type Event = components["schemas"]["Event"];
export type Hold = components["schemas"]["Hold"];
export type Ticket = components["schemas"]["Ticket"];
export type Order = components["schemas"]["Order"];
export interface Page<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}
let token: string | undefined;
let refreshing: Promise<void> | undefined;
export function setToken(value: string | undefined) {
  token = value;
}
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public correlationId?: string,
  ) {
    super(message);
  }
}
export async function refresh() {
  if (!refreshing)
    refreshing = (async () => {
      const res = await fetch("/api/auth/refresh", {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        token = undefined;
        throw new ApiError("Connectez-vous pour continuer.", res.status);
      }
      const body = (await res.json()) as { accessToken: string };
      token = body.accessToken;
    })().finally(() => {
      refreshing = undefined;
    });
  return refreshing;
}
export async function api<T>(
  path: string,
  options: RequestInit = {},
  retry = true,
): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !headers.has("content-type"))
    headers.set("content-type", "application/json");
  if (token) headers.set("authorization", `Bearer ${token}`);
  const response = await fetch(`/api${path}`, {
    ...options,
    headers,
    credentials: "include",
  });
  if (response.status === 401 && retry && !path.startsWith("/auth/")) {
    await refresh();
    return api<T>(path, options, false);
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      message?: string;
      correlationId?: string;
    };
    throw new ApiError(
      body.message ?? "La requête a échoué.",
      response.status,
      body.correlationId,
    );
  }
  return response.json() as Promise<T>;
}
export async function downloadTicket(id: string) {
  if (!token) await refresh();
  const response = await fetch(`/api/tickets/${encodeURIComponent(id)}/pdf`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (response.status === 401) {
    await refresh();
    return downloadTicketOnce(id);
  }
  if (!response.ok)
    throw new ApiError(
      "Le billet n’est pas encore disponible.",
      response.status,
    );
  save(await response.blob(), id);
}
async function downloadTicketOnce(id: string) {
  const res = await fetch(`/api/tickets/${encodeURIComponent(id)}/pdf`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new ApiError("Téléchargement impossible.", res.status);
  save(await res.blob(), id);
}
function save(blob: Blob, id: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `ticket-${id}.pdf`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
