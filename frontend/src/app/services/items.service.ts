import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { Item, ItemFilters, ItemResolveResult } from '../models/recipe.model';

@Injectable({ providedIn: 'root' })
export class ItemsService {
  private readonly baseUrl = '/api/items';

  constructor(private readonly http: HttpClient) {}

  list(filters: ItemFilters = {}): Observable<Item[]> {
    let params = new HttpParams();

    if (filters.category_id) {
      params = params.set('category_id', filters.category_id);
    }
    if (filters.search) {
      params = params.set('search', filters.search);
    }

    return this.http.get<Item[]>(this.baseUrl, { params });
  }

  resolve(names: string[]): Observable<ItemResolveResult[]> {
    return this.http.post<ItemResolveResult[]>(`${this.baseUrl}/resolve`, { names });
  }

  create(name: string, categoryId: number | null): Observable<Item> {
    return this.http.post<Item>(this.baseUrl, { name, category_id: categoryId });
  }

  update(id: number, name: string, categoryId: number | null): Observable<Item> {
    return this.http.patch<Item>(`${this.baseUrl}/${id}`, { name, category_id: categoryId });
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }
}
