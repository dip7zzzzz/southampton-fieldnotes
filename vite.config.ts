import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
// Keep transient dependency rewrites outside Dropbox's file-sync locks.
export default defineConfig({
  base:
    process.env.FIELDNOTES_PAGES === "true" ? "/southampton-fieldnotes/" : "/",
  cacheDir: join(
    tmpdir(),
    `southampton-vite-${createHash("sha256").update(process.cwd()).digest("hex").slice(0, 10)}`,
  ),
  plugins: [react()],
  build: { chunkSizeWarningLimit: 1500 },
});
