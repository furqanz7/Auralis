import { z } from "zod";
import {
  requireMethod,
  sendHttpError,
  setPrivateHeaders
} from "../../_lib/http.js";
import { readStrictVerificationBody } from "../../_lib/verificationHttp.js";
import { getVerificationRuntimeService } from "../../_lib/verificationRuntime.js";

const callbackSchema = z
  .object({ PaymentId: z.string().min(1).max(200) })
  .strict();

export function createTbcCallbackHandler(service) {
  return async function tbcCallbackHandler(request, response) {
    setPrivateHeaders(response);
    try {
      requireMethod(request, response, "POST");
      const body = readStrictVerificationBody(
        request,
        callbackSchema,
        "PAYMENT_CALLBACK_INVALID"
      );
      const result = await service.handleCallback({
        providerPaymentId: body.PaymentId
      });
      return response.status(200).json(result);
    } catch (error) {
      return sendHttpError(response, error);
    }
  };
}

export default async function handler(request, response) {
  return createTbcCallbackHandler(getVerificationRuntimeService())(
    request,
    response
  );
}
