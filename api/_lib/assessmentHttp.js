import { z } from "zod";
import { HttpError, getQueryParam, readJsonBody } from "./http.js";

const assessmentTokenSchema = z.string().min(16).max(512);

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
