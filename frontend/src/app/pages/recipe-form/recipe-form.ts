import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

import { ItemCategory, ItemResolveResult, RecipePayload, RecipeType } from '../../models/recipe.model';
import { ItemCategoriesService } from '../../services/item-categories.service';
import { ItemsService } from '../../services/items.service';
import { RecipeTypesService } from '../../services/recipe-types.service';
import { RecipesService } from '../../services/recipes.service';

interface ResolvableEntry {
  name: string;
  itemId: number | null;
  checked: boolean;
  matched: boolean;
  categoryId: number | null;
  categoryName: string | null;
}

interface InputRow extends ResolvableEntry {
  quantity: number;
}

function freshEntry(name = ''): ResolvableEntry {
  return { name, itemId: null, checked: false, matched: false, categoryId: null, categoryName: null };
}

function freshInputRow(): InputRow {
  return { ...freshEntry(), quantity: 1 };
}

@Component({
  selector: 'app-recipe-form',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './recipe-form.html',
  styleUrl: './recipe-form.scss',
})
export class RecipeForm implements OnInit {
  readonly recipeTypes = signal<RecipeType[]>([]);
  readonly categories = signal<ItemCategory[]>([]);
  readonly product = signal<ResolvableEntry>(freshEntry());
  readonly inputs = signal<InputRow[]>([freshInputRow()]);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);

  recipeType = '';
  variantLabel = '';
  outputQuantity = 1;
  notes = '';

  recipeId: number | null = null;

  constructor(
    private readonly recipesService: RecipesService,
    private readonly recipeTypesService: RecipeTypesService,
    private readonly itemCategoriesService: ItemCategoriesService,
    private readonly itemsService: ItemsService,
    private readonly route: ActivatedRoute,
    private readonly router: Router,
  ) {}

  get isEdit(): boolean {
    return this.recipeId !== null;
  }

  get allResolved(): boolean {
    const rows = this.inputs();
    return (
      this.product().matched &&
      rows.length > 0 &&
      rows.every((row) => row.name.trim() !== '' && row.matched)
    );
  }

  ngOnInit(): void {
    this.recipeTypesService.list().subscribe((types) => this.recipeTypes.set(types));
    this.itemCategoriesService.list().subscribe((categories) => this.categories.set(categories));

    const idParam = this.route.snapshot.paramMap.get('id');
    if (idParam) {
      this.recipeId = Number(idParam);
      this.loadRecipe(this.recipeId);
    }
  }

  private loadRecipe(id: number): void {
    this.loading.set(true);
    this.recipesService.get(id).subscribe({
      next: (recipe) => {
        this.recipeType = recipe.recipe_type;
        this.variantLabel = recipe.variant_label ?? '';
        this.outputQuantity = recipe.output_quantity;
        this.notes = recipe.notes ?? '';
        this.product.set({
          name: recipe.product_item_name,
          itemId: recipe.product_item_id,
          checked: true,
          matched: true,
          categoryId: null,
          categoryName: null,
        });
        this.inputs.set(
          recipe.inputs.map((input) => ({
            name: input.input_item_name,
            itemId: input.input_item_id,
            checked: true,
            matched: true,
            categoryId: null,
            categoryName: null,
            quantity: input.input_quantity,
          })),
        );
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Failed to load recipe.');
        this.loading.set(false);
      },
    });
  }

  onProductNameChange(name: string): void {
    this.product.set(freshEntry(name));
  }

  onInputNameChange(index: number, name: string): void {
    this.inputs.update((rows) =>
      rows.map((row, i) => (i === index ? { ...freshInputRow(), name, quantity: row.quantity } : row)),
    );
  }

  setProductCategory(categoryId: number | null): void {
    this.product.update((entry) => ({ ...entry, categoryId }));
  }

  setInputCategory(index: number, categoryId: number | null): void {
    this.inputs.update((rows) => rows.map((row, i) => (i === index ? { ...row, categoryId } : row)));
  }

  setInputQuantity(index: number, quantity: number): void {
    this.inputs.update((rows) => rows.map((row, i) => (i === index ? { ...row, quantity } : row)));
  }

  addInputRow(): void {
    this.inputs.update((rows) => [...rows, freshInputRow()]);
  }

  removeInputRow(index: number): void {
    this.inputs.update((rows) => rows.filter((_, i) => i !== index));
  }

  checkItems(): void {
    const productName = this.product().name.trim();
    const inputRows = this.inputs();

    if (productName === '') {
      this.error.set('Enter a product name before checking items.');
      return;
    }
    if (inputRows.length === 0 || inputRows.some((row) => row.name.trim() === '')) {
      this.error.set('Every input row needs a name before checking items.');
      return;
    }

    this.error.set(null);
    const names = [productName, ...inputRows.map((row) => row.name.trim())];

    this.itemsService.resolve(names).subscribe({
      next: (results) => {
        const [productResult, ...inputResults] = results;
        this.product.set(this.applyResolveResult(this.product(), productResult));
        this.inputs.set(
          inputRows.map((row, i) => ({
            ...this.applyResolveResult(row, inputResults[i]),
            quantity: row.quantity,
          })),
        );
      },
      error: () => this.error.set('Failed to check items.'),
    });
  }

  createProductItem(): void {
    const entry = this.product();
    this.itemsService.create(entry.name, entry.categoryId).subscribe({
      next: (item) =>
        this.product.set({
          name: item.name,
          itemId: item.id,
          checked: true,
          matched: true,
          categoryId: item.category_id,
          categoryName: item.category_name,
        }),
      error: (err) => this.error.set(err?.error?.error ?? 'Failed to create item.'),
    });
  }

  createInputItem(index: number): void {
    const entry = this.inputs()[index];
    this.itemsService.create(entry.name, entry.categoryId).subscribe({
      next: (item) =>
        this.inputs.update((rows) =>
          rows.map((row, i) =>
            i === index
              ? {
                  ...row,
                  itemId: item.id,
                  checked: true,
                  matched: true,
                  categoryId: item.category_id,
                  categoryName: item.category_name,
                }
              : row,
          ),
        ),
      error: (err) => this.error.set(err?.error?.error ?? 'Failed to create item.'),
    });
  }

  save(): void {
    if (!this.allResolved) {
      return;
    }
    if (!this.recipeType) {
      this.error.set('Select a recipe type.');
      return;
    }
    if (this.outputQuantity < 1) {
      this.error.set('Output quantity must be at least 1.');
      return;
    }

    const productId = this.product().itemId!;
    const rows = this.inputs();

    if (rows.some((row) => row.itemId === productId)) {
      this.error.set('A recipe cannot use its own product as an input.');
      return;
    }
    const ids = rows.map((row) => row.itemId);
    if (new Set(ids).size !== ids.length) {
      this.error.set('Duplicate input item in recipe inputs.');
      return;
    }
    if (rows.some((row) => row.quantity < 1)) {
      this.error.set('Each input needs a quantity of at least 1.');
      return;
    }

    const payload: RecipePayload = {
      product_item_id: productId,
      recipe_type: this.recipeType,
      variant_label: this.variantLabel.trim() || null,
      output_quantity: this.outputQuantity,
      notes: this.notes.trim() || null,
      inputs: rows.map((row) => ({ input_item_id: row.itemId!, input_quantity: row.quantity })),
    };

    this.saving.set(true);
    this.error.set(null);

    const request$ = this.isEdit
      ? this.recipesService.update(this.recipeId!, payload)
      : this.recipesService.create(payload);

    request$.subscribe({
      next: () => this.router.navigate(['/recipes']),
      error: (err) => {
        this.saving.set(false);
        this.error.set(err?.error?.error ?? 'Failed to save recipe.');
      },
    });
  }

  cancel(): void {
    this.router.navigate(['/recipes']);
  }

  private applyResolveResult<T extends ResolvableEntry>(entry: T, result: ItemResolveResult): T {
    if (result.matched) {
      return {
        ...entry,
        itemId: result.id,
        checked: true,
        matched: true,
        categoryId: result.category_id,
        categoryName: result.category_name,
      };
    }

    return { ...entry, itemId: null, checked: true, matched: false, categoryId: null, categoryName: null };
  }
}
