// Asks contracts/tender.py itself, through python3 and tests/unit/contract_oracle.py, with a stub for
// the GenLayer runtime: nothing is installed and nothing touches the network.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("./contract_oracle.py", import.meta.url));

export function askContract(request) {
  const run = spawnSync("python3", ["-I", script], { input: JSON.stringify(request), encoding: "utf8" });
  if (run.status !== 0) throw new Error("the contract oracle failed: " + (run.stderr || run.error));
  return JSON.parse(run.stdout);
}
