import { rename, writeFile } from "node:fs/promises";
// Windows readers and sync clients can briefly hold a file without share-delete.
// Retry the atomic swap; never truncate the last successful dataset in place.
export async function atomicWrite(path: string, contents: string) {
  const temporary = `${path}.tmp`;
  await writeFile(temporary, contents);
  for (let attempt = 0; ; attempt++) {
    try {
      await rename(temporary, path);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (attempt >= 7 || !["EPERM", "EACCES", "EBUSY"].includes(code ?? ""))
        throw error;
      await new Promise((resolve) => setTimeout(resolve, 200 * (attempt + 1)));
    }
  }
}
