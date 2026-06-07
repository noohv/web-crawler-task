import fs from "node:fs/promises";
import path from "node:path";
import type { Page } from "@playwright/test";
import {
  defaultCrawlConfig,
  IDENTIFIED_PATHS_FILE_PATH,
  SCREENSHOTS_DIR_PATH,
  SCREENSHOTS_MANIFEST_FILE_NAME,
} from "./config";
import {
  type IdentifiedPath,
  navigateToUrl,
  readIdentifiedPaths,
  reloadPage,
  toSafeSlug,
} from "./helpers";
import {
  applyPipeStoreKey,
  buildLocalStorageByPath,
  buildPipeStoreKey,
  loadStepLocalStorageCacheStrict,
} from "./stepLocalStorageCache";
import { writeJsonToOut } from "./helpers";

async function loadIdentifiedItems(): Promise<IdentifiedPath[]> {
  const items = await readIdentifiedPaths(IDENTIFIED_PATHS_FILE_PATH);
  if (items.length === 0)
    throw new Error("No identified paths found to screenshot.");
  return items;
}

async function initScreenshotsRun(args: {
  page: Page;
  items: IdentifiedPath[];
}): Promise<{
  screenshotsDir: string;
  pipeStoreKey: string;
  localStorageByPath: Map<string, string | null>;
}> {
  const { page, items } = args;

  const screenshotsDir = SCREENSHOTS_DIR_PATH;
  await fs.mkdir(screenshotsDir, { recursive: true });
  await page.setViewportSize({ width: 1280, height: 720 });

  const requiredPaths = new Set(items.map((i) => i.path));
  const pipeStoreKey = buildPipeStoreKey(defaultCrawlConfig.requiredPathPrefix);

  const cache = await loadStepLocalStorageCacheStrict({
    expectedPipeStoreKey: pipeStoreKey,
    requiredPaths,
  });

  const localStorageByPath = buildLocalStorageByPath(cache);
  return { screenshotsDir, pipeStoreKey, localStorageByPath };
}

async function screenshotOne(args: {
  page: Page;
  item: IdentifiedPath;
  screenshotsDir: string;
  pipeStoreKey: string;
  localStorageByPath: Map<string, string | null>;
}): Promise<{ representativeUrl: string; file: string }> {
  const { page, item, screenshotsDir, pipeStoreKey, localStorageByPath } = args;

  const lsValue = localStorageByPath.get(item.path) ?? null;
  if (!localStorageByPath.has(item.path)) {
    throw new Error(`Unexpected missing cache entry for ${item.path}`);
  }

  const fileSlug = toSafeSlug(item.path);
  const outFile = path.join(screenshotsDir, `${fileSlug}.png`);

  await navigateToUrl(page, item.representativeUrl);
  await applyPipeStoreKey(page, pipeStoreKey, lsValue);
  await reloadPage(page);
  await page.waitForTimeout(400);

  await page.screenshot({ path: outFile, fullPage: true });
  return {
    representativeUrl: item.representativeUrl,
    file: `${fileSlug}.png`,
  };
}

/**
 * Render and screenshot each discovered quiz step.
 *
 * Uses `out/identified_paths.json` plus `out/step_local_storage.json` to load
 * the correct wizard state deterministically for every path.
 */
export async function captureIdentifiedPages(page: Page): Promise<void> {
  /**
   * Screenshot each discovered step URL by:
   * 1) navigating to the representative URL,
   * 2) injecting the cached `localStorage` snapshot (pipe_store_* key),
   * 3) reloading so the wizard rehydrates from the snapshot,
   * 4) saving a full-page screenshot.
   */
  const items = await loadIdentifiedItems();
  const { screenshotsDir, pipeStoreKey, localStorageByPath } =
    await initScreenshotsRun({ page, items });

  const manifest: Record<string, { representativeUrl: string; file: string }> =
    {};

  for (const item of items) {
    manifest[item.path] = await screenshotOne({
      page,
      item,
      screenshotsDir,
      pipeStoreKey,
      localStorageByPath,
    });
  }

  await writeJsonToOut(SCREENSHOTS_MANIFEST_FILE_NAME, {
    count: items.length,
    items: manifest,
  });
}
