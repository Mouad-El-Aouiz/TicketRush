import { readFile, writeFile, access } from "node:fs/promises";
import { randomBytes } from "node:crypto";
const file = new URL("../.env", import.meta.url);
let text;
try {
  await access(file);
  text = await readFile(file, "utf8");
} catch {
  text = await readFile(new URL("../.env.example", import.meta.url), "utf8");
}
for (const key of [
  "POSTGRES_PASSWORD",
  "REDIS_PASSWORD",
  "RABBITMQ_PASSWORD",
]) {
  const pattern = new RegExp(`^${key}=(.*)$`, "m");
  const value = text.match(pattern)?.[1]?.trim();
  if (value) continue;
  const line = `${key}=${process.env[key] ?? randomBytes(32).toString("hex")}`;
  text = pattern.test(text)
    ? text.replace(pattern, line)
    : `${text}\n${line}\n`;
}
await writeFile(file, text);
console.log(
  "Local secrets initialized; existing values retained and not displayed.",
);
