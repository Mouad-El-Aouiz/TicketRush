import { cp, mkdir } from "node:fs/promises";
const target = new URL("../.next/standalone/apps/web/.next/", import.meta.url);
await mkdir(target, { recursive: true });
await cp(
  new URL("../.next/static/", import.meta.url),
  new URL("static/", target),
  { recursive: true },
);
await cp(
  new URL("../public/", import.meta.url),
  new URL("../public/", target),
  { recursive: true },
);
