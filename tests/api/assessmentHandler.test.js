import { describe, expect, test, vi } from "vitest";
import { AssessmentDomainError } from "../../api/_lib/assessmentService.js";
import { createAssessmentReadHandler } from "../../api/assessments/[token]/index.js";
import { createAssessmentStartHandler } from "../../api/assessments/[token]/start.js";
import { createAssessmentAnswerHandler } from "../../api/assessments/[token]/answers/[questionId].js";
import { createAssessmentSubmitHandler } from "../../api/assessments/[token]/submit.js";

function response() {
  return {
    body: null,
    headers: {},
    statusCode: 200,
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    }
  };
}

function request(overrides = {}) {
  return {
    method: "GET",
    headers: { "content-type": "application/json" },
    query: { token: "private-assessment-token" },
    body: {},
    ...overrides
  };
}

describe("assessment handlers", () => {
  test("reads a browser-safe private assessment with no-store headers", async () => {
    const service = {
      getAssessment: vi.fn(async () => ({
        status: "started",
        questions: [
          {
            id: "ai-01",
            prompt: "A sufficiently long browser-safe question prompt.",
            options: [{ id: "a", label: "Option" }]
          }
        ]
      }))
    };
    const result = response();

    await createAssessmentReadHandler(service)(request(), result);

    expect(result.statusCode).toBe(200);
    expect(result.headers["cache-control"]).toBe("no-store");
    expect(JSON.stringify(result.body)).not.toContain("correctOptionId");
  });

  test("enforces methods and token presence", async () => {
    const result = response();
    const handler = createAssessmentReadHandler({ getAssessment: vi.fn() });

    await handler(request({ method: "POST", query: {} }), result);

    expect(result.statusCode).toBe(405);
    expect(result.headers.allow).toBe("GET");
  });

  test("starts the assessment without accepting a client timer", async () => {
    const service = {
      startAssessment: vi.fn(async () => ({ deadlineAt: "2026-07-10T12:20:00Z" }))
    };
    const result = response();

    await createAssessmentStartHandler(service)(
      request({ method: "POST", body: {} }),
      result
    );

    expect(result.statusCode).toBe(200);
    expect(service.startAssessment).toHaveBeenCalledWith("private-assessment-token");
  });

  test("saves one answer with optimistic versioning", async () => {
    const service = {
      saveAnswer: vi.fn(async () => ({ version: 4, savedAt: "now" }))
    };
    const result = response();

    await createAssessmentAnswerHandler(service)(
      request({
        method: "PUT",
        query: { token: "private-assessment-token", questionId: "ai-01" },
        body: { optionId: "a", version: 3 }
      }),
      result
    );

    expect(result.statusCode).toBe(200);
    expect(service.saveAnswer).toHaveBeenCalledWith(
      "private-assessment-token",
      "ai-01",
      "a",
      3
    );
  });

  test("rejects browser-supplied scoring and identity fields", async () => {
    const service = { saveAnswer: vi.fn() };
    const result = response();

    await createAssessmentAnswerHandler(service)(
      request({
        method: "PUT",
        query: { token: "private-assessment-token", questionId: "ai-01" },
        body: {
          optionId: "a",
          version: 3,
          score: 18,
          correct: true,
          applicationId: "application-id"
        }
      }),
      result
    );

    expect(result.statusCode).toBe(422);
    expect(service.saveAnswer).not.toHaveBeenCalled();
  });

  test("submits idempotently without exposing a score", async () => {
    const service = {
      submitAssessment: vi.fn(async () => ({
        applicationReference: "AUR-1",
        verificationToken: "verification-token"
      }))
    };
    const result = response();

    await createAssessmentSubmitHandler(service)(
      request({ method: "POST", body: {} }),
      result
    );

    expect(result.statusCode).toBe(200);
    expect(result.body).not.toHaveProperty("score");
    expect(service.submitAssessment).toHaveBeenCalledTimes(1);
  });

  test("maps stable assessment domain errors", async () => {
    const result = response();
    const handler = createAssessmentStartHandler({
      startAssessment: vi.fn(async () => {
        throw new AssessmentDomainError("ASSESSMENT_EXPIRED", 410);
      })
    });

    await handler(request({ method: "POST", body: {} }), result);

    expect(result.statusCode).toBe(410);
    expect(result.body).toEqual({ error: { code: "ASSESSMENT_EXPIRED" } });
  });
});
