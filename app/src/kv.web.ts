// Browser storage: devnet-only test wallets and session tokens (expo-secure-store has no web implementation).
// Each origin has its own localStorage, so http://localhost:8090 and http://127.0.0.1:8090 are two separate "phones".
const store = (): Storage | null => {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
};

export const kv = {
  get: async (key: string): Promise<string | null> => store()?.getItem(key) ?? null,
  set: async (key: string, value: string): Promise<void> => { store()?.setItem(key, value); },
  del: async (key: string): Promise<void> => { store()?.removeItem(key); },
};
