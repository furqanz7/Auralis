import {
  requireMethod,
  sendHttpError,
  setPrivateHeaders
} from "../../_lib/http.js";
import { readVerificationToken } from "../../_lib/verificationHttp.js";
import {
  getVerificationStatusRuntimeService
} from "../../_lib/verificationRuntime.js";

export function createVerificationStatusHandler(service) {
  return async function verificationStatusHandler(request, response) {
    setPrivateHeaders(response);
    try {
      requireMethod(request, response, "GET");
      const result = await service.getStatus({
        verificationToken: readVerificationToken(request)
      });
      return response.status(200).json(result);
    } catch (error) {
      return sendHttpError(response, error);
    }
  };
}

export default async function handler(request, response) {
  return createVerificationStatusHandler(
    getVerificationStatusRuntimeService()
  )(request, response);
}
