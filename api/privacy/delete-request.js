import { z } from "zod";
import {
  HttpError,
  readJsonBody,
  requireMethod,
  sendHttpError,
  setPrivateHeaders
} from "../_lib/http.js";
import { getPrivacyRuntimeService } from "../_lib/privacyRuntime.js";

const deleteRequestSchema = z
  .object({
    email: z.string().trim().email().max(254)
  })
  .strict();

export function createPrivacyDeleteRequestHandler(service) {
  return async function privacyDeleteRequestHandler(request, response) {
    setPrivateHeaders(response);
    try {
      requireMethod(request, response, "POST");
      const parsed = deleteRequestSchema.safeParse(readJsonBody(request));
      if (!parsed.success) throw new HttpError("DELETION_REQUEST_INVALID", 422);
      const result = await service.requestDeletion(parsed.data);
      return response.status(202).json(result);
    } catch (error) {
      return sendHttpError(response, error);
    }
  };
}

export default async function handler(request, response) {
  return createPrivacyDeleteRequestHandler(getPrivacyRuntimeService())(
    request,
    response
  );
}
