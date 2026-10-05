/** An action that cannot be carried out, with the reason, which the screen shows where it was attempted. */
export interface Refusal<E> {
  refused: E;
}

export function refuse<E>(reason: E): Refusal<E> {
  return { refused: reason };
}

export function isRefusal<T extends object, E>(outcome: T | Refusal<E>): outcome is Refusal<E> {
  return "refused" in outcome;
}
