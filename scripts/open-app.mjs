import { spawn, spawnSync } from "node:child_process";
import {
  mkdirSync,
  openSync,
  closeSync,
  existsSync,
  writeFileSync,
} from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const project = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const identity = createHash("sha256")
  .update(project.toLowerCase())
  .digest("hex")
  .slice(0, 16);
const noBrowser = process.argv.includes("--no-browser");
const ports = [5173, 5175, 4173];
async function health(port) {
  try {
    const r = await fetch(`http://127.0.0.1:${port}/__fieldnotes/health`, {
      signal: AbortSignal.timeout(700),
    });
    const j = await r.json();
    return j.app === "southampton-fieldnotes" && j.identity === identity
      ? j
      : null;
  } catch {
    return null;
  }
}
let active;
for (const port of ports) {
  const state = await health(port);
  if (state) {
    active = { port, ...state };
    break;
  }
}
if (!active) {
  if (!existsSync(resolve(project, "dist/index.html"))) {
    console.log("Preparing Fieldnotes for its first launch…");
    const built = spawnSync(
      process.platform === "win32" ? "npm.cmd" : "npm",
      ["run", "build"],
      { cwd: project, stdio: "inherit", shell: process.platform === "win32" },
    );
    if (built.status !== 0)
      throw new Error("The app could not be built. See the message above.");
  }
  mkdirSync(resolve(project, ".cache"), { recursive: true });
  for (const port of ports) {
    const log = openSync(resolve(project, ".cache/local-server.log"), "a");
    const child = spawn(
      process.execPath,
      [resolve(project, "scripts/local-server.mjs")],
      {
        cwd: project,
        env: { ...process.env, FIELDNOTES_PORT: String(port) },
        detached: true,
        windowsHide: true,
        stdio: ["ignore", log, log],
      },
    );
    child.unref();
    closeSync(log);
    for (let attempt = 0; attempt < 30; attempt++) {
      const state = await health(port);
      if (state) {
        active = { port, ...state };
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    if (active) break;
  }
  if (!active)
    throw new Error(
      "Could not start the app. Details are in .cache/local-server.log.",
    );
}
writeFileSync(
  resolve(project, ".cache/local-server.json"),
  JSON.stringify({ ...active, startedAt: new Date().toISOString() }, null, 2),
);
const url = `http://127.0.0.1:${active.port}/`;
console.log(`Fieldnotes is running: ${url}`);
console.log(
  "You can close this launcher. The local app stays available until the computer restarts.",
);
if (!noBrowser) {
  const command =
    process.platform === "win32"
      ? "rundll32.exe"
      : process.platform === "darwin"
        ? "open"
        : "xdg-open";
  const args =
    process.platform === "win32" ? ["url.dll,FileProtocolHandler", url] : [url];
  const browser = spawn(command, args, {
    detached: true,
    windowsHide: true,
    stdio: "ignore",
  });
  browser.unref();
}
