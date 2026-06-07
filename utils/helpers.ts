import fs from "node:fs/promises";
import path from "node:path";

export async function writeJsonToOut<T>(fileName: string, data: T) {
  await fs.mkdir(path.join("out"), { recursive: true });
  await fs.writeFile(path.join("out", fileName), JSON.stringify(data, null, 2));
}
