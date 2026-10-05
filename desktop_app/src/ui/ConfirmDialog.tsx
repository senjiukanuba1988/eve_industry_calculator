import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ConfirmContext, type ConfirmRequest } from "./context";

interface Pending {
  request: ConfirmRequest;
  resolve: (confirmed: boolean) => void;
}

/** Makes `useConfirm` available below it, and shows the dialog it asks for. */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | undefined>();

  const confirm = useCallback(
    (request: ConfirmRequest) =>
      new Promise<boolean>((resolve) => {
        setPending((previous) => {
          previous?.resolve(false);
          return { request, resolve };
        });
      }),
    [],
  );

  const answer = (confirmed: boolean) => {
    pending?.resolve(confirmed);
    setPending(undefined);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {pending && <ConfirmDialog request={pending.request} onAnswer={answer} />}
    </ConfirmContext.Provider>
  );
}

/** A modal question that states what will be lost. Cancel has the focus, so Enter alone never destroys anything. */
function ConfirmDialog({ request, onAnswer }: { request: ConfirmRequest; onAnswer: (confirmed: boolean) => void }) {
  const titleId = useId();
  const bodyId = useId();
  const cancel = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancel.current?.focus();
  }, []);

  return (
    <div className="modal-backdrop">
      <div
        className="modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.stopPropagation();
            onAnswer(false);
          }
        }}
      >
        <h2 id={titleId}>{request.title}</h2>
        <ul id={bodyId} className="consequences">
          {request.consequences.map((c, i) => (
            <li key={i}>{c}</li>
          ))}
        </ul>
        <div className="actions">
          <button type="button" className="danger" onClick={() => onAnswer(true)}>
            {request.confirmLabel}
          </button>
          <button type="button" ref={cancel} onClick={() => onAnswer(false)}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
