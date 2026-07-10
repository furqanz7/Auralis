import {
  readAssessmentToken
} from "../../_lib/assessmentHttp.js";
import {
  requireMethod,
  sendHttpError,
  setPrivateHeaders
} from "../../_lib/http.js";
import { getAssessmentRuntimeService } from "../../_lib/assessmentRuntime.js";

export function createAssessmentReadHandler(service) {
  return async function assessmentReadHandler(request, response) {
    setPrivateHeaders(response);
    try {
      requireMethod(request, response, "GET");
      const result = await service.getAssessment(readAssessmentToken(request));
      return response.status(200).json(result);
    } catch (error) {
      return sendHttpError(response, error);
    }
  };
}

export default async function handler(request, response) {
  return createAssessmentReadHandler(getAssessmentRuntimeService())(
    request,
    response
  );
}
