export interface RecipeSource {
  type: "url" | "file" | "text" | "pdf" | "image" | "unknown";
  url: string | null;
  site: string | null;
  filename: string | null;
}

export interface RecipeIngredient {
  id: string;
  name: string;
  reading: string;
  aliases: string[];
  amount: string | null;
  unit: string | null;
  scalable: boolean;
  section: string | null;
}

export interface RecipeStep {
  number: number;
  text: string;
  ingredient_refs: string[];
  time_minutes: number | null;
}

export interface MainIngredient {
  name: string;
  reading: string;
  aliases: string[];
  ingredient_refs: string[];
}

export interface Recipe {
  id: string;
  title: string;
  title_reading: string;
  source: RecipeSource;
  servings: number | null;
  ingredients: RecipeIngredient[];
  steps: RecipeStep[];
  categories: string[];
  main_ingredients: MainIngredient[];
  tags: string[];
  time_minutes: number | null;
  notes: string[];
  review_flags: string[];
}

export interface Env {
  ASSETS: Fetcher;
  RECIPES: R2Bucket;
  RECIPE_COORDINATOR: DurableObjectNamespace;
  OPENAI_API_KEY: string;
  OPENAI_MODEL: string;
  TEAM_DOMAIN: string;
  POLICY_AUD: string;
  DEV_USER_ID?: string;
}
