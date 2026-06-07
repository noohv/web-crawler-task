import fs from "node:fs/promises";
import path from "node:path";
import { IDENTIFIED_PATHS_FILE_PATH } from "./config";

export type IdentifiedPath = {
  path: string; // pathname only
  representativeUrl: string; // full URL
};

export async function readIdentifiedPaths(
  filePath: string = IDENTIFIED_PATHS_FILE_PATH,
): Promise<IdentifiedPath[]> {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw) as IdentifiedPath[];
}

export async function writeJsonToOut<T>(fileName: string, data: T) {
  await fs.mkdir(path.join("out"), { recursive: true });
  await fs.writeFile(path.join("out", fileName), JSON.stringify(data, null, 2));
}

export function toSafeSlug(inputPath: string): string {
  // e.g. /ae-en/.../20-test -> ae-en-...-20-test
  return inputPath
    .replace(/^\/+/, "")
    .replace(/\/+/g, "-")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .toLowerCase();
}
