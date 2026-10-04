/* Builds the admin console on its own, for a separate deployment such as
   admin.zimilive.in. Output: admin-site/dist/index.html. The phone app never
   contains this file, and the public site leaves it out when INCLUDE_ADMIN=0.
   Plain Node, no dependencies. See docs/ADMIN.md. */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "admin-site/dist");
mkdirSync(out, { recursive: true });
writeFileSync(join(out, "index.html"), readFileSync(join(root, "web/admin.html"), "utf8"));
console.log("built admin-site/dist/index.html");
