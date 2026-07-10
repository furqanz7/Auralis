import {
  assessmentAnswerBodySchema,
  assessmentQuestionIdSchema,
  parseAssessmentBody,
  readAssessmentToken
} from "../../../_lib/assessmentHttp.js";
import {
  getQueryParam,
  requireMethod,
  sendHttpError,
  setPrivateHeaders
} from "../../../_lib/http.js";
import { getAssessmentRuntimeService } from "../../../_lib/assessmentRuntime.js";

export function createAssessmentAnswerHandler(service) {
  return async function assessmentAnswerHandler(request, response) {
    setPrivateHeaders(response);
    try {
      requireMethod(request, response, "PUT");
      const token = readAssessmentToken(request);
      const questionId = assessmentQuestionIdSchema.safeParse(
        getQueryParam(request, "questionId")
      );
      if (!questionId.success) {
        return response.status(422).json({ error: { code: "ANSWER_INVALID" } });
      }
      const input = parseAssessmentBody(
        request,
        assessmentAnswerBodySchema,
        "ANSWER_INVALID"
      );
      const result = await service.saveAnswer(
        token,
        questionId.data,
        input.optionId,
        input.version
      );
      return response.status(200).json(result);
    } catch (error) {
      return sendHttpError(response, error);
    }
  };
}

export default async function handler(request, response) {
  return createAssessmentAnswerHandler(getAssessmentRuntimeService())(
    request,
    response
  );
}
