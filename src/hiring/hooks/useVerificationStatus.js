import { useEffect, useState } from "react";

const TERMINAL_STATES = new Set(["completed", "failed"]);

export function useVerificationStatus({
  token,
  client,
  pollInterval = 2000,
  maxWaitMs = 120_000
}) {
  const [state, setState] = useState({
    status: "loading",
    data: null,
    error: null,
    timedOut: false
  });

  useEffect(() => {
    let active = true;
    let timer = null;
    const startedAt = Date.now();

    async function poll() {
      if (!active) return;
      const elapsed = Date.now() - startedAt;
      if (elapsed >= maxWaitMs) {
        setState((current) => ({
          ...current,
          status: "processing",
          timedOut: true
        }));
        return;
      }

      try {
        const data = await client.getVerificationStatus(token);
        if (!active) return;
        const status = TERMINAL_STATES.has(data.state)
          ? data.state
          : data.state === "processing"
            ? "processing"
            : "pending";
        setState({ status, data, error: null, timedOut: false });
        if (TERMINAL_STATES.has(status)) return;

        const remaining = maxWaitMs - (Date.now() - startedAt);
        timer = window.setTimeout(poll, Math.max(1, Math.min(pollInterval, remaining)));
      } catch (error) {
        if (!active) return;
        setState({
          status: "error",
          data: null,
          error: error?.code ?? "VERIFICATION_STATUS_FAILED",
          timedOut: false
        });
      }
    }

    void poll();
    return () => {
      active = false;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [client, maxWaitMs, pollInterval, token]);

  return state;
}
