import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { refreshSnapshot } from "../src/lib/source-cache";
test("failed and malformed sources preserve the previous real snapshot byte-for-byte", async () => {
  await mkdir(".cache/source-tests", { recursive: true });
  const path = resolve(".cache/source-tests", `${randomUUID()}.json`);
  const old = JSON.stringify({
    retrievedAt: "2020-01-01T00:00:00Z",
    sourceUrl: "https://example.org/source",
    license: "OGL-3.0",
    payload: { observed: [1, 2, 3] },
  });
  await writeFile(path, old);
  const validate = (x: any) => {
    if (!x.observed?.length) throw new Error("Missing real observations");
  };
  try {
    for (const response of [
      new Response("Unavailable", { status: 503 }),
      Response.json({ observed: [] }),
      new Response("<html>error</html>"),
    ]) {
      const result = await refreshSnapshot({
        path,
        url: "https://example.org/source",
        intervalDays: 7,
        license: "OGL-3.0",
        validate,
        fetcher: (async () => response) as typeof fetch,
      });
      assert.equal(result.status, "retained");
      assert.equal(await readFile(path, "utf8"), old);
    }
  } finally {
    await unlink(path);
  }
});
test("missing source failure remains unavailable and fresh sources make no requests", async () => {
  await mkdir(".cache/source-tests", { recursive: true });
  const path = resolve(".cache/source-tests", `${randomUUID()}.json`);
  const validate = (x: any) => {
    if (!x.real) throw new Error("Missing data");
  };
  const unavailable = await refreshSnapshot({
    path,
    url: "https://example.org/source",
    intervalDays: 7,
    license: "OGL-3.0",
    validate,
    fetcher: (async () => new Response("", { status: 404 })) as typeof fetch,
  });
  assert.equal(unavailable.status, "unavailable");
  await writeFile(
    path,
    JSON.stringify({
      retrievedAt: new Date().toISOString(),
      sourceUrl: "https://example.org/source",
      license: "OGL-3.0",
      payload: { real: true },
    }),
  );
  try {
    let calls = 0;
    const result = await refreshSnapshot({
      path,
      url: "https://example.org/source",
      intervalDays: 7,
      license: "OGL-3.0",
      validate,
      fetcher: (async () => {
        calls++;
        throw new Error("Should not request");
      }) as typeof fetch,
    });
    assert.equal(result.status, "cached");
    assert.equal(calls, 0);
  } finally {
    await unlink(path);
  }
});

test("a future retrieval timestamp cannot suppress a refresh", async () => {
  await mkdir(".cache/source-tests", { recursive: true });
  const path = resolve(".cache/source-tests", `${randomUUID()}.json`);
  await writeFile(
    path,
    JSON.stringify({
      retrievedAt: "2099-01-01T00:00:00Z",
      sourceUrl: "https://example.org/source",
      license: "OGL-3.0",
      payload: { real: true },
    }),
  );
  try {
    let calls = 0;
    const result = await refreshSnapshot({
      path,
      url: "https://example.org/source",
      intervalDays: 7,
      license: "OGL-3.0",
      validate: (x) => {
        if (!x.real) throw Error("missing");
      },
      fetcher: (async () => {
        calls++;
        return Response.json({ real: true });
      }) as typeof fetch,
    });
    assert.equal(calls, 1);
    assert.equal(result.status, "updated");
  } finally {
    await unlink(path);
  }
});
