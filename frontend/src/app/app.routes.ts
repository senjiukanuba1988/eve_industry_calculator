import { Routes } from '@angular/router';

import { Categories } from './pages/categories/categories';
import { Items } from './pages/items/items';
import { RecipeCalculator } from './pages/recipe-calculator/recipe-calculator';
import { RecipeForm } from './pages/recipe-form/recipe-form';
import { RecipeList } from './pages/recipe-list/recipe-list';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'recipes' },
  { path: 'recipes', component: RecipeList },
  { path: 'recipes/new', component: RecipeForm },
  { path: 'recipes/:id/edit', component: RecipeForm },
  { path: 'recipes/:id/calculate', component: RecipeCalculator },
  { path: 'items', component: Items },
  { path: 'categories', component: Categories },
];
