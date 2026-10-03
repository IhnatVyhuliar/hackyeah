// Shape of the oracle report (CLAUDE.md §5). The model fills ModelReport; everything
// else is added by code. Move to @unbox/shared (OracleReport) once O4 publishes it.

export type Verdict = "SELLER" | "BUYER";
export type Quality = "good" | "poor";

export interface BuyerRecording {
  continuous: boolean;
  starts_with_sealed_package: boolean;
  qr_revealed_on_opening: boolean;
  quality: Quality;
  notes: string;
}

export interface SellerRecording {
  item_clearly_visible: boolean;
  qr_card_packed: boolean;
  package_sealed_and_labeled: boolean;
  quality: Quality;
  notes: string;
}

export interface ModelReport {
  buyer_recording: BuyerRecording;
  seller_recording: SellerRecording;
  package_matches_shipping_recording: boolean;
  item_matches_listing: boolean;
  undisclosed_damage: { present: boolean; description: string; timestamps: string[] };
  reasoning: string;
}

export type EvidenceAuthor = "seller" | "buyer";

export interface EvidenceItem {
  path: string;
  author: EvidenceAuthor;
  expected_sha256: string;
  actual_sha256: string | null; // null = file missing / not downloadable
  ok: boolean;
}

export interface EvidenceCheck {
  items: EvidenceItem[];
  seller_ok: boolean;
  buyer_ok: boolean;
}

export interface TokenUsage {
  input: number;
  output: number;
  thought: number;
  total: number;
}

// report.json as uploaded to storage; sha256 of its exact bytes goes to resolve_dispute.
export interface OracleReport extends Partial<ModelReport> {
  v: 1;
  deal: string;
  verdict: Verdict;
  decided_by: "evidence" | "decide";
  evidence: EvidenceCheck;
  prompt_version: string | null; // null when decided by evidence (no model call)
  model: string | null;
  usage: TokenUsage | null;
  created_at: string; // ISO 8601
}

const recordingNotes = {
  type: "string",
  description: "Krótkie obserwacje po polsku, ze znacznikami czasu mm:ss.",
};

const quality = {
  type: "string",
  enum: ["good", "poor"],
  description: "poor = nieostre, ciemne, ucięte, zasłonięte lub z przerwami.",
};

// JSON schema for Gemini structured output. Keep it to the supported subset:
// type, properties, required, items, enum, description.
export const MODEL_REPORT_SCHEMA = {
  type: "object",
  properties: {
    buyer_recording: {
      type: "object",
      description: "Nagranie otwarcia paczki (kupujący).",
      properties: {
        continuous: { type: "boolean", description: "Jedno ciągłe ujęcie bez cięć i przerw." },
        starts_with_sealed_package: {
          type: "boolean",
          description: "Nagranie zaczyna się od zamkniętej, nienaruszonej paczki.",
        },
        qr_revealed_on_opening: {
          type: "boolean",
          description: "Karta QR pojawia się dopiero po otwarciu paczki, na tym nagraniu.",
        },
        quality,
        notes: recordingNotes,
      },
      required: ["continuous", "starts_with_sealed_package", "qr_revealed_on_opening", "quality", "notes"],
    },
    seller_recording: {
      type: "object",
      description: "Nagranie pakowania (sprzedający).",
      properties: {
        item_clearly_visible: {
          type: "boolean",
          description: "Przedmiot jest wyraźnie pokazany z obu stron przed zapakowaniem.",
        },
        qr_card_packed: { type: "boolean", description: "Widać, jak karta QR trafia do paczki." },
        package_sealed_and_labeled: {
          type: "boolean",
          description: "Widać zaklejenie paczki i naklejoną etykietę przewoźnika.",
        },
        quality,
        notes: recordingNotes,
      },
      required: ["item_clearly_visible", "qr_card_packed", "package_sealed_and_labeled", "quality", "notes"],
    },
    package_matches_shipping_recording: {
      type: "boolean",
      description:
        "Paczka na otwarciu to ta sama paczka co na pakowaniu (taśma, etykieta, numer przesyłki, kształt).",
    },
    item_matches_listing: {
      type: "boolean",
      description: "Przedmiot z otwarcia zgadza się z ogłoszeniem (rodzaj, kolor, marka, rozmiar).",
    },
    undisclosed_damage: {
      type: "object",
      properties: {
        present: {
          type: "boolean",
          description: "Widoczna wada, której NIE ma na liście wad w ogłoszeniu i nie było jej na pakowaniu.",
        },
        description: { type: "string", description: "Opis wady po polsku albo pusty tekst." },
        timestamps: {
          type: "array",
          items: { type: "string" },
          description: "Znaczniki mm:ss na nagraniu otwarcia, gdzie widać wadę.",
        },
      },
      required: ["present", "description", "timestamps"],
    },
    reasoning: { type: "string", description: "Uzasadnienie po polsku, 3–6 zdań, zrozumiałe dla kupującego." },
  },
  required: [
    "buyer_recording",
    "seller_recording",
    "package_matches_shipping_recording",
    "item_matches_listing",
    "undisclosed_damage",
    "reasoning",
  ],
} as const;

// Strict runtime check of the model output. Anything off → throw, never guess.
export function parseModelReport(raw: unknown): ModelReport {
  const fail = (path: string): never => {
    throw new Error(`invalid model report at ${path}`);
  };
  const obj = (v: unknown, path: string): Record<string, unknown> =>
    typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : fail(path);
  const bool = (o: Record<string, unknown>, k: string, path: string): boolean =>
    typeof o[k] === "boolean" ? (o[k] as boolean) : fail(`${path}.${k}`);
  const str = (o: Record<string, unknown>, k: string, path: string): string =>
    typeof o[k] === "string" ? (o[k] as string) : fail(`${path}.${k}`);
  const qual = (o: Record<string, unknown>, path: string): Quality =>
    o.quality === "good" || o.quality === "poor" ? o.quality : fail(`${path}.quality`);

  const r = obj(raw, "$");
  const b = obj(r.buyer_recording, "$.buyer_recording");
  const s = obj(r.seller_recording, "$.seller_recording");
  const d = obj(r.undisclosed_damage, "$.undisclosed_damage");
  const ts = Array.isArray(d.timestamps) ? d.timestamps : fail("$.undisclosed_damage.timestamps");
  if (!ts.every((t) => typeof t === "string")) fail("$.undisclosed_damage.timestamps[]");

  return {
    buyer_recording: {
      continuous: bool(b, "continuous", "$.buyer_recording"),
      starts_with_sealed_package: bool(b, "starts_with_sealed_package", "$.buyer_recording"),
      qr_revealed_on_opening: bool(b, "qr_revealed_on_opening", "$.buyer_recording"),
      quality: qual(b, "$.buyer_recording"),
      notes: str(b, "notes", "$.buyer_recording"),
    },
    seller_recording: {
      item_clearly_visible: bool(s, "item_clearly_visible", "$.seller_recording"),
      qr_card_packed: bool(s, "qr_card_packed", "$.seller_recording"),
      package_sealed_and_labeled: bool(s, "package_sealed_and_labeled", "$.seller_recording"),
      quality: qual(s, "$.seller_recording"),
      notes: str(s, "notes", "$.seller_recording"),
    },
    package_matches_shipping_recording: bool(r, "package_matches_shipping_recording", "$"),
    item_matches_listing: bool(r, "item_matches_listing", "$"),
    undisclosed_damage: {
      present: bool(d, "present", "$.undisclosed_damage"),
      description: str(d, "description", "$.undisclosed_damage"),
      timestamps: ts as string[],
    },
    reasoning: str(r, "reasoning", "$"),
  };
}
