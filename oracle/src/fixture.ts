// Runs the model + decide() on local files, without the chain.
//   pnpm --filter oracle fixture fixtures/stain [--runs 3]
// Directory: metadata.json, photo-*.jpg, packing.mp4, unboxing.mp4, complaint.json, expected.json
// expected.json: { "verdict": "BUYER" | "SELLER", "tracking_number"?: string }
import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { decide } from "./decide.ts";
import { analyze } from "./gemini.ts";
import type { Complaint, ListingMetadata } from "./evidence.ts";
import type { Verdict } from "./report.ts";

const args = process.argv.slice(2);
const dir = args.find((a) => !a.startsWith("--"));
const runsIdx = args.indexOf("--runs");
const runs = runsIdx >= 0 ? Number(args[runsIdx + 1]) : 1;
if (!dir) {
  console.error("usage: pnpm fixture <dir> [--runs N]");
  process.exit(2);
}

const readJson = async <T>(name: string): Promise<T> => JSON.parse(await readFile(join(dir, name), "utf8")) as T;

const metadata = await readJson<ListingMetadata>("metadata.json");
const complaint = await readJson<Complaint>("complaint.json");
const expected = await readJson<{ verdict: Verdict; tracking_number?: string }>("expected.json");
const photoNames = (await readdir(dir)).filter((f) => /^photo-.*\.(jpe?g|png|webp)$/i.test(f)).sort();
const photos = await Promise.all(photoNames.map(async (p) => ({ path: p, bytes: await readFile(join(dir, p)) })));
const packing = await readFile(join(dir, "packing.mp4"));
const unboxing = await readFile(join(dir, "unboxing.mp4"));

const name = basename(dir);
console.log(`[fixture] ${name}: ${photos.length} photos, packing ${(packing.length / 1e6).toFixed(1)} MB, unboxing ${(unboxing.length / 1e6).toFixed(1)} MB, expected ${expected.verdict}`);

await mkdir("out", { recursive: true });
let failures = 0;
for (let i = 1; i <= runs; i++) {
  const res = await analyze({
    metadata,
    photos,
    trackingNumber: expected.tracking_number ?? "",
    packing,
    unboxing,
    complaint,
  });
  const verdict = decide(res.report);
  const ok = verdict === expected.verdict;
  if (!ok) failures++;
  const outPath = join("out", `${name}-run${i}-${Date.now()}.json`);
  await writeFile(outPath, JSON.stringify({ verdict, expected: expected.verdict, ...res }, null, 2));
  console.log(
    `[fixture] ${name} run ${i}/${runs}: ${verdict} ${ok ? "✓" : `✗ (expected ${expected.verdict})`}` +
      ` | ${res.model} | ${JSON.stringify(res.timings)} | tokens ${JSON.stringify(res.usage)} | ${outPath}`,
  );
  console.log(`  reasoning: ${res.report.reasoning}`);
}

console.log(`[fixture] ${name}: ${runs - failures}/${runs} matched`);
process.exit(failures ? 1 : 0);
