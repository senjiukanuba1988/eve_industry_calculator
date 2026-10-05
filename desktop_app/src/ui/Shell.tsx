import { useState, type ReactNode } from "react";
import { APP_VERSION } from "../appInfo";
import type { DataFolder } from "../storage/fileSystem";
import { NavigationContext, nextFormId, useAppData, type Destination, type RecipesView, type Section } from "./context";
import { DataFolderSection } from "./sections/DataFolderSection";
import { HangarSection } from "./sections/HangarSection";
import { ItemsSection } from "./sections/ItemsSection";
import { PlansSection } from "./sections/PlansSection";
import { RecipesSection } from "./sections/RecipesSection";

interface ShellProps {
  folder: DataFolder;
  /** Shown above whichever section is open, e.g. the one-off conversion message. */
  banner?: ReactNode;
}

/**
 * The one window: a sidebar of sections and a main panel. Every section stays mounted and
 * is only hidden while another is shown, so switching back finds it exactly as it was.
 * Nothing about the screen outlives the session: the app always starts on Plans.
 */
export function Shell({ folder, banner }: ShellProps) {
  const [section, setSection] = useState<Section>("plans");
  // Kept here rather than in the section, so that other sections can open a recipe.
  const [recipesView, setRecipesView] = useState<RecipesView>({ kind: "list" });

  const goTo = (to: Destination) => {
    if (typeof to === "string") {
      setSection(to);
      return;
    }
    setSection(to.section);
    setRecipesView({ kind: "form", original: to.open === "new" ? undefined : to.open, id: nextFormId() });
  };
  const data = useAppData();

  const openPlans = data.plans.filter((p) => p.completed === undefined).length;
  const itemCount = [...data.items.categories.values()].reduce((n, items) => n + items.length, data.items.uncategorised.length);

  const nav = (id: Section, label: string, count?: number) => (
    <li>
      <button type="button" aria-current={section === id ? "page" : undefined} onClick={() => setSection(id)}>
        <span>{label}</span>
        {count !== undefined && <span className="count">{count}</span>}
      </button>
    </li>
  );

  const panel = (id: Section, content: ReactNode) => (
    <div className="panel" hidden={section !== id}>
      {content}
    </div>
  );

  return (
    <NavigationContext.Provider value={goTo}>
      <div className="shell">
        <nav className="sidebar" aria-label="Sections">
          <ul>
            {nav("plans", "Plans", openPlans)}
            {nav("recipes", "Recipes", data.recipes.length)}
            {nav("hangar", "Hangar", data.hangar.stock.size)}
            {nav("items", "Items", itemCount)}
          </ul>
          <ul className="sidebar-foot">
            {nav("dataFolder", "Data folder")}
            <li className="version">v{APP_VERSION}</li>
          </ul>
        </nav>
        <main className="main">
          {banner}
          {panel("plans", <PlansSection />)}
          {panel("recipes", <RecipesSection view={recipesView} onViewChange={setRecipesView} />)}
          {panel("hangar", <HangarSection />)}
          {panel("items", <ItemsSection />)}
          {panel("dataFolder", <DataFolderSection folder={folder} />)}
        </main>
      </div>
    </NavigationContext.Provider>
  );
}
