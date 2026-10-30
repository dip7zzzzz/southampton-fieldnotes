import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { resolve, dirname, extname, relative, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";

const project = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const directory = resolve(project, "dist");
const identity = createHash("sha256")
  .update(project.toLowerCase())
  .digest("hex")
  .slice(0, 16);
const port = Number(process.env.FIELDNOTES_PORT || 5173);
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};
const cache = new Map();
await stat(resolve(directory, "index.html")).catch(() => {
  throw new Error("The app has not been built. Run npm run build first.");
});
const server = createServer(async (request, response) => {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Robots-Tag", "noindex, nofollow");
  if (!["GET", "HEAD"].includes(request.method || "")) {
    response.writeHead(405);
    response.end();
    return;
  }
  let pathname;
  try {
    pathname = decodeURIComponent(
      new URL(request.url, "http://localhost").pathname,
    );
  } catch {
    response.writeHead(400);
    response.end("Invalid request");
    return;
  }
  if (pathname === "/__fieldnotes/health") {
    response.setHeader("Content-Type", mime[".json"]);
    response.end(
      JSON.stringify({
        app: "southampton-fieldnotes",
        identity,
        pid: process.pid,
      }),
    );
    return;
  }
  const path = resolve(
    directory,
    `.${pathname === "/" ? "/index.html" : pathname}`,
  );
  const within = relative(directory, path);
  if (
    within.startsWith("..") ||
    isAbsolute(within) ||
    pathname.includes("\\") ||
    pathname.includes("\0")
  ) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }
  try {
    const metadata = await stat(path);
    if (!metadata.isFile()) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }
    let entry = cache.get(path);
    if (
      !entry ||
      entry.modified !== metadata.mtimeMs ||
      entry.size !== metadata.size
    ) {
      const body = await readFile(path);
      entry = {
        body,
        modified: metadata.mtimeMs,
        size: metadata.size,
        gzip:
          body.length > 1024 &&
          [".html", ".js", ".mjs", ".css", ".json", ".svg"].includes(
            extname(path),
          )
            ? gzipSync(body)
            : null,
      };
      cache.set(path, entry);
    }
    response.setHeader(
      "Content-Type",
      mime[extname(path)] || "application/octet-stream",
    );
    response.setHeader("Cache-Control", "no-cache");
    response.setHeader("Vary", "Accept-Encoding");
    const compressed =
      entry.gzip && /\bgzip\b/.test(request.headers["accept-encoding"] || "");
    const body = compressed ? entry.gzip : entry.body;
    if (compressed) response.setHeader("Content-Encoding", "gzip");
    response.setHeader("Content-Length", body.length);
    response.writeHead(200);
    response.end(request.method === "HEAD" ? undefined : body);
  } catch {
    response.writeHead(404);
    response.end("Not found");
  }
});
server.on("error", (error) => {
  console.error(`Cannot start Fieldnotes: ${error.message}`);
  process.exitCode = 1;
});
server.listen(port, "127.0.0.1", () =>
  console.log(`Fieldnotes is ready: http://127.0.0.1:${port}/`),
);
