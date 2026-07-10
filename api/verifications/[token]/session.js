import {
  getHeader,
  requireMethod,
  sendHttpError,
  setPrivateHeaders
} from "../../_lib/http.js";
import { readVerificationEnv } from "../../_lib/env.js";
import {
  emptyVerificationBodySchema,
  readStrictVerificationBody,
  readVerificationToken
} from "../../_lib/verificationHttp.js";
import { getVerificationRuntimeService } from "../../_lib/verificationRuntime.js";

export function createVerificationSessionHandler({ service, siteUrl }) {
  return async function verificationSessionHandler(request, response) {
    setPrivateHeaders(response);
    try {
      requireMethod(request, response, "POST");
      const verificationToken = readVerificationToken(request);
      readStrictVerificationBody(
        request,
        emptyVerificationBodySchema,
        "VERIFICATION_SESSION_INVALID"
      );
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
      const result = await service.createSession({
        verificationToken,
        returnBaseUrl: siteUrl,
        idempotencyKey
      });
      return response.status(200).json(result);
    } catch (error) {
      return sendHttpError(response, error);
    }
  };
}

export default async function handler(request, response) {
  const env = readVerificationEnv();
  return createVerificationSessionHandler({
    service: getVerificationRuntimeService(),
    siteUrl: env.PUBLIC_SITE_URL
  })(request, response);
}
