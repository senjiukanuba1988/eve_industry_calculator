import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { RecipeType } from '../models/recipe.model';

@Injectable({ providedIn: 'root' })
export class RecipeTypesService {
  private readonly baseUrl = '/api/recipe-types';

  constructor(private readonly http: HttpClient) {}

  list(): Observable<RecipeType[]> {
    return this.http.get<RecipeType[]>(this.baseUrl);
  }
}
