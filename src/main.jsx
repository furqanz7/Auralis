import barba from "@barba/core";
import anime from "animejs";
import { Analytics } from "@vercel/analytics/react";
import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { AppRoutes } from "./routes/AppRoutes.jsx";
import "./styles.css";
import "./hiring/styles.css";

const roots = new WeakMap();
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const analyticsMode =
  window.location.hostname === "localhost" ||
  window.location.hostname === "127.0.0.1"
    ? "development"
    : "production";

function runEntrance(container) {
  if (reduceMotion) return;
  anime({
    targets: container.querySelectorAll(".hero-proof span, .service-tabs button"),
    translateY: [18, 0],
    opacity: [0, 1],
    delay: anime.stagger(55, { start: 240 }),
    duration: 900,
    easing: "easeOutExpo"
  });
  anime({
    targets: container.querySelectorAll(".capability-item"),
    scale: [0.86, 1],
    opacity: [0, 1],
    delay: anime.stagger(75),
    duration: 850,
    easing: "easeOutBack"
  });
}

function mount(container) {
  const rootTarget = container.querySelector("#root");
  if (!rootTarget || roots.has(container)) return;
  const page = container.dataset.barbaNamespace || "home";
  const root = createRoot(rootTarget);
  roots.set(container, root);
  root.render(
    <React.StrictMode>
      <BrowserRouter>
        <AppRoutes page={page} />
      </BrowserRouter>
      {analyticsMode === "production" ? <Analytics mode="production" /> : null}
    </React.StrictMode>
  );
  window.requestAnimationFrame(() => runEntrance(container));
}

function unmount(container) {
  const root = roots.get(container);
  if (!root) return;
  root.unmount();
  roots.delete(container);
}

function veilIn() {
  if (reduceMotion) return Promise.resolve();
  const veil = document.querySelector(".route-veil");
  if (!veil) return Promise.resolve();
  veil.classList.add("is-active");
  return anime({
    targets: veil,
    translateY: ["100%", "0%"],
    duration: 620,
    easing: "easeInOutExpo"
  }).finished;
}

function veilOut() {
  const veil = document.querySelector(".route-veil");
  if (reduceMotion || !veil) return Promise.resolve();
  return anime({
    targets: veil,
    translateY: ["0%", "-100%"],
    duration: 720,
    easing: "easeInOutExpo",
    complete: () => {
      veil.style.transform = "translateY(100%)";
      veil.classList.remove("is-active");
    }
  }).finished;
}

const initialContainer = document.querySelector('[data-barba="container"]');

barba.init({
  preventRunning: true,
  prevent: ({ el }) => {
    const href = el?.getAttribute?.("href");
    return (
      el?.hasAttribute?.("data-no-barba") ||
      !href ||
      href.startsWith("#") ||
      href.startsWith("mailto:") ||
      href.startsWith("tel:") ||
      el.origin !== window.location.origin
    );
  },
  transitions: [
    {
      name: "auralis-ethereal-route",
      once(data) {
        mount(data.next.container);
      },
      async leave(data) {
        await veilIn();
        unmount(data.current.container);
      },
      enter(data) {
        window.scrollTo({ top: 0, left: 0, behavior: "instant" });
        mount(data.next.container);
        return veilOut();
      }
    }
  ]
});

if (initialContainer && !roots.has(initialContainer)) {
  mount(initialContainer);
}
