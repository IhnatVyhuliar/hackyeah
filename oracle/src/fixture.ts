// Runs the model + decide() on local files, without the chain.
//   pnpm --filter oracle fixture fixtures/stain [fixtures/cut ...] [--runs 3]
//   pnpm --filter oracle fixture --all [--runs 3]
//   pnpm --filter oracle fixture fixtures/stain --unboxing my-video.mp4 [--packing other.mp4]
// Case directory: metadata.json, complaint.json, expected.json:
//   { "verdict": "BUYER" | "SELLER", "tracking_number"?: string,
//     "media"?: { "packing": "x.mp4", "unboxing": "y.mp4", "photos": ["z.jpg"] } }
// Media named in expected.json live in fixtures/_media; without "media" the case directory must
// contain packing.mp4, unboxing.mp4 and photo-*.jpg itself.
import { existsSync } from "node:fs";
import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { decide } from "./decide.ts";
import { analyzeWithRetry } from "./gemini.ts";
import type { Complaint, ListingMetadata } from "./evidence.ts";
import type { Verdict } from "./report.ts";

interface Expected {
  verdict: Verdict;
  tracking_number?: string;
  media?: { packing: string; unboxing: string; photos?: string[] };
}

const args = process.argv.slice(2);
const valueOf = (flag: string) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};
const runs = Number(valueOf("--runs") ?? 1);
// Try any video file on a case without editing its JSON.
const override = { packing: valueOf("--packing"), unboxing: valueOf("--unboxing") };
const flagValues = new Set(["--runs", "--packing", "--unboxing"].map((f) => args.indexOf(f) + 1).filter((i) => i > 0));
const positional = args.filter((a, i) => !a.startsWith("--") && !flagValues.has(i));

let dirs = positional;
if (args.includes("--all")) {
  const root = positional[0] ?? "fixtures";
  dirs = (await readdir(root, { withFileTypes: true }))
    .filter((d) => d.isDirectory() && !d.name.startsWith("_"))
    .map((d) => join(root, d.name))
    .sort();
}
if (!dirs.length) {
  console.error("usage: pnpm fixture <dir>... [--runs N] [--unboxing file.mp4] [--packing file.mp4] | pnpm fixture --all [--runs N]");
  process.exit(2);
}

async function loadCase(dir: string) {
  const readJson = async <T>(name: string) => JSON.parse(await readFile(join(dir, name), "utf8")) as T;
  const expected = await readJson<Expected>("expected.json");
  const mediaDir = join(dirname(dir), "_media");
  const packingPath = override.packing ?? (expected.media ? join(mediaDir, expected.media.packing) : join(dir, "packing.mp4"));
  const unboxingPath = override.unboxing ?? (expected.media ? join(mediaDir, expected.media.unboxing) : join(dir, "unboxing.mp4"));
  const photoPaths = expected.media
    ? (expected.media.photos ?? []).map((p) => join(mediaDir, p))
    : (await readdir(dir)).filter((f) => /^photo-.*\.(jpe?g|png|webp)$/i.test(f)).sort().map((f) => join(dir, f));
  const missing = [packingPath, unboxingPath, ...photoPaths].filter((p) => !existsSync(p));
  if (missing.length) return { missing };
  return {
    missing,
    expected,
    input: {
      metadata: await readJson<ListingMetadata>("metadata.json"),
      complaint: await readJson<Complaint>("complaint.json"),
      trackingNumber: expected.tracking_number ?? "",
      packing: await readFile(packingPath),
      unboxing: await readFile(unboxingPath),
      photos: await Promise.all(photoPaths.map(async (p) => ({ path: basename(p), bytes: await readFile(p) }))),
    },
    media: { packing: basename(packingPath), unboxing: basename(unboxingPath) },
  };
}

await mkdir("out", { recursive: true });
const summary: { name: string; expected: string; results: string[] }[] = [];

for (const dir of dirs) {
  const name = basename(dir);
  const c = await loadCase(dir);
  if (!c.expected || !c.input) {
    console.log(`[fixture] ${name}: SKIPPED, missing ${c.missing.map((m) => basename(m)).join(", ")}`);
    summary.push({ name, expected: "?", results: ["missing media"] });
    continue;
  }
  console.log(`[fixture] ${name}: ${c.media.packing} + ${c.media.unboxing}, ${c.input.photos.length} photos, expected ${c.expected.verdict}`);
  const row = { name, expected: c.expected.verdict, results: [] as string[] };
  summary.push(row);
  for (let i = 1; i <= runs; i++) {
    try {
      const res = await analyzeWithRetry(c.input);
      const verdict = decide(res.report);
      const ok = verdict === c.expected.verdict;
      row.results.push(ok ? `${verdict} ✓` : `${verdict} ✗`);
      const outPath = join("out", `${name}-run${i}-${Date.now()}.json`);
      await writeFile(outPath, JSON.stringify({ verdict, expected: c.expected.verdict, ...res }, null, 2));
      console.log(
        `[fixture] ${name} run ${i}/${runs}: ${verdict} ${ok ? "✓" : `✗ (expected ${c.expected.verdict})`}` +
          ` | ${res.model} ${res.promptVersion} | ${JSON.stringify(res.timings)} | tokens ${JSON.stringify(res.usage)} | ${outPath}`,
      );
      console.log(`  reasoning: ${res.report.reasoning}`);
    } catch (e) {
      row.results.push("error");
      console.log(`[fixture] ${name} run ${i}/${runs}: ERROR ${(e as Error).message.slice(0, 200)}`);
    }
  }
}

console.log("\n[fixture] summary");
for (const r of summary) console.log(`  ${r.name.padEnd(12)} expected ${r.expected.padEnd(6)} → ${r.results.join(", ")}`);
const allGreen = summary.every((r) => r.results.length > 0 && r.results.every((x) => x.endsWith("✓")));
process.exit(allGreen ? 0 : 1);
