import { z } from "zod";
import {
  HttpError,
  readJsonBody,
  requireMethod,
  sendHttpError,
  setPrivateHeaders
} from "../_lib/http.js";
import { getPrivacyRuntimeService } from "../_lib/privacyRuntime.js";

const deleteConfirmSchema = z
  .object({
    deletionToken: z.string().min(16).max(512)
  })
  .strict();

export function createPrivacyDeleteConfirmHandler(service) {
  return async function privacyDeleteConfirmHandler(request, response) {
    setPrivateHeaders(response);
    try {
      requireMethod(request, response, "POST");
      const parsed = deleteConfirmSchema.safeParse(readJsonBody(request));
      if (!parsed.success) throw new HttpError("DELETION_CONFIRMATION_INVALID", 422);
      const result = await service.confirmDeletion(parsed.data);
      return response.status(200).json(result);
    } catch (error) {
      return sendHttpError(response, error);
    }
  };
}

export default async function handler(request, response) {
  return createPrivacyDeleteConfirmHandler(getPrivacyRuntimeService())(
    request,
    response
  );
}
