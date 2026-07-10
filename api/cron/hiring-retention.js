import { readCronEnv } from "../_lib/env.js";
import {
  getHeader,
  requireMethod,
  sendHttpError,
  setPrivateHeaders
} from "../_lib/http.js";
import { getPrivacyRuntimeService } from "../_lib/privacyRuntime.js";
import { safeEqualHash } from "../_lib/tokens.js";

export function createHiringRetentionHandler({ service, cronSecret }) {
  return async function hiringRetentionHandler(request, response) {
    setPrivateHeaders(response);
    try {
      requireMethod(request, response, "GET");
      const authorization = getHeader(request, "authorization");
      if (!safeEqualHash(authorization, `Bearer ${cronSecret}`)) {
        return response.status(401).json({ error: { code: "UNAUTHORIZED" } });
      }

      const retention = await service.purgeExpiredApplications({ limit: 25 });
      return response.status(200).json({ retention });
    } catch (error) {
      return sendHttpError(response, error);
    }
  };
}

export default async function handler(request, response) {
  const env = readCronEnv();
  return createHiringRetentionHandler({
    service: getPrivacyRuntimeService(),
    cronSecret: env.CRON_SECRET
  })(request, response);
}
