import {
  emptyAssessmentBodySchema,
  parseAssessmentBody,
  readAssessmentToken
} from "../../_lib/assessmentHttp.js";
import {
  requireMethod,
  sendHttpError,
  setPrivateHeaders
} from "../../_lib/http.js";
import { getAssessmentRuntimeService } from "../../_lib/assessmentRuntime.js";

export function createAssessmentStartHandler(service) {
  return async function assessmentStartHandler(request, response) {
    setPrivateHeaders(response);
    try {
      requireMethod(request, response, "POST");
      const token = readAssessmentToken(request);
      parseAssessmentBody(request, emptyAssessmentBodySchema, "ASSESSMENT_INVALID");
      const result = await service.startAssessment(token);
      return response.status(200).json(result);
    } catch (error) {
      return sendHttpError(response, error);
    }
  };
}

export default async function handler(request, response) {
  return createAssessmentStartHandler(getAssessmentRuntimeService())(
    request,
    response
  );
}
