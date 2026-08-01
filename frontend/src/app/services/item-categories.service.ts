import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { ItemCategory } from '../models/recipe.model';

@Injectable({ providedIn: 'root' })
export class ItemCategoriesService {
  private readonly baseUrl = '/api/item-categories';

  constructor(private readonly http: HttpClient) {}

  list(): Observable<ItemCategory[]> {
    return this.http.get<ItemCategory[]>(this.baseUrl);
  }

  create(name: string): Observable<ItemCategory> {
    return this.http.post<ItemCategory>(this.baseUrl, { name });
  }

  update(id: number, name: string): Observable<ItemCategory> {
    return this.http.patch<ItemCategory>(`${this.baseUrl}/${id}`, { name });
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }
}
