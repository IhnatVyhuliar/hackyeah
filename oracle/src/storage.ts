// Supabase Storage over plain REST (public bucket, immutable files).
import type { FetchBytes } from "./evidence.ts";

const cfg = () => {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
  if (!url) throw new Error("missing env SUPABASE_URL");
  return { url, bucket: process.env.SUPABASE_BUCKET || "unbox", key: process.env.SUPABASE_SERVICE_KEY };
};

export function publicUrl(path: string): string {
  const { url, bucket } = cfg();
  return `${url}/storage/v1/object/public/${bucket}/${path}`;
}

// null only when the object definitely does not exist. Network/server errors throw, so a
// flaky connection can never be mistaken for missing evidence.
export const fetchBytes: FetchBytes = async (ref) => {
  const res = await fetch(ref.startsWith("http") ? ref : publicUrl(ref));
  if (res.status === 404 || res.status === 400) return null; // Supabase answers 400 "Object not found"
  if (!res.ok) throw new Error(`storage GET ${ref}: HTTP ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
};

// Uploads without overwriting. Returns "exists" when the path is already taken.
export async function uploadImmutable(path: string, bytes: Uint8Array, contentType: string): Promise<"created" | "exists"> {
  const { url, bucket, key } = cfg();
  if (!key) throw new Error("missing env SUPABASE_SERVICE_KEY");
  const res = await fetch(`${url}/storage/v1/object/${bucket}/${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, apikey: key, "content-type": contentType, "x-upsert": "false" },
    body: Buffer.from(bytes),
  });
  if (res.ok) return "created";
  const body = await res.text();
  if (res.status === 409 || /already exists|Duplicate/i.test(body)) return "exists";
  throw new Error(`storage POST ${path}: HTTP ${res.status} ${body}`);
}
