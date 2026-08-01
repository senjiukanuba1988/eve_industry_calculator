import { Routes } from '@angular/router';

import { Categories } from './pages/categories/categories';
import { RecipeForm } from './pages/recipe-form/recipe-form';
import { RecipeList } from './pages/recipe-list/recipe-list';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'recipes' },
  { path: 'recipes', component: RecipeList },
  { path: 'recipes/new', component: RecipeForm },
  { path: 'recipes/:id/edit', component: RecipeForm },
  { path: 'categories', component: Categories },
];
