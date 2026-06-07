import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";
import { crawlIdentifiedPathsWithLocalStorageCache } from "../utils/crawl";
import {
  defaultCrawlConfig,
  IDENTIFIED_PATHS_FILE_NAME,
  SCREENSHOTS_DIR_PATH,
  STEP_LOCAL_STORAGE_FILE_NAME,
} from "../utils/config";
import { writeJsonToOut } from "../utils/helpers";
import { captureIdentifiedPages } from "../utils/captureIdentifiedPages";
import { validateLanguageSpelling } from "../utils/validateLanguageSpelling";

/**
 * End-to-end pipeline test:
 * 1) Crawl the wizard and discover desired step paths (+ localStorage snapshots)
 * 2) Write discovered paths to `out/identified_paths.json`
 * 3) Render each discovered step to screenshots (using cached localStorage)
 * 4) Validate language/spelling for each step and write `out/validation_report.json`
 */
test("Task test pipeline", async ({ page }) => {
  // Step 1: Crawl & Identify paths
  console.log("Step 1: Crawl & Identify paths");
  const { paths, stepLocalStorageCache } =
    await crawlIdentifiedPathsWithLocalStorageCache(page, defaultCrawlConfig);

  // Step 2: Document
  console.log("Step 2: Document");
  await writeJsonToOut(IDENTIFIED_PATHS_FILE_NAME, paths);
  console.log(paths.map((path) => path.path));
  expect(paths.length).toBeGreaterThan(0);
  await writeJsonToOut(STEP_LOCAL_STORAGE_FILE_NAME, stepLocalStorageCache);

  // Step 3: Capture screenshots
  console.log("Step 3: Capture screenshots");
  await captureIdentifiedPages(page);
  const screenshots = await fs.readdir(SCREENSHOTS_DIR_PATH);
  expect(screenshots.length).toBeGreaterThan(0);

  // Step 4: Validate language & spelling
  console.log("Step 4: Validate language & spelling");
  await validateLanguageSpelling(page);
});
