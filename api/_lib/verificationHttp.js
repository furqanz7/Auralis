import { z } from "zod";
import { HttpError, getQueryParam, readJsonBody } from "./http.js";

const verificationTokenSchema = z.string().min(16).max(512);

export const emptyVerificationBodySchema = z.object({}).strict();

export const wisePaymentReportBodySchema = z.object({
  payerName: z.string().optional()
}).strict();

export function readVerificationToken(request) {
  const parsed = verificationTokenSchema.safeParse(
    getQueryParam(request, "token")
  );
  if (!parsed.success) throw new HttpError("VERIFICATION_INVALID", 404);
  return parsed.data;
}

export function readStrictVerificationBody(request, schema, code) {
  const parsed = schema.safeParse(readJsonBody(request));
  if (!parsed.success) throw new HttpError(code, 422);
  return parsed.data;
}
