import { writeFile, mkdir } from "node:fs/promises";
import { mergeHistory } from "../shared/browser-snapshot";
import { snapshotSchema } from "../shared/catalog";
import { readBounded } from "../analytics/http";
import { mcpSnapshotFiles } from "../shared/mcp-snapshot";
const origin = "https://darkstarstrix.github.io/gpu-price-tracker/data/";
async function get(file: string, maxBytes: number) {
  const r = await fetch(origin + file, {
    signal: AbortSignal.timeout(60000),
    redirect: "error",
  });
  if (!r.ok) throw new Error(`Published ${file} HTTP ${r.status}`);
  return JSON.parse(await readBounded(r, maxBytes));
}
// Retry the publication race once; never combine generations or fall back to invented data.
let snapshot;
for (let attempt = 0; attempt < 2; attempt++) {
  const current = snapshotSchema.parse(await get("current.json", 4000000));
  const history = await get("history.json", 64000000);
  try {
    snapshot = mergeHistory(current, history);
    break;
  } catch (error) {
    if (attempt === 1) throw error;
  }
}
if (!snapshot) throw new Error("No coherent snapshot");
const files = await mcpSnapshotFiles(snapshot);
for (const file of files) {
  await mkdir(
    new URL(
      "../mcp/.data/" + file.name.split("/").slice(0, -1).join("/") + "/",
      import.meta.url
    ),
    { recursive: true }
  );
  await writeFile(
    new URL("../mcp/.data/" + file.name, import.meta.url),
    file.content
  );
}
console.log(
  JSON.stringify({
    snapshotAt: snapshot.generatedAt,
    files: files.length,
    offers: snapshot.offers.length,
    historyPoints: snapshot.history.length,
    dataMode: "pinned-development-snapshot",
  })
);
