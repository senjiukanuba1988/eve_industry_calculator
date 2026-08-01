import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { ItemCategory, RecipeListItem, RecipeType } from '../../models/recipe.model';
import { ItemCategoriesService } from '../../services/item-categories.service';
import { RecipeTypesService } from '../../services/recipe-types.service';
import { RecipesService } from '../../services/recipes.service';

@Component({
  selector: 'app-recipe-list',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './recipe-list.html',
  styleUrl: './recipe-list.scss',
})
export class RecipeList implements OnInit {
  readonly recipes = signal<RecipeListItem[]>([]);
  readonly recipeTypes = signal<RecipeType[]>([]);
  readonly categories = signal<ItemCategory[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  recipeTypeFilter = '';
  categoryFilter: number | null = null;
  searchFilter = '';

  constructor(
    private readonly recipesService: RecipesService,
    private readonly recipeTypesService: RecipeTypesService,
    private readonly itemCategoriesService: ItemCategoriesService,
    private readonly router: Router,
  ) {}

  ngOnInit(): void {
    this.recipeTypesService.list().subscribe((types) => this.recipeTypes.set(types));
    this.itemCategoriesService.list().subscribe((categories) => this.categories.set(categories));
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set(null);

    this.recipesService
      .list({
        recipe_type: this.recipeTypeFilter || undefined,
        category_id: this.categoryFilter ?? undefined,
        search: this.searchFilter || undefined,
      })
      .subscribe({
        next: (recipes) => {
          this.recipes.set(recipes);
          this.loading.set(false);
        },
        error: () => {
          this.error.set('Failed to load recipes.');
          this.loading.set(false);
        },
      });
  }

  recipeTypeLabel(value: string): string {
    return this.recipeTypes().find((t) => t.value === value)?.label ?? value;
  }

  editRecipe(id: number): void {
    this.router.navigate(['/recipes', id, 'edit']);
  }

  deleteRecipe(recipe: RecipeListItem): void {
    const label = recipe.variant_label
      ? `${recipe.product_item_name} (${recipe.variant_label})`
      : recipe.product_item_name;

    if (!confirm(`Delete recipe for "${label}"? This cannot be undone.`)) {
      return;
    }

    this.recipesService.delete(recipe.id).subscribe({
      next: () => this.load(),
      error: () => this.error.set('Failed to delete recipe.'),
    });
  }
}
