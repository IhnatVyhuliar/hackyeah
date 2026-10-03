// Jedyne wejście ekranów do backendu. Token sesji w expo-secure-store.
import * as SecureStore from 'expo-secure-store';
import { createUnboxApi, type TokenStore } from '@unbox/api-client';

export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000').replace(/\/$/, '');

const TOKEN_KEY = 'unbox.session';
const secureTokens: TokenStore = {
  get: () => SecureStore.getItemAsync(TOKEN_KEY),
  set: (t) => (t ? SecureStore.setItemAsync(TOKEN_KEY, t) : SecureStore.deleteItemAsync(TOKEN_KEY)),
};

let onLogout: () => void = () => {};
/** Sesja rejestruje tu reakcję na wygasły token (401). */
export const setUnauthorizedHandler = (fn: () => void) => { onLogout = fn; };

export const api = createUnboxApi({
  baseUrl: API_URL,
  tokenStore: secureTokens,
  onUnauthorized: () => onLogout(),
});

export { ApiClientError, userMessage } from '@unbox/api-client';
