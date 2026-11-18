// Nothing personal or local goes into the site: no absolute home paths, no private keys, and the demo key is
// read only on the server.

import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));
const files = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    if (["node_modules", ".next", ".vercel"].includes(name) || name.startsWith("._")) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(ts|tsx|mjs|css|json|py|svg)$/.test(name) && name !== "package-lock.json") files.push(p);
  }
};
walk(root);

test("no local paths and no keys in the site's files", () => {
  for (const f of files) {
    const text = readFileSync(f, "utf8");
    assert.doesNotMatch(text, /\/Users\/|\/Volumes\/|[A-Z]:\\\\Users/, f);
    assert.doesNotMatch(text, /0x[0-9a-fA-F]{64}(?![0-9a-fA-F])["'`]/, f);
  }
});

test("DEMO_KEY is read only by the server and the hand-run tool", () => {
  const readers = files.filter((f) => /process\.env\.DEMO_KEY/.test(readFileSync(f, "utf8"))).map((f) => f.slice(root.length));
  assert.deepEqual(readers.sort(), ["lib/demo-server.ts"]);
});
