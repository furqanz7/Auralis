import { getRoleBySlug, ROLE_CONFIG } from "../../../shared/hiring/roles.js";

export class HiringApiError extends Error {
  constructor(code, status) {
    super(code);
    this.name = "HiringApiError";
    this.code = code;
    this.status = status;
  }
}

async function parseJsonResponse(response) {
  let body = {};
  try {
    body = await response.json();
  } catch {
    body = {};
  }
  if (!response.ok) {
    throw new HiringApiError(body?.error?.code ?? "REQUEST_FAILED", response.status);
  }
  return body;
}

export function createHiringClient(fetchImpl = fetch) {
  const jsonHeaders = {
    accept: "application/json",
    "content-type": "application/json"
  };

  return {
    async getApplicationRoles() {
      const response = await fetchImpl("/api/applications", {
        cache: "no-store",
        headers: { accept: "application/json" }
      });
      return (await parseJsonResponse(response)).roles;
    },

    async getCampaign(roleSlug, campaignToken) {
      const response = await fetchImpl(
        `/api/campaigns/${encodeURIComponent(roleSlug)}/${encodeURIComponent(campaignToken)}`,
        { cache: "no-store", headers: { accept: "application/json" } }
      );
      return (await parseJsonResponse(response)).campaign;
    },

    async createUploadUrl(input) {
      const response = await fetchImpl("/api/applications/upload-url", {
        method: "POST",
        headers: { accept: "application/json", "content-type": "application/json" },
        body: JSON.stringify(input)
      });
      return (await parseJsonResponse(response)).upload;
    },

    async uploadCv(upload, file) {
      const body = new FormData();
      body.append("cacheControl", "0");
      body.append("", file);
      const response = await fetchImpl(upload.uploadUrl, {
        method: "PUT",
        headers: { "x-upsert": "false" },
        body
      });
      if (!response.ok) {
        throw new HiringApiError("CV_UPLOAD_FAILED", response.status);
      }
    },

    async submitApplication(input, idempotencyKey) {
      const response = await fetchImpl("/api/applications", {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          "Idempotency-Key": idempotencyKey
        },
        body: JSON.stringify(input)
      });
      return parseJsonResponse(response);
    },

    async getAssessment(token) {
      const response = await fetchImpl(
        `/api/assessments/${encodeURIComponent(token)}`,
        { cache: "no-store", headers: { accept: "application/json" } }
      );
      return parseJsonResponse(response);
    },

    async startAssessment(token) {
      const response = await fetchImpl(
        `/api/assessments/${encodeURIComponent(token)}/start`,
        {
          method: "POST",
          headers: jsonHeaders,
          body: JSON.stringify({})
        }
      );
      return parseJsonResponse(response);
    },

    async saveAssessmentAnswer(token, questionId, optionId, version) {
      const response = await fetchImpl(
        `/api/assessments/${encodeURIComponent(token)}/answers/${encodeURIComponent(questionId)}`,
        {
          method: "PUT",
          headers: jsonHeaders,
          body: JSON.stringify({ optionId, version })
        }
      );
      return parseJsonResponse(response);
    },

    async submitAssessment(token) {
      const response = await fetchImpl(
        `/api/assessments/${encodeURIComponent(token)}/submit`,
        {
          method: "POST",
          headers: jsonHeaders,
          body: JSON.stringify({})
        }
      );
      return parseJsonResponse(response);
    },

    async createVerificationSession(token, idempotencyKey) {
      const response = await fetchImpl(
        `/api/verifications/${encodeURIComponent(token)}/session`,
        {
          method: "POST",
          headers: {
            ...jsonHeaders,
            "Idempotency-Key": idempotencyKey
          },
          body: JSON.stringify({})
        }
      );
      return parseJsonResponse(response);
    },

    async getVerificationStatus(token) {
      const response = await fetchImpl(
        `/api/verifications/${encodeURIComponent(token)}/status`,
        { cache: "no-store", headers: { accept: "application/json" } }
      );
      return parseJsonResponse(response);
    },

    async requestPrivacyDeletion(email) {
      const response = await fetchImpl("/api/privacy/delete-request", {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({ email })
      });
      return parseJsonResponse(response);
    },

    async confirmPrivacyDeletion(deletionToken) {
      const response = await fetchImpl("/api/privacy/delete-confirm", {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({ deletionToken })
      });
      return parseJsonResponse(response);
    }
  };
}

export function createDemoApplicationClient() {
  return {
    async getApplicationRoles() {
      return ROLE_CONFIG;
    },
    async createUploadUrl({ roleSlug }) {
      return {
        objectKey: `direct-${roleSlug}/local-preview/cv.pdf`,
        uploadUrl: "https://example.invalid/local-preview"
      };
    },
    async uploadCv() {},
    async submitApplication() {
      return {
        applicationReference: "AUR-PREVIEW"
      };
    }
  };
}

export function createDemoHiringClient() {
  return {
    async getCampaign(roleSlug) {
      const role = getRoleBySlug(roleSlug);
      if (!role) throw new HiringApiError("CAMPAIGN_UNAVAILABLE", 404);
      return {
        id: "550e8400-e29b-41d4-a716-446655440000",
        label: "Private studio campaign",
        expiresAt: "2026-08-31T23:59:59.000Z",
        role
      };
    },
    async createUploadUrl({ campaignId }) {
      return {
        objectKey: `${campaignId}/local-preview/cv.pdf`,
        uploadUrl: "https://example.invalid/local-preview"
      };
    },
    async uploadCv() {},
    async submitApplication() {
      return {
        applicationReference: "AUR-PREVIEW"
      };
    }
  };
}

const DEMO_ASSESSMENT_PROMPTS = [
  "Which architecture best isolates model failures in a production workflow?",
  "Which evaluation approach gives the clearest evidence before a model rollout?",
  "How should a high-impact automated action be bounded before production use?",
  "Which trace design supports incident review without retaining unnecessary personal data?",
  "What is the strongest response when retrieval quality degrades on policy questions?",
  "Which workflow design remains dependable when individual steps must retry?",
  "How should a provider outage change the behavior of a customer-facing AI product?",
  "What is the clearest way to control cost as model usage grows?",
  "Which permission boundary is appropriate for an agent that can issue credits?",
  "How should schema-dependent downstream code consume model output?",
  "Where should human review sit in a consequential decision workflow?",
  "Which evidence is sufficient for moving an internal prototype toward production?",
  "How should a major model version be introduced with limited compatibility?",
  "What is the most defensible privacy tradeoff when more context may improve quality?",
  "When can an automated agent act without a separate approval step?",
  "How should a team respond when inference work arrives faster than workers can process it?",
  "What is the first response after an incorrect external action in production?",
  "Which delivery sequence addresses the highest-risk assumption first?"
];

function demoAssessmentQuestions() {
  return DEMO_ASSESSMENT_PROMPTS.map((prompt, index) => ({
    id: `demo-${String(index + 1).padStart(2, "0")}`,
    prompt,
    options: [
      { id: "a", label: "A single synchronous chain with shared state" },
      { id: "b", label: "A client-side retry loop without observability" },
      {
        id: "c",
        label: "Bounded services with explicit fallbacks and traceable handoffs"
      },
      { id: "d", label: "One unrestricted agent with access to every tool" }
    ]
  }));
}

export function createDemoAssessmentClient() {
  const role = getRoleBySlug("senior-ai-product-engineer");
  const startedAt = new Date();
  const session = {
    status: "started",
    applicationReference: "AUR-PREVIEW",
    role,
    questions: demoAssessmentQuestions(),
    startedAt: startedAt.toISOString(),
    deadlineAt: new Date(startedAt.getTime() + 20 * 60 * 1000).toISOString(),
    responseVersion: 0,
    responses: {}
  };

  return {
    async getAssessment() {
      return { ...session, responses: { ...session.responses } };
    },
    async startAssessment() {
      return { ...session, responses: { ...session.responses } };
    },
    async saveAssessmentAnswer(_token, questionId, optionId) {
      session.responses[questionId] = optionId;
      session.responseVersion += 1;
      return { version: session.responseVersion, savedAt: new Date().toISOString() };
    },
    async submitAssessment() {
      return {
        applicationReference: session.applicationReference,
        verificationToken: "demo-verification-token"
      };
    }
  };
}

export function createDemoVerificationClient(state = "pending") {
  return {
    async getVerificationStatus() {
      return {
        state,
        applicationReference: "AUR-PREVIEW",
        candidateEmail: "candidate@example.com",
        role: { title: "Senior AI Product Engineer" },
        verification: {
          amountMinor: 299,
          currency: "EUR"
        },
        checkoutAvailable: true,
        payment: {
          provider: "wise",
          mode: "manual",
          url: "https://wise.com/pay/r/nAx15LFiReIdtjc"
        }
      };
    }
  };
}

export const hiringClient = createHiringClient();
