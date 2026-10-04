// Evidence and reports live in server/ /media, addressed by sha256 (CLAUDE.md §6).
import type { FetchBytes } from "./evidence.ts";

const api = () => {
  const url = process.env.API_URL?.replace(/\/$/, "");
  if (!url) throw new Error("missing env API_URL (server/, e.g. http://localhost:4000)");
  return url;
};
export const mediaUrl = (sha: string) => `${api()}/media/${sha.toLowerCase()}`;

// null only when the file definitely is not there (404, or 400 for a non-hash like the all-zero hash).
// Network/server errors throw, so a flaky connection is never mistaken for missing evidence.
export const fetchBytes: FetchBytes = async (ref) => {
  const res = await fetch(ref.startsWith("http") ? ref : mediaUrl(ref));
  if (res.status === 404 || res.status === 400) return null;
  if (!res.ok) throw new Error(`GET ${ref}: HTTP ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
};

let token: string | null = null;
async function signIn(): Promise<string> {
  const email = process.env.ORACLE_API_EMAIL ?? "wyrocznia@unbox.local";
  const password = process.env.ORACLE_API_PASSWORD;
  if (!password) throw new Error("missing env ORACLE_API_PASSWORD");
  const post = (path: string, body: unknown) =>
    fetch(`${api()}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  let res = await post("/api/auth/login", { email, password });
  if (res.status === 401) res = await post("/api/auth/register", { email, password, name: "Wyrocznia" });
  if (!res.ok) throw new Error(`oracle account: HTTP ${res.status} ${await res.text()}`);
  return ((await res.json()) as { token: string }).token;
}

/** Uploads report.json; returns the server's sha256, which must equal ours (checked by the caller). */
export async function uploadReport(bytes: Uint8Array): Promise<string> {
  for (let attempt = 0; attempt < 2; attempt++) {
    token ??= await signIn();
    const form = new FormData();
    form.append("file", new Blob([bytes as Uint8Array<ArrayBuffer>], { type: "application/json" }), "report.json");
    const res = await fetch(`${api()}/api/media`, { method: "POST", headers: { authorization: `Bearer ${token}` }, body: form });
    if (res.status === 401) { token = null; continue; }
    if (!res.ok) throw new Error(`POST /api/media: HTTP ${res.status} ${await res.text()}`);
    return ((await res.json()) as { sha256: string }).sha256;
  }
  throw new Error("POST /api/media: unauthorized after re-login");
}
