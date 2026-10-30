import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "TicketRush — Vivez le prochain moment",
  description:
    "Concerts, rencontres et expériences. Vos prochaines émotions commencent ici.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
