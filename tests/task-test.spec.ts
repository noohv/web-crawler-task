import { test, expect } from "@playwright/test";
import { crawlIdentifiedPaths } from "../utils/crawl";
import { defaultCrawlConfig } from "../utils/config";

test("Task test pipeline", async ({ page }) => {
  await crawlIdentifiedPaths(page, defaultCrawlConfig);
});
