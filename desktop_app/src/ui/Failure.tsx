import type { ActionState } from "./context";

/** Explains, where the action was attempted, why it did not save - or that it saved but is not yet finished. */
export function Failure({ action }: { action: Pick<ActionState<unknown>, "failure" | "warning" | "dismiss"> }) {
  if (action.failure) {
    return (
      <p className="failure" role="alert">
        Not saved: {action.failure}{" "}
        <button type="button" className="link" onClick={action.dismiss}>
          Dismiss
        </button>
      </p>
    );
  }
  if (action.warning) {
    return (
      <p className="warning" role="status">
        {action.warning}{" "}
        <button type="button" className="link" onClick={action.dismiss}>
          Dismiss
        </button>
      </p>
    );
  }
  return null;
}
