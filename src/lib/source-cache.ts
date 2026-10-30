import { readFile } from "node:fs/promises";
import { atomicWrite } from "./atomic-file";
export interface Snapshot {
  retrievedAt: string;
  sourceUrl: string;
  reference?: string;
  license: string;
  payload: unknown;
}
export interface CacheResult {
  status: "cached" | "updated" | "retained" | "unavailable";
  retrievedAt?: string;
  error?: string;
}
export async function refreshSnapshot(options: {
  path: string;
  url: string;
  intervalDays: number;
  license: string;
  validate: (value: any) => void;
  force?: boolean;
  reference?: string;
  asText?: boolean;
  fetcher?: typeof fetch;
}): Promise<CacheResult> {
  const {
    path,
    url,
    intervalDays,
    license,
    validate,
    force,
    reference,
    asText,
  } = options;
  let old: Snapshot | undefined;
  try {
    old = JSON.parse(await readFile(path, "utf8"));
    validate(old!.payload);
  } catch {
    old = undefined;
  }
  if (
    !force &&
    old &&
    old.sourceUrl === url &&
    Date.parse(old.retrievedAt) <= Date.now() &&
    Date.now() - Date.parse(old.retrievedAt) < intervalDays * 86400000
  )
    return { status: "cached", retrievedAt: old.retrievedAt };
  try {
    const response = await (options.fetcher ?? fetch)(url, {
      headers: {
        "User-Agent":
          "SouthamptonFieldnotes/0.1 (personal open-data activity research)",
      },
      signal: AbortSignal.timeout(180000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = asText
      ? { text: await response.text() }
      : await response.json();
    validate(payload);
    const snapshot: Snapshot = {
      retrievedAt: new Date().toISOString(),
      sourceUrl: url,
      reference,
      license,
      payload,
    };
    await atomicWrite(path, JSON.stringify(snapshot));
    return { status: "updated", retrievedAt: snapshot.retrievedAt };
  } catch (error) {
    return {
      status: old ? "retained" : "unavailable",
      error: String(error),
      retrievedAt: old?.retrievedAt,
    };
  }
}
