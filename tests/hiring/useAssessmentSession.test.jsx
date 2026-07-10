import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { HiringApiError } from "../../src/hiring/api/hiringClient.js";
import { useAssessmentSession } from "../../src/hiring/hooks/useAssessmentSession.js";

const NOW = new Date("2026-07-10T12:00:00.000Z");

function question(id = "question-1") {
  return {
    id,
    prompt: `A sufficiently detailed assessment prompt for ${id}?`,
    options: [
      { id: "a", label: "Option alpha" },
      { id: "b", label: "Option beta" },
      { id: "c", label: "Option gamma" },
      { id: "d", label: "Option delta" }
    ]
  };
}

function started(overrides = {}) {
  return {
    status: "started",
    applicationReference: "AUR-1",
    role: { slug: "senior-ai-product-engineer", title: "Senior AI Product Engineer" },
    questions: [question()],
    startedAt: NOW.toISOString(),
    deadlineAt: new Date(NOW.getTime() + 20 * 60 * 1000).toISOString(),
    responseVersion: 0,
    responses: {},
    ...overrides
  };
}

function client(overrides = {}) {
  return {
    getAssessment: vi.fn(async () => started()),
    startAssessment: vi.fn(async () => started()),
    saveAssessmentAnswer: vi.fn(async () => ({ version: 1, savedAt: NOW.toISOString() })),
    submitAssessment: vi.fn(async () => ({
      applicationReference: "AUR-1",
      verificationToken: "verification-token"
    })),
    ...overrides
  };
}

beforeEach(() => {
  sessionStorage.clear();
  vi.useRealTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useAssessmentSession", () => {
  test("loads the authoritative server session and acknowledges saved answers", async () => {
    const api = client();
    const { result } = renderHook(() =>
      useAssessmentSession({ token: "private-token", client: api })
    );

    await waitFor(() => expect(result.current.status).toBe("active"));
    expect(result.current.answeredCount).toBe(0);
    act(() => result.current.selectAnswer("question-1", "a"));

    await waitFor(() => expect(result.current.saveState).toBe("saved"));
    expect(api.saveAssessmentAnswer).toHaveBeenCalledWith(
      "private-token",
      "question-1",
      "a",
      0
    );
    expect(result.current.canContinue).toBe(true);
    expect(result.current.answeredCount).toBe(1);
  });

  test("coalesces rapid changes while one answer save is in flight", async () => {
    let resolveFirst;
    const firstSave = new Promise((resolve) => {
      resolveFirst = resolve;
    });
    const api = client({
      saveAssessmentAnswer: vi
        .fn()
        .mockReturnValueOnce(firstSave)
        .mockResolvedValueOnce({ version: 2, savedAt: NOW.toISOString() })
    });
    const { result } = renderHook(() =>
      useAssessmentSession({ token: "private-token", client: api })
    );
    await waitFor(() => expect(result.current.status).toBe("active"));

    act(() => result.current.selectAnswer("question-1", "a"));
    await waitFor(() => expect(api.saveAssessmentAnswer).toHaveBeenCalledTimes(1));
    act(() => result.current.selectAnswer("question-1", "b"));
    await act(async () => resolveFirst({ version: 1, savedAt: NOW.toISOString() }));

    await waitFor(() => expect(api.saveAssessmentAnswer).toHaveBeenCalledTimes(2));
    expect(api.saveAssessmentAnswer.mock.calls[1]).toEqual([
      "private-token",
      "question-1",
      "b",
      1
    ]);
    await waitFor(() => expect(result.current.saveState).toBe("saved"));
    expect(result.current.responses["question-1"]).toBe("b");
  });

  test("refreshes the server version and retries after an answer conflict", async () => {
    const api = client({
      getAssessment: vi
        .fn()
        .mockResolvedValueOnce(started())
        .mockResolvedValueOnce(started({ responseVersion: 5 })),
      saveAssessmentAnswer: vi
        .fn()
        .mockRejectedValueOnce(new HiringApiError("ANSWER_CONFLICT", 409))
        .mockResolvedValueOnce({ version: 6, savedAt: NOW.toISOString() })
    });
    const { result } = renderHook(() =>
      useAssessmentSession({ token: "private-token", client: api })
    );
    await waitFor(() => expect(result.current.status).toBe("active"));

    act(() => result.current.selectAnswer("question-1", "c"));

    await waitFor(() => expect(api.saveAssessmentAnswer).toHaveBeenCalledTimes(2));
    expect(api.saveAssessmentAnswer.mock.calls[1][4]).toBeUndefined();
    expect(api.saveAssessmentAnswer.mock.calls[1]).toEqual([
      "private-token",
      "question-1",
      "c",
      5
    ]);
    await waitFor(() => expect(result.current.saveState).toBe("saved"));
  });

  test("asks the server to lock the attempt when the displayed timer reaches zero", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const api = client({
      getAssessment: vi.fn(async () =>
        started({ deadlineAt: new Date(NOW.getTime() + 1000).toISOString() })
      ),
      submitAssessment: vi.fn(async () => {
        throw new HiringApiError("ASSESSMENT_EXPIRED", 410);
      })
    });
    const { result } = renderHook(() =>
      useAssessmentSession({ token: "private-token", client: api })
    );

    await act(async () => Promise.resolve());
    expect(result.current.status).toBe("active");
    expect(result.current.remainingSeconds).toBe(1);
    await act(async () => vi.advanceTimersByTimeAsync(1000));
    await act(async () => Promise.resolve());

    expect(api.submitAssessment).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe("expired");
  });

  test("guards final submission against duplicate actions", async () => {
    let resolveSubmit;
    const api = client({
      submitAssessment: vi.fn(
        () => new Promise((resolve) => {
          resolveSubmit = resolve;
        })
      )
    });
    const { result } = renderHook(() =>
      useAssessmentSession({ token: "private-token", client: api })
    );
    await waitFor(() => expect(result.current.status).toBe("active"));
    act(() => result.current.selectAnswer("question-1", "a"));
    await waitFor(() => expect(result.current.canContinue).toBe(true));

    act(() => {
      result.current.submit();
      result.current.submit();
    });
    expect(api.submitAssessment).toHaveBeenCalledTimes(1);
    await act(async () =>
      resolveSubmit({ applicationReference: "AUR-1", verificationToken: "private" })
    );
    expect(result.current.status).toBe("submitted");
  });
});
