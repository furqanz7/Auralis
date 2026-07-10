import { useEffect, useRef } from "react";

export default function PointerSystem() {
  const ringRef = useRef(null);
  const dotRef = useRef(null);
  const labelRef = useRef(null);

  useEffect(() => {
    const finePointer = window.matchMedia("(pointer: fine)");
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

    if (!finePointer.matches || reducedMotion.matches) return undefined;

    let frameId = 0;
    let hideTimer = 0;
    let pointerX = -120;
    let pointerY = -120;
    let renderedX = -120;
    let renderedY = -120;

    const render = () => {
      renderedX += (pointerX - renderedX) * 0.18;
      renderedY += (pointerY - renderedY) * 0.18;

      ringRef.current?.style.setProperty(
        "transform",
        `translate3d(${renderedX}px, ${renderedY}px, 0) translate(-50%, -50%)`
      );
      dotRef.current?.style.setProperty(
        "transform",
        `translate3d(${pointerX}px, ${pointerY}px, 0) translate(-50%, -50%)`
      );
      frameId = window.requestAnimationFrame(render);
    };

    const setTarget = (target) => {
      const label = target?.closest?.("[data-cursor-label]")?.dataset.cursorLabel || "";
      ringRef.current?.classList.toggle("is-active", Boolean(label));
      labelRef.current.textContent = label;
    };

    const onMove = (event) => {
      pointerX = event.clientX;
      pointerY = event.clientY;
      ringRef.current?.classList.add("is-visible");
      dotRef.current?.classList.add("is-visible");
      setTarget(event.target);
      window.clearTimeout(hideTimer);
      hideTimer = window.setTimeout(onLeave, 900);
    };

    const onLeave = () => {
      ringRef.current?.classList.remove("is-visible", "is-active");
      dotRef.current?.classList.remove("is-visible");
      labelRef.current.textContent = "";
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerleave", onLeave);
    frameId = window.requestAnimationFrame(render);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.clearTimeout(hideTimer);
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  return (
    <div className="pointer-system" aria-hidden="true">
      <span className="cursor-ring" ref={ringRef}>
        <span className="cursor-label" ref={labelRef} />
      </span>
      <span className="cursor-dot" ref={dotRef} />
    </div>
  );
}
