// Small persistent key-value store: expo-secure-store on the phone (kv.web.ts in the browser).
import * as SecureStore from 'expo-secure-store';

export const kv = {
  get: (key: string): Promise<string | null> => SecureStore.getItemAsync(key),
  set: (key: string, value: string): Promise<void> => SecureStore.setItemAsync(key, value),
  del: (key: string): Promise<void> => SecureStore.deleteItemAsync(key),
};
