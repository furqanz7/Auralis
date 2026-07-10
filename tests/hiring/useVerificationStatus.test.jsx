import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { useVerificationStatus } from "../../src/hiring/hooks/useVerificationStatus.js";

afterEach(() => vi.useRealTimers());

describe("useVerificationStatus", () => {
  test("stops polling after server-confirmed completion", async () => {
    const client = {
      getVerificationStatus: vi.fn(async () => ({
        state: "completed",
        applicationReference: "AUR-1"
      }))
    };
    const { result } = renderHook(() =>
      useVerificationStatus({ token: "return-token", client, pollInterval: 10 })
    );

    await waitFor(() => expect(result.current.status).toBe("completed"));
    expect(client.getVerificationStatus).toHaveBeenCalledTimes(1);
  });

  test("polls pending state until the callback completes", async () => {
    vi.useFakeTimers();
    const client = {
      getVerificationStatus: vi
        .fn()
        .mockResolvedValueOnce({ state: "pending" })
        .mockResolvedValueOnce({ state: "processing" })
        .mockResolvedValueOnce({ state: "completed", applicationReference: "AUR-1" })
    };
    const { result } = renderHook(() =>
      useVerificationStatus({ token: "return-token", client, pollInterval: 1000 })
    );

    await act(async () => Promise.resolve());
    expect(result.current.status).toBe("pending");
    await act(async () => vi.advanceTimersByTimeAsync(1000));
    expect(result.current.status).toBe("processing");
    await act(async () => vi.advanceTimersByTimeAsync(1000));
    expect(result.current.status).toBe("completed");
  });

  test("shows processing after the bounded wait without claiming success", async () => {
    vi.useFakeTimers();
    const client = {
      getVerificationStatus: vi.fn(async () => ({ state: "pending" }))
    };
    const { result } = renderHook(() =>
      useVerificationStatus({
        token: "return-token",
        client,
        pollInterval: 30_000,
        maxWaitMs: 120_000
      })
    );

    await act(async () => Promise.resolve());
    await act(async () => vi.advanceTimersByTimeAsync(120_000));

    expect(result.current.status).toBe("processing");
    expect(result.current.timedOut).toBe(true);
    expect(result.current.status).not.toBe("completed");
  });
});
