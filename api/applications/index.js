import { z } from "zod";
import { applicationSchema } from "../../shared/hiring/applicationSchema.js";
import {
  getHeader,
  getRemoteIp,
  readJsonBody,
  requireMethod,
  sendHttpError,
  setPrivateHeaders
} from "../_lib/http.js";
import { getApplicationRuntimeService } from "../_lib/applicationRuntime.js";

const applicationRequestSchema = z.object({
  roleSlug: z.string().min(1).max(120),
  campaignToken: z.string().min(16).max(512),
  turnstileToken: z.string().min(1).max(2048),
  payload: applicationSchema
});

export function createApplicationHandler(service) {
  return async function applicationHandler(request, response) {
    setPrivateHeaders(response);
    try {
      requireMethod(request, response, "POST");
      const body = readJsonBody(request);
      const idempotencyKey = getHeader(request, "idempotency-key");
      if (
        typeof idempotencyKey !== "string" ||
        idempotencyKey.length < 8 ||
        idempotencyKey.length > 256
      ) {
        return response.status(400).json({
          error: { code: "IDEMPOTENCY_KEY_REQUIRED" }
        });
      }

      const input = applicationRequestSchema.safeParse(body);
      if (!input.success) {
        return response.status(422).json({
          error: { code: "INVALID_APPLICATION" }
        });
      }

      const result = await service.submitApplication({
        ...input.data,
        idempotencyKey,
        remoteIp: getRemoteIp(request)
      });
      return response.status(201).json(result);
    } catch (error) {
      return sendHttpError(response, error);
    }
  };
}

export default async function handler(request, response) {
  return createApplicationHandler(getApplicationRuntimeService())(request, response);
}
