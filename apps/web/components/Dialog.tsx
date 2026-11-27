import { useEffect, useId, useRef } from "react";
import type { MouseEvent, ReactNode, RefObject, SyntheticEvent } from "react";

export type DialogProps = {
  /** Show the dialog. The parent renders it only while open. */
  open: boolean;
  /** Title shown in the fixed head row and used for `aria-labelledby`. */
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Element to focus on open. Defaults to the first control in the body. */
  initialFocus?: RefObject<HTMLElement | null>;
  /** Action row under the scrolling body. */
  footer?: ReactNode;
};

const FOCUSABLE_SELECTOR =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

function tabbableIn(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) => !element.hasAttribute("disabled"),
  );
}

/**
 * One accessible dialog on the native element.
 *
 * The native `showModal()` traps focus and closes on Escape through the
 * `cancel` event. Tests run without `showModal`, so that path falls back to
 * the `open` attribute with a small Tab and Escape trap on the window.
 */
export function Dialog({ open, title, onClose, children, initialFocus, footer }: DialogProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  const titleId = useId();

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const node = dialogRef.current;
    if (node === null || !open) {
      return undefined;
    }
    if (document.activeElement instanceof HTMLElement) {
      openerRef.current = document.activeElement;
    }

    try {
      if (!node.open && typeof node.showModal === "function") {
        node.showModal();
      }
    } catch {
      // jsdom has no modal dialog; the fallback below covers it.
    }
    const modal = node.open && !node.hasAttribute("open");
    if (!modal) {
      node.setAttribute("open", "");
    }

    const scope = bodyRef.current ?? node;
    const target = initialFocus?.current ?? tabbableIn(scope)[0] ?? tabbableIn(node)[0];
    target?.focus();

    if (modal) {
      return () => {
        openerRef.current?.focus();
      };
    }

    function handleKey(event: KeyboardEvent) {
      const live = dialogRef.current;
      if (live === null) {
        return;
      }
      if (event.key === "Escape") {
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") {
        return;
      }
      if (!live.contains(document.activeElement)) {
        return;
      }
      const items = tabbableIn(live);
      const first = items[0];
      const last = items[items.length - 1];
      if (first === undefined || last === undefined) {
        return;
      }
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("keydown", handleKey);
      if (node.open) {
        node.removeAttribute("open");
      }
      openerRef.current?.focus();
    };
  }, [open, initialFocus]);

  function handleCancel(event: SyntheticEvent) {
    event.preventDefault();
    onClose();
  }

  function handleBackdrop(event: MouseEvent<HTMLDialogElement>) {
    if (event.target === event.currentTarget) {
      onClose();
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className="dialog"
      aria-labelledby={titleId}
      onCancel={handleCancel}
      onMouseDown={handleBackdrop}
    >
      <div className="dialog__head">
        <h2 id={titleId}>{title}</h2>
        <button type="button" className="icon-button" aria-label="Close" onClick={onClose}>
          ×
        </button>
      </div>
      <div ref={bodyRef} className="dialog__body">
        {children}
      </div>
      {footer !== undefined && <footer className="dialog__foot">{footer}</footer>}
    </dialog>
  );
}
