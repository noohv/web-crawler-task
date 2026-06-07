import { test, expect } from "@playwright/test";
import { crawlIdentifiedPaths } from "../utils/crawl";
import { defaultCrawlConfig } from "../utils/config";
import { writeJsonToOut } from "../utils/helpers";

test("Task test pipeline", async ({ page }) => {
  // Step 1: Crawl & Identify paths
  const identifiedPaths = await crawlIdentifiedPaths(page, defaultCrawlConfig);

  // Step 2: Document
  await writeJsonToOut("identified_paths.json", identifiedPaths);
  console.log(identifiedPaths.map((path) => path.path));
  expect(identifiedPaths.length).toBeGreaterThan(0);
});
