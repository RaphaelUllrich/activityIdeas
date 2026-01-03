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
  createdBy?: string; 
  completed: boolean;
  isFavorite?: boolean; // NEU: Favoriten-Status
  createdAt: number;
  type: string; 
  order: number; 
  plannedMonth?: string; 
  imageId?: string | null; 
}

export interface AIPromptRequest {
  currentIdeas: string[];
}