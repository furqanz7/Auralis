import { describe, expect, test } from "vitest";
import {
  APPLICATION_MAX_CV_BYTES,
  AVAILABILITY_OPTIONS,
  applicationSchema
} from "../../shared/hiring/applicationSchema.js";

const validApplication = {
  fullName: "Nino Beridze",
  email: "nino@example.com",
  country: "Georgia",
  timeZone: "Asia/Tbilisi",
  profileUrl: "https://www.linkedin.com/in/nino-beridze",
  availability: "20-30 hours",
  cvObjectKey: "campaign-id/550e8400-e29b-41d4-a716-446655440000/cv.pdf",
  cvMimeType: "application/pdf",
  cvSize: APPLICATION_MAX_CV_BYTES,
  privacyAccepted: true
};

describe("applicationSchema", () => {
  test("accepts the complete private application contract", () => {
    expect(applicationSchema.parse(validApplication)).toEqual(validApplication);
    expect(AVAILABILITY_OPTIONS).toContain(validApplication.availability);
  });

  test.each([
    ["email", "not-an-email"],
    ["country", ""],
    ["timeZone", "Not/A-Time-Zone"],
    ["profileUrl", "javascript:alert(1)"],
    ["availability", "whenever"],
    ["cvObjectKey", "../private/cv.pdf"],
    ["privacyAccepted", false]
  ])("rejects an invalid %s", (field, value) => {
    const result = applicationSchema.safeParse({
      ...validApplication,
      [field]: value
    });

    expect(result.success).toBe(false);
  });

  test("allows an omitted profile URL for roles where it is optional", () => {
    const result = applicationSchema.safeParse({
      ...validApplication,
      profileUrl: ""
    });

    expect(result.success).toBe(true);
  });

  test.each([
    ["image/png", 1024],
    ["application/pdf", APPLICATION_MAX_CV_BYTES + 1],
    ["application/pdf", 0]
  ])("rejects invalid CV metadata: %s at %i bytes", (cvMimeType, cvSize) => {
    const result = applicationSchema.safeParse({
      ...validApplication,
      cvMimeType,
      cvSize
    });

    expect(result.success).toBe(false);
  });
});
