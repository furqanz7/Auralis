import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const POSITION_STORAGE_KEY = "auralis:hiring:assessment-position";

function readStoredIndex(roleSlug, questionCount) {
  try {
    const stored = JSON.parse(sessionStorage.getItem(POSITION_STORAGE_KEY));
    if (stored?.roleSlug !== roleSlug || !Number.isInteger(stored?.activeIndex)) {
      return 0;
    }
    return Math.max(0, Math.min(questionCount - 1, stored.activeIndex));
  } catch {
    return 0;
  }
}

function responseMap(value) {
  return value && typeof value === "object" ? { ...value } : {};
}

function terminalStatus(error) {
  if (error?.code === "ASSESSMENT_EXPIRED") return "expired";
  if (error?.code === "ASSESSMENT_LOCKED") return "submitted";
  return "unavailable";
}

export function useAssessmentSession({ token, client }) {
  const [status, setStatus] = useState("loading");
  const [session, setSession] = useState(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [responses, setResponses] = useState({});
  const [acknowledged, setAcknowledged] = useState({});
  const [saveStates, setSaveStates] = useState({});
  const [remainingSeconds, setRemainingSeconds] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const mountedRef = useRef(true);
  const versionRef = useRef(0);
  const responsesRef = useRef({});
  const acknowledgedRef = useRef({});
  const pendingRef = useRef(new Map());
  const savingRef = useRef(new Set());
  const submittingRef = useRef(false);
  const expiryRequestedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const applyServerPayload = useCallback((payload, { keepIndex = false } = {}) => {
    setError(null);
    if (payload?.status === "invited") {
      setSession(payload);
      setStatus("invited");
      return;
    }
    if (payload?.status === "submitted") {
      setResult(payload);
      setStatus("submitted");
      return;
    }
    if (payload?.status !== "started" || !Array.isArray(payload.questions)) {
      setStatus("unavailable");
      return;
    }

    const serverResponses = responseMap(payload.responses);
    versionRef.current = Number.isInteger(payload.responseVersion)
      ? payload.responseVersion
      : 0;
    responsesRef.current = serverResponses;
    acknowledgedRef.current = serverResponses;
    pendingRef.current.clear();
    savingRef.current.clear();
    expiryRequestedRef.current = false;
    submittingRef.current = false;

    setSession(payload);
    setResponses(serverResponses);
    setAcknowledged(serverResponses);
    setSaveStates(
      Object.fromEntries(Object.keys(serverResponses).map((questionId) => [questionId, "saved"]))
    );
    if (!keepIndex) {
      setActiveIndex(readStoredIndex(payload.role?.slug, payload.questions.length));
    }
    const deadline = new Date(payload.deadlineAt).getTime();
    setRemainingSeconds(
      Number.isFinite(deadline)
        ? Math.max(0, Math.ceil((deadline - Date.now()) / 1000))
        : 0
    );
    setStatus("active");
  }, []);

  useEffect(() => {
    let current = true;
    setStatus("loading");
    client
      .getAssessment(token)
      .then((payload) => {
        if (current) applyServerPayload(payload);
      })
      .catch((requestError) => {
        if (current) {
          setError(requestError?.code ?? "ASSESSMENT_INVALID");
          setStatus(terminalStatus(requestError));
        }
      });
    return () => {
      current = false;
    };
  }, [applyServerPayload, client, token]);

  useEffect(() => {
    if (status !== "active" || !session?.deadlineAt) return undefined;
    const deadline = new Date(session.deadlineAt).getTime();
    const update = () => {
      setRemainingSeconds(
        Number.isFinite(deadline)
          ? Math.max(0, Math.ceil((deadline - Date.now()) / 1000))
          : 0
      );
    };
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [session?.deadlineAt, status]);

  useEffect(() => {
    if (status !== "active" || !session?.role?.slug) return;
    try {
      sessionStorage.setItem(
        POSITION_STORAGE_KEY,
        JSON.stringify({ roleSlug: session.role.slug, activeIndex })
      );
    } catch {
      // Session position is a convenience only.
    }
  }, [activeIndex, session?.role?.slug, status]);

  const flushQuestion = useCallback(
    async function flushQuestion(questionId) {
      if (savingRef.current.has(questionId)) return;
      savingRef.current.add(questionId);

      try {
        while (pendingRef.current.has(questionId) && mountedRef.current) {
          const optionId = pendingRef.current.get(questionId);
          pendingRef.current.delete(questionId);
          setSaveStates((current) => ({ ...current, [questionId]: "saving" }));

          try {
            const saved = await client.saveAssessmentAnswer(
              token,
              questionId,
              optionId,
              versionRef.current
            );
            versionRef.current = saved.version;

            if (
              !pendingRef.current.has(questionId) &&
              responsesRef.current[questionId] === optionId
            ) {
              const nextAcknowledged = {
                ...acknowledgedRef.current,
                [questionId]: optionId
              };
              acknowledgedRef.current = nextAcknowledged;
              setAcknowledged(nextAcknowledged);
              setSaveStates((current) => ({ ...current, [questionId]: "saved" }));
            }
          } catch (saveError) {
            if (saveError?.code !== "ANSWER_CONFLICT") throw saveError;

            const refreshed = await client.getAssessment(token);
            if (refreshed?.status !== "started") throw saveError;
            const serverResponses = responseMap(refreshed.responses);
            const desiredOption =
              pendingRef.current.get(questionId) ??
              responsesRef.current[questionId] ??
              optionId;

            versionRef.current = refreshed.responseVersion;
            acknowledgedRef.current = serverResponses;
            responsesRef.current = {
              ...serverResponses,
              [questionId]: desiredOption
            };
            setSession(refreshed);
            setAcknowledged(serverResponses);
            setResponses(responsesRef.current);

            if (serverResponses[questionId] === desiredOption) {
              const nextAcknowledged = {
                ...serverResponses,
                [questionId]: desiredOption
              };
              acknowledgedRef.current = nextAcknowledged;
              setAcknowledged(nextAcknowledged);
              setSaveStates((current) => ({ ...current, [questionId]: "saved" }));
              pendingRef.current.delete(questionId);
            } else {
              pendingRef.current.set(questionId, desiredOption);
            }
          }
        }
      } catch (saveError) {
        if (!mountedRef.current) return;
        setError(saveError?.code ?? "ANSWER_SAVE_FAILED");
        setSaveStates((current) => ({ ...current, [questionId]: "error" }));
        if (saveError?.code === "ASSESSMENT_EXPIRED") setStatus("expired");
        if (saveError?.code === "ASSESSMENT_LOCKED") setStatus("submitted");
      } finally {
        savingRef.current.delete(questionId);
        if (pendingRef.current.has(questionId) && mountedRef.current) {
          queueMicrotask(() => flushQuestion(questionId));
        }
      }
    },
    [client, token]
  );

  const selectAnswer = useCallback(
    (questionId, optionId) => {
      if (status !== "active") return;
      const question = session?.questions?.find((candidate) => candidate.id === questionId);
      if (!question?.options?.some((option) => option.id === optionId)) return;

      const nextResponses = { ...responsesRef.current, [questionId]: optionId };
      const nextAcknowledged = { ...acknowledgedRef.current };
      if (nextAcknowledged[questionId] !== optionId) delete nextAcknowledged[questionId];
      responsesRef.current = nextResponses;
      acknowledgedRef.current = nextAcknowledged;
      pendingRef.current.set(questionId, optionId);
      setResponses(nextResponses);
      setAcknowledged(nextAcknowledged);
      setSaveStates((current) => ({ ...current, [questionId]: "saving" }));
      setError(null);
      void flushQuestion(questionId);
    },
    [flushQuestion, session?.questions, status]
  );

  const start = useCallback(async () => {
    if (status !== "invited") return;
    setStatus("starting");
    setError(null);
    try {
      applyServerPayload(await client.startAssessment(token));
    } catch (startError) {
      setError(startError?.code ?? "ASSESSMENT_INVALID");
      setStatus(terminalStatus(startError));
    }
  }, [applyServerPayload, client, status, token]);

  const performSubmit = useCallback(
    async (dueToExpiry = false) => {
      if (submittingRef.current || (status !== "active" && !dueToExpiry)) return;
      if (!dueToExpiry) {
        const allAcknowledged = session?.questions?.every(
          (question) =>
            responsesRef.current[question.id] &&
            acknowledgedRef.current[question.id] === responsesRef.current[question.id]
        );
        if (!allAcknowledged) return;
      }

      submittingRef.current = true;
      setStatus("submitting");
      setError(null);
      try {
        const submission = await client.submitAssessment(token);
        if (!mountedRef.current) return;
        setResult(submission);
        setStatus("submitted");
      } catch (submitError) {
        if (!mountedRef.current) return;
        setError(submitError?.code ?? "ASSESSMENT_SUBMIT_FAILED");
        const nextStatus = terminalStatus(submitError);
        setStatus(nextStatus === "unavailable" ? "active" : nextStatus);
        if (nextStatus === "unavailable") submittingRef.current = false;
      }
    },
    [client, session?.questions, status, token]
  );

  useEffect(() => {
    if (
      status === "active" &&
      remainingSeconds === 0 &&
      !expiryRequestedRef.current
    ) {
      expiryRequestedRef.current = true;
      void performSubmit(true);
    }
  }, [performSubmit, remainingSeconds, status]);

  const currentQuestion = session?.questions?.[activeIndex] ?? null;
  const currentResponse = currentQuestion ? responses[currentQuestion.id] : null;
  const saveState = currentQuestion
    ? saveStates[currentQuestion.id] ?? (currentResponse ? "saving" : "idle")
    : "idle";
  const canContinue = Boolean(
    currentQuestion &&
      currentResponse &&
      acknowledged[currentQuestion.id] === currentResponse &&
      saveState === "saved"
  );

  const answeredCount = useMemo(
    () =>
      session?.questions?.filter(
        (question) =>
          Boolean(responses[question.id]) &&
          acknowledged[question.id] === responses[question.id]
      ).length ?? 0,
    [acknowledged, responses, session?.questions]
  );

  const goBack = useCallback(() => {
    setActiveIndex((current) => Math.max(0, current - 1));
  }, []);

  const goNext = useCallback(() => {
    if (!canContinue) return;
    setActiveIndex((current) =>
      Math.min((session?.questions?.length ?? 1) - 1, current + 1)
    );
  }, [canContinue, session?.questions?.length]);

  const retrySave = useCallback(() => {
    if (currentQuestion && currentResponse) {
      selectAnswer(currentQuestion.id, currentResponse);
    }
  }, [currentQuestion, currentResponse, selectAnswer]);

  return {
    status,
    session,
    result,
    error,
    questions: session?.questions ?? [],
    currentQuestion,
    activeIndex,
    responses,
    answeredCount,
    saveState,
    canContinue,
    remainingSeconds,
    selectAnswer,
    start,
    goBack,
    goNext,
    retrySave,
    submit: () => performSubmit(false)
  };
}
