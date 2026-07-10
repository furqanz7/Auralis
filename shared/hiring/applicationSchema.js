import { z } from "zod";

export const APPLICATION_MAX_CV_BYTES = 5 * 1024 * 1024;

export const AVAILABILITY_OPTIONS = Object.freeze([
  "10-20 hours",
  "20-30 hours",
  "30-40 hours",
  "40+ hours"
]);

function isIanaTimeZone(value) {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value }).format();
    return value.includes("/") || value === "UTC";
  } catch {
    return false;
  }
}

function isHttpUrl(value) {
  if (value === "") return true;

  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export const applicationSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email().max(254),
  country: z.string().trim().min(2).max(100),
  timeZone: z.string().trim().refine(isIanaTimeZone, "Choose a valid time zone."),
  profileUrl: z
    .string()
    .trim()
    .max(2048)
    .refine(isHttpUrl, "Use a valid http or https URL."),
  availability: z.enum(AVAILABILITY_OPTIONS),
  cvObjectKey: z
    .string()
    .min(1)
    .max(512)
    .regex(/^(?!\/)(?!.*\.\.)(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_.-]+\.pdf$/i),
  cvMimeType: z.literal("application/pdf"),
  cvSize: z.number().int().positive().max(APPLICATION_MAX_CV_BYTES),
  privacyAccepted: z.literal(true)
});
