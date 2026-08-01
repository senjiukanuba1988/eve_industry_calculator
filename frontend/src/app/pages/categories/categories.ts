import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { ItemCategory } from '../../models/recipe.model';
import { ItemCategoriesService } from '../../services/item-categories.service';

@Component({
  selector: 'app-categories',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './categories.html',
  styleUrl: './categories.scss',
})
export class Categories implements OnInit {
  readonly categories = signal<ItemCategory[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  newCategoryName = '';
  editingId: number | null = null;
  editingName = '';

  constructor(private readonly itemCategoriesService: ItemCategoriesService) {}

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.itemCategoriesService.list().subscribe({
      next: (categories) => {
        this.categories.set(categories);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Failed to load categories.');
        this.loading.set(false);
      },
    });
  }

  addCategory(): void {
    const name = this.newCategoryName.trim();
    if (name === '') {
      return;
    }

    this.error.set(null);
    this.itemCategoriesService.create(name).subscribe({
      next: () => {
        this.newCategoryName = '';
        this.load();
      },
      error: (err) => this.error.set(err?.error?.error ?? 'Failed to create category.'),
    });
  }

  startEdit(category: ItemCategory): void {
    this.editingId = category.id;
    this.editingName = category.name;
    this.error.set(null);
  }

  cancelEdit(): void {
    this.editingId = null;
    this.editingName = '';
  }

  saveEdit(): void {
    const name = this.editingName.trim();
    if (name === '' || this.editingId === null) {
      return;
    }

    this.error.set(null);
    this.itemCategoriesService.update(this.editingId, name).subscribe({
      next: () => {
        this.cancelEdit();
        this.load();
      },
      error: (err) => this.error.set(err?.error?.error ?? 'Failed to rename category.'),
    });
  }

  deleteCategory(category: ItemCategory): void {
    if (!confirm(`Delete category "${category.name}"?`)) {
      return;
    }

    this.error.set(null);
    this.itemCategoriesService.delete(category.id).subscribe({
      next: () => this.load(),
      error: (err) => this.error.set(err?.error?.error ?? 'Failed to delete category.'),
    });
  }
}
