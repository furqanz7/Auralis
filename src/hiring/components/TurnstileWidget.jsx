import { useEffect, useRef } from "react";

let scriptPromise;

function loadTurnstile() {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector("script[data-auralis-turnstile]");
    const script = existing ?? document.createElement("script");
    script.addEventListener("load", () => resolve(window.turnstile), { once: true });
    script.addEventListener(
      "error",
      () => reject(new Error("Turnstile failed to load.")),
      { once: true }
    );
    if (!existing) {
      script.src =
        "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.defer = true;
      script.dataset.auralisTurnstile = "true";
      document.head.append(script);
    }
  });
  return scriptPromise;
}

export default function TurnstileWidget({ siteKey, onToken, turnstileApi }) {
  const elementRef = useRef(null);

  useEffect(() => {
    let disposed = false;
    let api;
    let widgetId;

    async function renderChallenge() {
      api = turnstileApi ?? (await loadTurnstile());
      if (disposed || !api || !elementRef.current) return;
      widgetId = api.render(elementRef.current, {
        sitekey: siteKey,
        action: "hiring_application",
        appearance: "interaction-only",
        size: "flexible",
        theme: "dark",
        callback: onToken,
        "expired-callback": () => onToken(""),
        "error-callback": () => onToken("")
      });
    }

    renderChallenge().catch(() => onToken(""));
    return () => {
      disposed = true;
      if (api && widgetId !== undefined) api.remove(widgetId);
    };
  }, [onToken, siteKey, turnstileApi]);

  return (
    <div
      ref={elementRef}
      className="hiring-turnstile"
      aria-label="Security verification"
    />
  );
}
