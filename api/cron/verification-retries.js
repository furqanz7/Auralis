import { readCronEnv } from "../_lib/env.js";
import {
  getHeader,
  requireMethod,
  sendHttpError,
  setPrivateHeaders
} from "../_lib/http.js";
import { safeEqualHash } from "../_lib/tokens.js";
import { getVerificationRuntimeService } from "../_lib/verificationRuntime.js";

export function createVerificationRetryHandler({ service, cronSecret }) {
  return async function verificationRetryHandler(request, response) {
    setPrivateHeaders(response);
    try {
      requireMethod(request, response, "GET");
      if (
        !safeEqualHash(
          getHeader(request, "authorization"),
          `Bearer ${cronSecret}`
        )
      ) {
        return response.status(401).json({ error: { code: "UNAUTHORIZED" } });
      }
      const retries = await service.retryDueCancellations({ limit: 20 });
      return response.status(200).json({ retries });
    } catch (error) {
      return sendHttpError(response, error);
    }
  };
}

export default async function handler(request, response) {
  const env = readCronEnv();
  return createVerificationRetryHandler({
    service: getVerificationRuntimeService(),
    cronSecret: env.CRON_SECRET
  })(request, response);
}
