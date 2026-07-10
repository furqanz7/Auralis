import { z } from "zod";
import { APPLICATION_MAX_CV_BYTES } from "../../shared/hiring/applicationSchema.js";
import {
  readJsonBody,
  requireMethod,
  sendHttpError,
  setPrivateHeaders
} from "../_lib/http.js";
import { getApplicationRuntimeService } from "../_lib/applicationRuntime.js";

const uploadRequestSchema = z.object({
  campaignId: z.string().uuid(),
  email: z.string().trim().email().max(254),
  fileName: z.string().min(1).max(255).regex(/\.pdf$/i),
  mimeType: z.literal("application/pdf"),
  size: z.number().int().positive().max(APPLICATION_MAX_CV_BYTES)
});

export function createUploadUrlHandler(service) {
  return async function uploadUrlHandler(request, response) {
    setPrivateHeaders(response);
    try {
      requireMethod(request, response, "POST");
      const input = uploadRequestSchema.safeParse(readJsonBody(request));
      if (!input.success) {
        return response.status(422).json({ error: { code: "INVALID_CV" } });
      }
      const upload = await service.createUploadUrl(input.data);
      return response.status(200).json({ upload });
    } catch (error) {
      return sendHttpError(response, error);
    }
  };
}

export default async function handler(request, response) {
  return createUploadUrlHandler(getApplicationRuntimeService())(request, response);
}
