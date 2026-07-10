import { readCronEnv } from "../_lib/env.js";
import {
  getHeader,
  requireMethod,
  sendHttpError,
  setPrivateHeaders
} from "../_lib/http.js";
import { getAssessmentRuntimeService } from "../_lib/assessmentRuntime.js";
import { safeEqualHash } from "../_lib/tokens.js";

export function createAssessmentReminderHandler({ service, cronSecret }) {
  return async function assessmentReminderHandler(request, response) {
    setPrivateHeaders(response);
    try {
      requireMethod(request, response, "GET");
      const authorization = getHeader(request, "authorization");
      if (!safeEqualHash(authorization, `Bearer ${cronSecret}`)) {
        return response.status(401).json({ error: { code: "UNAUTHORIZED" } });
      }

      const reminders = await service.sendDueReminders({ limit: 50 });
      return response.status(200).json({ reminders });
    } catch (error) {
      return sendHttpError(response, error);
    }
  };
}

export default async function handler(request, response) {
  const env = readCronEnv();
  return createAssessmentReminderHandler({
    service: getAssessmentRuntimeService(),
    cronSecret: env.CRON_SECRET
  })(request, response);
}
