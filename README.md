# Web Crawler Task

## Install

1. Install dependencies:
   ```bash
   npm install
   ```
2. (Optional) Install Playwright browsers (usually needed on fresh machines):
   ```bash
   npx playwright install
   ```

## Run

Run the full Playwright pipeline test (crawl -> document paths -> capture screenshots -> validate text):

```bash
npx playwright test tests/task-test.spec.ts
```

Run headed mode:

```bash
npx playwright test --headed
```

## Outputs

The pipeline writes results to `out/`, including:

- `out/identified_paths.json` (the discovered wizard step URL paths)
- `out/step_local_storage.json` (cached `localStorage` snapshots used to render each step)
- `out/screenshots_manifest.json` (screenshots mapping)
- `out/validation_report.json` (language + spelling validation results)

## Time spent

- Total: 2h 15m
  - Step 1: Crawl & Identify: 60m
  - Step 2: Document: 15m
  - Step 3: Capture: 25m
  - Step 4: Validate (Language & Spelling): 30m
  - README and documentation: 5m
