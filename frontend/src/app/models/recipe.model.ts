export interface RecipeType {
  value: string;
  label: string;
}

export interface ItemCategory {
  id: number;
  name: string;
}

export interface RecipeListItem {
  id: number;
  product_item_id: number;
  product_item_name: string;
  recipe_type: string;
  variant_label: string | null;
  output_quantity: number;
}

export interface RecipeFilters {
  recipe_type?: string;
  category_id?: number;
  search?: string;
}

export interface RecipeInputDetail {
  input_item_id: number;
  input_item_name: string;
  input_quantity: number;
}

export interface RecipeDetail {
  id: number;
  product_item_id: number;
  product_item_name: string;
  recipe_type: string;
  variant_label: string | null;
  output_quantity: number;
  notes: string | null;
  inputs: RecipeInputDetail[];
}

export interface RecipeInputPayload {
  input_item_id: number;
  input_quantity: number;
}

export interface RecipePayload {
  product_item_id: number;
  recipe_type: string;
  variant_label: string | null;
  output_quantity: number;
  notes: string | null;
  inputs: RecipeInputPayload[];
}

export interface Item {
  id: number;
  name: string;
  category_id: number | null;
  category_name: string | null;
}

export interface ItemFilters {
  category_id?: number;
  search?: string;
}

export type ItemResolveResult =
  | { name: string; matched: true; id: number; category_id: number | null; category_name: string | null }
  | { name: string; matched: false };

export interface ExplodeBaseMaterial {
  item_id: number;
  item_name: string;
  quantity: number;
}

export interface ExplodeIntermediate {
  item_id: number;
  item_name: string;
  recipe_id: number;
  batches: number;
  leftover_quantity: number;
}

export interface ExplodeResult {
  recipe_id: number;
  product_item_id: number;
  product_item_name: string;
  runs: number;
  produced_quantity: number;
  base_materials: ExplodeBaseMaterial[];
  intermediates: ExplodeIntermediate[];
}
