import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GoogleGenAI } from "@google/genai";
import { MODEL_REPORT_SCHEMA, parseModelReport, type ModelReport, type TokenUsage } from "./report.ts";
import type { Complaint, ListingMetadata } from "./evidence.ts";

export const PROMPT_VERSION = "v1";

export interface AnalysisInput {
  metadata: ListingMetadata;
  photos: { path: string; bytes: Uint8Array }[];
  trackingNumber: string;
  packing: Uint8Array;
  unboxing: Uint8Array;
  complaint: Complaint;
}

export interface AnalysisResult {
  report: ModelReport;
  model: string;
  promptVersion: string;
  usage: TokenUsage | null;
  timings: Record<string, number>;
}

const env = (name: string): string => {
  const v = process.env[name];
  if (!v) throw new Error(`missing env ${name}`);
  return v;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function imageMime(path: string): string {
  const p = path.toLowerCase();
  if (p.endsWith(".png")) return "image/png";
  if (p.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}

let cachedPrompt: string | null = null;
async function systemPrompt(): Promise<string> {
  cachedPrompt ??= await readFile(new URL(`../prompts/${PROMPT_VERSION}.md`, import.meta.url), "utf8");
  return cachedPrompt;
}

// Upload a video through the Files API and wait until it leaves PROCESSING.
async function uploadVideo(ai: GoogleGenAI, bytes: Uint8Array, name: string) {
  const dir = await mkdtemp(join(tmpdir(), "oracle-"));
  const path = join(dir, name);
  try {
    await writeFile(path, bytes);
    let file = await ai.files.upload({ file: path, config: { mimeType: "video/mp4" } });
    while (file.state === "PROCESSING") {
      await sleep(2000);
      file = await ai.files.get({ name: file.name! });
    }
    if (file.state === "FAILED") throw new Error(`Files API processing failed for ${name}`);
    return file;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function listingText(m: ListingMetadata): string {
  const defects = m.defects.length ? m.defects.map((d) => `- ${d}`).join("\n") : "(brak zgłoszonych wad)";
  return [
    `Tytuł: ${m.title}`,
    `Marka: ${m.brand}`,
    `Rozmiar: ${m.size}`,
    `Stan: ${m.condition}`,
    `Opis: ${m.description}`,
    `Lista wad ujawnionych przez sprzedającego:\n${defects}`,
  ].join("\n");
}

// Model ids to try, in order: GEMINI_MODEL, then GEMINI_FALLBACK_MODELS (comma-separated).
function modelChain(): string[] {
  const fallbacks = (process.env.GEMINI_FALLBACK_MODELS ?? "").split(",").map((m) => m.trim()).filter(Boolean);
  return [env("GEMINI_MODEL"), ...fallbacks.filter((m) => m !== process.env.GEMINI_MODEL)];
}

// 429 / 5xx: the model is overloaded or rate limited, so the next model in the chain may work.
function isOverloaded(e: unknown): boolean {
  const status = (e as { status?: number }).status;
  return status === 429 || (status !== undefined && status >= 500);
}

// Ask the model to fill the report. Videos are uploaded once; transient failures (429, 5xx,
// invalid JSON) are retried at most `retries` times, switching to a fallback model on overload.
// Throws when every attempt fails: the caller never guesses a verdict.
export async function analyzeWithRetry(input: AnalysisInput, retries = 2): Promise<AnalysisResult> {
  const ai = new GoogleGenAI({ apiKey: env("GEMINI_API_KEY") });
  const models = modelChain();
  const timings: Record<string, number> = {};
  const t0 = Date.now();

  const [packing, unboxing] = await Promise.all([
    uploadVideo(ai, input.packing, "packing.mp4"),
    uploadVideo(ai, input.unboxing, "unboxing.mp4"),
  ]);
  timings.upload_and_processing_ms = Date.now() - t0;

  const video = (f: typeof packing) => ({ type: "video" as const, uri: f.uri!, mime_type: f.mimeType! });
  const text = (t: string) => ({ type: "text" as const, text: t });
  const temperature = process.env.GEMINI_TEMPERATURE ? Number(process.env.GEMINI_TEMPERATURE) : undefined;
  const request = {
    store: false,
    system_instruction: await systemPrompt(),
    generation_config: {
      ...(temperature !== undefined ? { temperature } : {}),
      thinking_level: process.env.GEMINI_THINKING_LEVEL || "medium",
    },
    response_format: { type: "text" as const, mime_type: "application/json", schema: MODEL_REPORT_SCHEMA },
    input: [
      text("1. Ogłoszenie:"),
      text(listingText(input.metadata)),
      text(`2. Zdjęcia z ogłoszenia (${input.photos.length}):`),
      ...input.photos.map((p) => ({
        type: "image" as const,
        data: Buffer.from(p.bytes).toString("base64"),
        mime_type: imageMime(p.path),
      })),
      text(`3. Numer przesyłki zapisany przy nadaniu: ${input.trackingNumber || "(brak)"}`),
      text("4. Nagranie pakowania (sprzedający):"),
      video(packing),
      text("5. Nagranie otwarcia paczki (kupujący):"),
      video(unboxing),
      text(`6. Reklamacja kupującego (kategoria: ${input.complaint.category}):`),
      text(input.complaint.description),
      text("Wypełnij raport zgodnie z instrukcją i schematem."),
    ],
  };

  let modelIdx = 0;
  let lastError: unknown;
  try {
    for (let attempt = 0; attempt <= retries; attempt++) {
      const model = models[modelIdx]!;
      const t1 = Date.now();
      try {
        // No SDK retries: an overloaded model tends to hang until the timeout instead of failing
        // fast, so we cap each attempt and switch models below. A normal answer takes ~25 s.
        const interaction = await ai.interactions.create({ model, ...request }, { maxRetries: 0, timeout: Number(process.env.GEMINI_TIMEOUT_MS || 90_000) });
        timings.model_ms = Date.now() - t1;
        const out = interaction.output_text;
        if (!out) throw new Error("empty model output");
        const report = parseModelReport(JSON.parse(out));
        const u = interaction.usage;
        const usage = u
          ? {
              input: u.total_input_tokens ?? 0,
              output: u.total_output_tokens ?? 0,
              thought: u.total_thought_tokens ?? 0,
              total: u.total_tokens ?? 0,
            }
          : null;
        timings.attempts = attempt + 1;
        timings.total_ms = Date.now() - t0;
        return { report, model, promptVersion: PROMPT_VERSION, usage, timings };
      } catch (e) {
        lastError = e;
        console.warn(`[gemini] attempt ${attempt + 1} (${model}) failed: ${(e as Error).message.slice(0, 200)}`);
        if (isOverloaded(e) && models.length > 1) modelIdx = (modelIdx + 1) % models.length;
        else if (attempt < retries) await sleep(3000 * (attempt + 1));
      }
    }
    throw lastError;
  } finally {
    // Best effort cleanup; Files API also expires uploads on its own.
    await Promise.allSettled([packing, unboxing].map((f) => ai.files.delete({ name: f.name! })));
  }
}
