import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import {
  ExplodeResult,
  HangarEntry,
  RecipeDetail,
  RecipeFilters,
  RecipeListItem,
  RecipePayload,
} from '../models/recipe.model';

@Injectable({ providedIn: 'root' })
export class RecipesService {
  private readonly baseUrl = '/api/recipes';

  constructor(private readonly http: HttpClient) {}

  list(filters: RecipeFilters): Observable<RecipeListItem[]> {
    let params = new HttpParams();

    if (filters.recipe_type) {
      params = params.set('recipe_type', filters.recipe_type);
    }
    if (filters.category_id) {
      params = params.set('category_id', filters.category_id);
    }
    if (filters.search) {
      params = params.set('search', filters.search);
    }

    return this.http.get<RecipeListItem[]>(this.baseUrl, { params });
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }

  get(id: number): Observable<RecipeDetail> {
    return this.http.get<RecipeDetail>(`${this.baseUrl}/${id}`);
  }

  create(payload: RecipePayload): Observable<RecipeDetail> {
    return this.http.post<RecipeDetail>(this.baseUrl, payload);
  }

  update(id: number, payload: RecipePayload): Observable<RecipeDetail> {
    return this.http.patch<RecipeDetail>(`${this.baseUrl}/${id}`, payload);
  }

  explode(id: number, runs: number, hangar: HangarEntry[] = []): Observable<ExplodeResult> {
    return this.http.post<ExplodeResult>(`${this.baseUrl}/${id}/explode`, { runs, hangar });
  }
}
