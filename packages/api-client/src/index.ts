// @unbox/api-client — jedna warstwa HTTP dla aplikacji (zero blockchaina).
// W aplikacji: app/src/api/index.ts →
//   export const api = createUnboxApi({ baseUrl: process.env.EXPO_PUBLIC_API_URL!, tokenStore: secureStoreTokens });
import { authApi } from './auth';
import { dealsApi } from './deals';
import { flowsApi } from './flows';
import { createHttp, type HttpOptions } from './http';
import { listingsApi } from './listings';
import { mediaApi } from './media';

export function createUnboxApi(o: HttpOptions) {
  const http = createHttp(o);
  const flows = flowsApi(http);
  return {
    auth: authApi(http),
    listings: listingsApi(http),
    deals: dealsApi(http),
    media: mediaApi(http),
    flows,
  };
}
export type UnboxApi = ReturnType<typeof createUnboxApi>;

export { ApiClientError, userMessage, type ClientErrorCode } from './errors';
export { memoryTokenStore, type HttpOptions, type TokenStore } from './http';
export type { UploadSource } from './media';
export type { VideoInput } from './flows';
