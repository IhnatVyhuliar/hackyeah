// Browser variant of upload.ts: blob: URLs and Blobs instead of file:// URIs. Same rule: upload, compare hashes, then the contract.
import { api, ApiError } from '../api';
import { hashBytes } from './hash.web';

async function uploadBytes(bytes: Uint8Array, mime: string, name: string): Promise<string> {
  const local = await hashBytes(bytes);
  // The server compares the bare MIME type, so no ";codecs=…" from MediaRecorder.
  const res = await api.uploadBlob(new Blob([bytes as BlobPart], { type: mime }), name);
  if (res.sha256 !== local) throw new ApiError(0, 'NETWORK', 'Plik dotarł uszkodzony. Nagranie jest w przeglądarce – spróbuj wysłać ponownie.');
  return local;
}
const bytesOf = async (uri: string) => new Uint8Array(await (await fetch(uri)).arrayBuffer());

export const uploadRecording = async (uri: string) => uploadBytes(await bytesOf(uri), 'video/mp4', 'recording.mp4');
export const uploadPhoto = async (uri: string) => {
  const sha256 = await uploadBytes(await bytesOf(uri), 'image/jpeg', 'photo.jpg');
  return { url: api.mediaUrl(sha256), sha256 };
};
export const uploadJson = (text: string) => uploadBytes(new TextEncoder().encode(text), 'application/json', 'data.json');
