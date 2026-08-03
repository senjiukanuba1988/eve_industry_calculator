import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { ExplodeResult, HangarEntry, HangarUsage, RecipeDetail } from '../../models/recipe.model';
import { RecipeTypesService } from '../../services/recipe-types.service';
import { RecipesService } from '../../services/recipes.service';

@Component({
  selector: 'app-recipe-calculator',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './recipe-calculator.html',
  styleUrl: './recipe-calculator.scss',
})
export class RecipeCalculator implements OnInit {
  readonly recipe = signal<RecipeDetail | null>(null);
  readonly recipeTypeLabels = signal<Record<string, string>>({});
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  readonly result = signal<ExplodeResult | null>(null);
  readonly calculating = signal(false);
  readonly calculateError = signal<string | null>(null);

  runs = 1;
  hangarText = '';

  constructor(
    private readonly recipesService: RecipesService,
    private readonly recipeTypesService: RecipeTypesService,
    private readonly route: ActivatedRoute,
  ) {}

  ngOnInit(): void {
    this.recipeTypesService
      .list()
      .subscribe((types) =>
        this.recipeTypeLabels.set(Object.fromEntries(types.map((t) => [t.value, t.label]))),
      );

    const id = Number(this.route.snapshot.paramMap.get('id'));
    this.loading.set(true);

    this.recipesService.get(id).subscribe({
      next: (recipe) => {
        this.recipe.set(recipe);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Failed to load recipe.');
        this.loading.set(false);
      },
    });
  }

  recipeTypeLabel(value: string): string {
    return this.recipeTypeLabels()[value] ?? value;
  }

  usedFromHangar(usage: HangarUsage): number {
    return Math.min(usage.hangar_quantity, usage.needed_quantity);
  }

  stillNeeded(usage: HangarUsage): number {
    return usage.needed_quantity - this.usedFromHangar(usage);
  }

  remainingInHangar(usage: HangarUsage): number {
    return usage.hangar_quantity - this.usedFromHangar(usage);
  }

  usedHangarUsage(): HangarUsage[] {
    return (this.result()?.hangar_usage ?? []).filter((usage) => this.usedFromHangar(usage) > 0);
  }

  unusedHangarUsage(): HangarUsage[] {
    return (this.result()?.hangar_usage ?? []).filter((usage) => this.usedFromHangar(usage) === 0);
  }

  calculate(): void {
    const recipe = this.recipe();
    if (!recipe) {
      return;
    }

    if (this.runs < 1) {
      this.calculateError.set('Runs must be at least 1.');
      return;
    }

    this.calculateError.set(null);
    this.calculating.set(true);

    const hangar = this.parseHangar(this.hangarText);

    this.recipesService.explode(recipe.id, this.runs, hangar).subscribe({
      next: (result) => {
        this.result.set(result);
        this.calculating.set(false);
      },
      error: (err) => {
        this.calculateError.set(err?.error?.error ?? 'Failed to calculate materials.');
        this.calculating.set(false);
      },
    });
  }

  /**
   * Parses pasted hangar contents (EVE inventory or assets-window clipboard format).
   * The item name is everything before the first token that's purely numeric
   * (digits/./,), which is taken as the quantity; anything after that token
   * (category, volume, ISK value, ...) is ignored. No item name ends in a
   * standalone number - numbers only ever appear fused into a word (e.g.
   * "F77 Compact Co-Processor") - so this reliably finds the name/quantity split
   * regardless of whether columns are tab- or space-separated.
   */
  private parseHangar(text: string): HangarEntry[] {
    const entries: HangarEntry[] = [];

    for (const rawLine of text.split('\n')) {
      const line = rawLine.trim();
      if (line === '') {
        continue;
      }

      const tokens = line.split(/\s+/);
      const quantityIndex = tokens.findIndex((token) => /^\d[\d.,]*$/.test(token));

      if (quantityIndex <= 0) {
        continue;
      }

      const name = tokens.slice(0, quantityIndex).join(' ');
      const quantity = parseInt(tokens[quantityIndex].replace(/[.,]/g, ''), 10);

      if (!Number.isFinite(quantity) || quantity <= 0) {
        continue;
      }

      entries.push({ name, quantity });
    }

    return entries;
  }
}
