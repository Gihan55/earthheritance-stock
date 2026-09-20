"use client";
import { X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";

export type ModalHandle = { close: () => void };

const CLOSE_EVENT = "form-dialog-close";

export function Modal({
  buttonLabel,
  buttonClass = "button button-primary",
  icon,
  title,
  description,
  wide = false,
  children,
}: {
  buttonLabel: string;
  buttonClass?: string;
  icon?: ReactNode;
  title: string;
  description?: string;
  wide?: boolean;
  children: (handle: ModalHandle) => ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  // Closing is delegated through a bubbling DOM event so no ref-capturing
  // closure is created during render (which the React Compiler disallows).
  const handle: ModalHandle = {
    close: () => {
      document.dispatchEvent(new Event(CLOSE_EVENT));
    },
  };
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const onClose = () => dialog.close();
    document.addEventListener(CLOSE_EVENT, onClose);
    return () => document.removeEventListener(CLOSE_EVENT, onClose);
  }, []);
  return (
    <>
      <button
        type="button"
        className={buttonClass}
        onClick={() => ref.current?.showModal()}
      >
        {icon}
        {buttonLabel}
      </button>
      <dialog
        ref={ref}
        className={`form-dialog${wide ? " form-dialog-wide" : ""}`}
        onClick={(event) => {
          if (event.target === ref.current) ref.current.close();
        }}
      >
        <div className="dialog-header">
          <div>
            <h2>{title}</h2>
            {description && <p>{description}</p>}
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="Close"
            onClick={() => ref.current?.close()}
          >
            <X size={18} />
          </button>
        </div>
        <div className="dialog-body">{children(handle)}</div>
      </dialog>
    </>
  );
}
