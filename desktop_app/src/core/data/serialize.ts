// Turns the in-memory data into file text, in the one canonical layout: fixed key order,
// name-keyed maps and lists sorted ignoring case, optional fields omitted. Saving unchanged
// data therefore always produces byte-identical files.

import { JsonObjectOut, obj, writeJson, type JsonOut } from "./jsonWrite";
import type { AppData, DataFileName, Hangar, ItemCatalog, Manifest, Plan, PlanStep, Quantities, Recipe, RecipeRef } from "./model";
import { compareNames, sortedEntries } from "./names";

export const MANIFEST_NOTE = "Data folder of EVE Industry Calculator. Only edit these files while the application is closed.";

export function serializeManifest(manifest: Manifest): string {
  return writeJson(
    obj(["formatVersion", manifest.formatVersion], ["writtenBy", manifest.writtenBy], ["note", MANIFEST_NOTE]),
  );
}

export function serializeItems(items: ItemCatalog): string {
  return writeJson(
    obj(
      ["categories", new JsonObjectOut(sortedEntries(items.categories).map(([name, members]) => [name, sortedNames(members)]))],
      ["uncategorised", sortedNames(items.uncategorised)],
    ),
  );
}

export function serializeRecipes(recipes: readonly Recipe[]): string {
  const sorted = [...recipes].sort(compareRecipes);
  return writeJson(
    obj([
      "recipes",
      sorted.map((r) =>
        obj(
          ["product", r.product],
          ["variant", r.variant],
          ["type", r.type],
          ["output", r.output],
          ["notes", r.notes],
          ["inputs", quantities(r.inputs)],
        ),
      ),
    ]),
  );
}

export function serializeHangar(hangar: Hangar): string {
  return writeJson(obj(["stock", quantities(hangar.stock)]));
}

/** Plans keep their order; there is no natural one to sort them into. */
export function serializePlans(plans: readonly Plan[]): string {
  return writeJson(obj(["plans", plans.map(plan)]));
}

export function serializeFile(file: DataFileName, data: AppData): string {
  switch (file) {
    case "manifest.json":
      return serializeManifest(data.manifest);
    case "items.json":
      return serializeItems(data.items);
    case "recipes.json":
      return serializeRecipes(data.recipes);
    case "hangar.json":
      return serializeHangar(data.hangar);
    case "plans.json":
      return serializePlans(data.plans);
  }
}

function plan(p: Plan): JsonOut {
  return obj(
    ["name", p.name],
    ["target", recipeRef(p.target)],
    ["runs", p.runs],
    ["created", p.created],
    ["completed", p.completed],
    ["variantChoices", p.variantChoices.size > 0 ? new JsonObjectOut(sortedEntries(p.variantChoices)) : undefined],
    ["reserved", p.reserved && quantities(p.reserved)],
    ["steps", p.steps.map(step)],
  );
}

function step(s: PlanStep): JsonOut {
  return obj(
    ["state", s.state],
    ["product", s.product],
    ["variant", s.variant],
    ["runs", s.runs],
    ["inputsPerRun", quantities(s.inputsPerRun)],
    ["outputPerRun", s.outputPerRun],
    ["takenFrom", s.takenFrom],
    ["deducted", s.deducted && quantities(s.deducted)],
    ["short", s.short && quantities(s.short)],
    ["started", s.started],
    ["done", s.done],
    ["addedToReserved", s.addedToReserved],
    ["addedToGeneral", s.addedToGeneral],
    ["notRemoved", s.notRemoved],
  );
}

function recipeRef(ref: RecipeRef): JsonOut {
  return obj(["product", ref.product], ["variant", ref.variant]);
}

function quantities(q: Quantities): JsonObjectOut {
  return new JsonObjectOut(sortedEntries(q));
}

function sortedNames(names: readonly string[]): string[] {
  return [...names].sort(compareNames);
}

/** By product, then variant; a recipe without a variant label comes first. */
export function compareRecipes(a: RecipeRef, b: RecipeRef): number {
  return compareNames(a.product, b.product) || compareNames(a.variant ?? "", b.variant ?? "");
}
