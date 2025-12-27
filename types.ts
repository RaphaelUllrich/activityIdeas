export type Category = string;
export type CostLevel = 'Kostenlos' | '€' | '€€' | '€€€';

export interface DateIdea {
  id: string;
  title: string;
  category: Category;
  description?: string;
  location?: string;
  duration?: string;
  cost?: CostLevel;
  createdBy?: string; // Name/Email of the user
  completed: boolean;
  createdAt: number;
}

export interface AIPromptRequest {
  currentIdeas: string[];
}