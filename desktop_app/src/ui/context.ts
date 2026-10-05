// What every part of the screen can reach: the data and the way to change it, moving
// between sections, and asking for confirmation. The providers live in Shell.tsx and
// ConfirmDialog.tsx; these are the hooks that read them.

import { createContext, useCallback, useContext, useState, useSyncExternalStore, type ReactNode } from "react";
import type { ActionResult, Change, DataStore } from "../app/store";
import type { AppData, RecipeRef } from "../core/data/model";

export const StoreContext = createContext<DataStore | undefined>(undefined);

export function useStore(): DataStore {
  const store = useContext(StoreContext);
  if (!store) {
    throw new Error("useStore outside a StoreContext");
  }
  return store;
}

/** The current data; the component renders again whenever it changes. */
export function useAppData(): AppData {
  const store = useStore();
  return useSyncExternalStore(
    useCallback((listener) => store.subscribe(listener), [store]),
    () => store.current,
  );
}

/** The state of an action started from one place on screen, for explaining a failure right there. */
export interface ActionState<E> {
  /** Runs the change and resolves with its result once it is on disk, refused or failed. */
  run: (change: Change<E>) => Promise<ActionResult<E>>;
  pending: boolean;
  /** Why the last attempt failed to save. Cleared by the next attempt. */
  failure?: string;
  /** Set when the last change was saved but could not be finished until the next start. */
  warning?: string;
  dismiss: () => void;
}

/**
 * Runs actions for one place on screen. A refusal is returned to the caller to show at the
 * field at fault; a failure to save is kept in `failure`. Neither touches the caller's own
 * input state, so nothing the user typed is lost.
 */
export function useAction<E = string>(): ActionState<E> {
  const store = useStore();
  const [state, setState] = useState<{ pending: boolean; failure?: string; warning?: string }>({ pending: false });
  const run = useCallback(
    async (change: Change<E>) => {
      setState({ pending: true });
      const result = await store.apply(change);
      setState({
        pending: false,
        failure: result.status === "failed" ? result.message : undefined,
        warning: result.status === "saved" ? result.warning : undefined,
      });
      return result;
    },
    [store],
  );
  const dismiss = useCallback(() => setState({ pending: false }), []);
  return { run, dismiss, ...state };
}

export const SECTIONS = ["plans", "recipes", "hangar", "items", "dataFolder"] as const;

export type Section = (typeof SECTIONS)[number];

/** What the Recipes section shows: the list, or the form for a new recipe or an existing one. */
export type RecipesView = { kind: "list" } | { kind: "form"; original?: RecipeRef; id: number };

let lastFormId = 0;

/** A fresh id for a form being opened, so that opening it again starts it afresh. */
export function nextFormId(): number {
  return ++lastFormId;
}

/** Somewhere to go: a section, optionally with what to open in it. */
export type Destination = Section | { section: "recipes"; open: "new" | RecipeRef };

export const NavigationContext = createContext<(to: Destination) => void>(() => undefined);

/** Switches the main panel to another section, and opens something there if asked to. */
export function useGoTo(): (to: Destination) => void {
  return useContext(NavigationContext);
}

export interface ConfirmRequest {
  title: string;
  /** What the user will lose, specifically. One entry per consequence. */
  consequences: ReactNode[];
  /** Names the action, e.g. "Reset hangar" - never just "OK". */
  confirmLabel: string;
}

/** Asks for confirmation; resolves true only if the user confirmed. */
export type Confirm = (request: ConfirmRequest) => Promise<boolean>;

export const ConfirmContext = createContext<Confirm | undefined>(undefined);

export function useConfirm(): Confirm {
  const confirm = useContext(ConfirmContext);
  if (!confirm) {
    throw new Error("useConfirm outside a ConfirmProvider");
  }
  return confirm;
}
