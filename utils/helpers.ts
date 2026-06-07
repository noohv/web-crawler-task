import type { Page } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import { IDENTIFIED_PATHS_FILE_PATH } from "./config";

export type IdentifiedPath = {
  /**
   * Pathname only (no origin, no query string).
   *
   * Example: `/ae-en/automatic-qa-test-pipe-13-may-ph/2-test`
   */
  path: string; // pathname only

  /**
   * Representative full URL for this pathname.
   *
   * Example: `https://fasting.best.me/.../2-test/`
   */
  representativeUrl: string; // full URL
};

/**
 * Read `out/identified_paths.json` (or another path if `filePath` is provided).
 */
export async function readIdentifiedPaths(
  filePath: string = IDENTIFIED_PATHS_FILE_PATH,
): Promise<IdentifiedPath[]> {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw) as IdentifiedPath[];
}

/**
 * Write JSON to `out/<fileName>` using stable pretty formatting.
 */
export async function writeJsonToOut<T>(fileName: string, data: T) {
  await fs.mkdir(path.join("out"), { recursive: true });
  await fs.writeFile(path.join("out", fileName), JSON.stringify(data, null, 2));
}

/**
 * Convert a URL pathname into a filename-safe "slug".
 *
 * Example: `/ae-en/.../20-test` -> `ae-en-...-20-test`
 */
export function toSafeSlug(inputPath: string): string {
  // e.g. /ae-en/.../20-test -> ae-en-...-20-test
  return inputPath
    .replace(/^\/+/, "")
    .replace(/\/+/g, "-")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .toLowerCase();
}

/**
 * Navigate to `url` and wait until the page is ready to interact.
 */
export async function navigateToUrl(page: Page, url: string): Promise<void> {
  await page.goto(url, {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });
}

/**
 * Reload the current page and wait for DOM readiness.
 */
export async function reloadPage(page: Page): Promise<void> {
  await page.reload({ waitUntil: "domcontentloaded", timeout: 30000 });
}
