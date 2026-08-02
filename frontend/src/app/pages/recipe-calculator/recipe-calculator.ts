import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { ExplodeResult, RecipeDetail } from '../../models/recipe.model';
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

    this.recipesService.explode(recipe.id, this.runs).subscribe({
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
}
