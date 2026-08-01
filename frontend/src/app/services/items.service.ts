import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { Item, ItemResolveResult } from '../models/recipe.model';

@Injectable({ providedIn: 'root' })
export class ItemsService {
  private readonly baseUrl = '/api/items';

  constructor(private readonly http: HttpClient) {}

  resolve(names: string[]): Observable<ItemResolveResult[]> {
    return this.http.post<ItemResolveResult[]>(`${this.baseUrl}/resolve`, { names });
  }

  create(name: string, categoryId: number | null): Observable<Item> {
    return this.http.post<Item>(this.baseUrl, { name, category_id: categoryId });
  }
}
