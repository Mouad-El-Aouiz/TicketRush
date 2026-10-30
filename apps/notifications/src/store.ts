import * as sqlite from "node:sqlite";
// Node 26 renamed the constructor; the installed declarations retain its alias.
type SqliteDatabase = sqlite.DatabaseSync;
const SqliteConstructor =
  (sqlite as typeof sqlite & { Database?: typeof sqlite.DatabaseSync })
    .Database ?? sqlite.DatabaseSync;
import { createHash } from "node:crypto";
import { ticketsReady, inbox, type TicketsReady } from "@ticketrush/contracts";
export class EventConflictError extends Error {}
export class InboxStore {
  private readonly db: SqliteDatabase;
  constructor(path: string) {
    this.db = new SqliteConstructor(path);
    this.db.exec(
      "PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS receipts(id TEXT PRIMARY KEY, hash TEXT NOT NULL); CREATE TABLE IF NOT EXISTS inbox(id TEXT PRIMARY KEY, orderId TEXT NOT NULL UNIQUE, userId TEXT NOT NULL, message TEXT NOT NULL, createdAt TEXT NOT NULL); CREATE INDEX IF NOT EXISTS inbox_user ON inbox(userId,createdAt);",
    );
  }
  accept(input: unknown) {
    const event = ticketsReady.parse(input);
    const hash = createHash("sha256")
      .update(JSON.stringify(event))
      .digest("hex");
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const receipt = this.db
        .prepare("SELECT hash FROM receipts WHERE id=?")
        .get(event.eventId);
      if (receipt) {
        if (receipt.hash !== hash)
          throw new EventConflictError(
            "Event identifier reused with different payload",
          );
        this.db.exec("COMMIT");
        return false;
      }
      const result = this.db
        .prepare(
          "INSERT INTO inbox(id,orderId,userId,message,createdAt) VALUES(?,?,?,?,?) ON CONFLICT(orderId) DO NOTHING",
        )
        .run(
          event.eventId,
          event.orderId,
          event.userId,
          this.message(event),
          new Date().toISOString(),
        );
      this.db
        .prepare("INSERT INTO receipts(id,hash) VALUES(?,?)")
        .run(event.eventId, hash);
      this.db.exec("COMMIT");
      return Number(result.changes) > 0;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  private message(event: TicketsReady) {
    return `Your ${event.count} ticket(s) are ready. Download them from your orders.`;
  }
  list(userId: string) {
    return inbox.parse(
      this.db
        .prepare(
          "SELECT * FROM inbox WHERE userId=? ORDER BY createdAt DESC LIMIT 50",
        )
        .all(userId),
    );
  }
  close() {
    if (this.db.isOpen) this.db.close();
  }
}
