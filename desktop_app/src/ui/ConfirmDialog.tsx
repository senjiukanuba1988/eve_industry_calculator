import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { ConfirmContext, type ChoiceRequest, type ConfirmRequest } from "./context";

type Answer = "confirm" | "alternative" | "cancel";

interface Pending {
  request: ConfirmRequest & { alternativeLabel?: string };
  resolve: (answer: Answer) => void;
}

/** Makes `useConfirm` available below it, and shows the dialog it asks for. */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | undefined>();

  const choose = useCallback(
    (request: ChoiceRequest | ConfirmRequest) =>
      new Promise<Answer>((resolve) => {
        setPending((previous) => {
          previous?.resolve("cancel");
          return { request, resolve };
        });
      }),
    [],
  );
  const value = useMemo(() => ({ choose, confirm: async (request: ConfirmRequest) => (await choose(request)) === "confirm" }), [choose]);

  const answer = (given: Answer) => {
    pending?.resolve(given);
    setPending(undefined);
  };

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      {pending && <ConfirmDialog request={pending.request} onAnswer={answer} />}
    </ConfirmContext.Provider>
  );
}

/** A modal question that states what will be lost. Cancel has the focus, so Enter alone never destroys anything. */
function ConfirmDialog({ request, onAnswer }: { request: Pending["request"]; onAnswer: (answer: Answer) => void }) {
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
            onAnswer("cancel");
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
          <button type="button" className="danger" onClick={() => onAnswer("confirm")}>
            {request.confirmLabel}
          </button>
          {request.alternativeLabel && (
            <button type="button" className="danger" onClick={() => onAnswer("alternative")}>
              {request.alternativeLabel}
            </button>
          )}
          <button type="button" ref={cancel} onClick={() => onAnswer("cancel")}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
