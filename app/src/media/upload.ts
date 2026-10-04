// Upload first, transaction second (CLAUDE.md §6). The server's sha256 must equal the local one,
// otherwise nothing goes to the contract and the file stays on the phone for a retry.
import { File, Paths } from 'expo-file-system';
import { api, ApiError } from '../api';
import { hashFile } from './hash';

async function uploadVerified(uri: string, mime: string, name: string): Promise<string> {
  const local = await hashFile(uri);
  const res = await api.uploadFile(uri, mime, name);
  if (res.sha256 !== local) throw new ApiError(0, 'NETWORK', 'Plik dotarł uszkodzony. Nagranie jest na telefonie – spróbuj wysłać ponownie.');
  return local;
}

export const uploadRecording = (uri: string) => uploadVerified(uri, 'video/mp4', 'recording.mp4');
export const uploadPhoto = async (uri: string) => {
  const sha256 = await uploadVerified(uri, 'image/jpeg', 'photo.jpg');
  return { url: api.mediaUrl(sha256), sha256 };
};
/** Exact bytes of `text` go to /media; the returned hash is what goes on-chain. */
export async function uploadJson(text: string): Promise<string> {
  const f = new File(Paths.cache, `upload-${Date.now()}.json`);
  f.create();
  f.write(text);
  return uploadVerified(f.uri, 'application/json', 'data.json');
}
