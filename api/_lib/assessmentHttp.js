import { z } from "zod";
import {
  HttpError,
  getQueryParam,
  readJsonBody,
  requireMethod,
  sendHttpError,
  setPrivateHeaders
} from "./http.js";

const assessmentTokenSchema = z.string().min(16).max(512);
const assessmentActionSchema = z.enum(["read", "start", "answer", "submit"]);

export const emptyAssessmentBodySchema = z.object({}).strict();

export const assessmentAnswerBodySchema = z
  .object({
    optionId: z.string().min(1).max(120),
    version: z.number().int().nonnegative()
  })
  .strict();

export const assessmentQuestionIdSchema = z.string().min(1).max(120);

export function readAssessmentToken(request) {
  const token = assessmentTokenSchema.safeParse(getQueryParam(request, "token"));
  if (!token.success) throw new HttpError("ASSESSMENT_INVALID", 404);
  return token.data;
}

export function parseAssessmentBody(request, schema, errorCode) {
  const input = schema.safeParse(readJsonBody(request));
  if (!input.success) throw new HttpError(errorCode, 422);
  return input.data;
}

export function createAssessmentHandler(service) {
  return async function assessmentHandler(request, response) {
    setPrivateHeaders(response);
    try {
      const action = assessmentActionSchema.safeParse(
        getQueryParam(request, "action")
      );
      if (!action.success) throw new HttpError("ASSESSMENT_INVALID", 404);

      if (action.data === "read") {
        requireMethod(request, response, "GET");
        const result = await service.getAssessment(readAssessmentToken(request));
        return response.status(200).json(result);
      }

      if (action.data === "start") {
        requireMethod(request, response, "POST");
        const token = readAssessmentToken(request);
        parseAssessmentBody(request, emptyAssessmentBodySchema, "ASSESSMENT_INVALID");
        const result = await service.startAssessment(token);
        return response.status(200).json(result);
      }

      if (action.data === "answer") {
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
      }

      requireMethod(request, response, "POST");
      const token = readAssessmentToken(request);
      parseAssessmentBody(request, emptyAssessmentBodySchema, "ASSESSMENT_INVALID");
      const result = await service.submitAssessment(token);
      return response.status(200).json(result);
    } catch (error) {
      return sendHttpError(response, error);
    }
  };
}
