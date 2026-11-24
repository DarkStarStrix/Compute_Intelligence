import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

// Fixed overlays must escape animated/transformed ancestors of the dashboard.
export function Modal({
  titleId,
  children,
  onClose,
  wide = false,
}: {
  titleId: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close.current();
        return;
      }
      if (event.key !== "Tab") return;
      const controls = [
        ...panel.current!.querySelectorAll<HTMLElement>(
          'button:not([disabled]),a[href],input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),summary,[tabindex="0"]'
        ),
      ].filter(element => {
        if (
          element.tabIndex < 0 ||
          element.closest('[hidden], [inert], [aria-hidden="true"]')
        )
          return false;
        for (
          let ancestor: HTMLElement | null = element;
          ancestor && ancestor !== panel.current;
          ancestor = ancestor.parentElement
        ) {
          const style = getComputedStyle(ancestor);
          if (style.display === "none" || style.visibility === "hidden")
            return false;
          if (
            ancestor instanceof HTMLDetailsElement &&
            !ancestor.open &&
            !ancestor.querySelector("summary")?.contains(element)
          )
            return false;
        }
        return true;
      });
      const first = controls[0],
        last = controls.at(-1);
      if (!first) {
        event.preventDefault();
        return;
      }
      if (
        event.shiftKey &&
        (document.activeElement === first ||
          document.activeElement === panel.current)
      ) {
        event.preventDefault();
        last?.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last ||
          document.activeElement === panel.current)
      ) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      document.body.style.overflow = overflow;
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  return createPortal(
    <div
      className="fixed inset-0 z-[200] bg-black/50 flex items-center justify-center p-4"
      onMouseDown={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`bg-card border border-border rounded-xl shadow-2xl w-full ${wide ? "max-w-5xl" : "max-w-sm"} max-h-[90vh] overflow-y-auto overscroll-contain outline-none`}
      >
        {children}
      </div>
    </div>,
    document.body
  );
}
