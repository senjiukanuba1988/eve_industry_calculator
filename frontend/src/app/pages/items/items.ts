import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { Item, ItemCategory } from '../../models/recipe.model';
import { ItemCategoriesService } from '../../services/item-categories.service';
import { ItemsService } from '../../services/items.service';

@Component({
  selector: 'app-items',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './items.html',
  styleUrl: './items.scss',
})
export class Items implements OnInit {
  readonly items = signal<Item[]>([]);
  readonly categories = signal<ItemCategory[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  categoryFilter: number | null = null;
  searchFilter = '';

  editingId: number | null = null;
  editingName = '';
  editingCategoryId: number | null = null;

  constructor(
    private readonly itemsService: ItemsService,
    private readonly itemCategoriesService: ItemCategoriesService,
  ) {}

  ngOnInit(): void {
    this.itemCategoriesService.list().subscribe((categories) => this.categories.set(categories));
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set(null);

    this.itemsService
      .list({
        category_id: this.categoryFilter ?? undefined,
        search: this.searchFilter || undefined,
      })
      .subscribe({
        next: (items) => {
          this.items.set(items);
          this.loading.set(false);
        },
        error: () => {
          this.error.set('Failed to load items.');
          this.loading.set(false);
        },
      });
  }

  startEdit(item: Item): void {
    this.editingId = item.id;
    this.editingName = item.name;
    this.editingCategoryId = item.category_id;
    this.error.set(null);
  }

  cancelEdit(): void {
    this.editingId = null;
    this.editingName = '';
    this.editingCategoryId = null;
  }

  saveEdit(): void {
    const name = this.editingName.trim();
    if (name === '' || this.editingId === null) {
      return;
    }

    this.error.set(null);
    this.itemsService.update(this.editingId, name, this.editingCategoryId).subscribe({
      next: () => {
        this.cancelEdit();
        this.load();
      },
      error: (err) => this.error.set(err?.error?.error ?? 'Failed to save item.'),
    });
  }

  deleteItem(item: Item): void {
    if (!confirm(`Delete item "${item.name}"? This cannot be undone.`)) {
      return;
    }

    this.error.set(null);
    this.itemsService.delete(item.id).subscribe({
      next: () => this.load(),
      error: (err) => this.error.set(err?.error?.error ?? 'Failed to delete item.'),
    });
  }
}
