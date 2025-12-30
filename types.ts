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
  createdAt: number;
  // New Fields
  type: string; // e.g., "Aktivitäten", "Gerichte", "Ideen"
  order: number; // For manual sorting
  plannedMonth?: string; // Format "YYYY-MM"
}

export interface AIPromptRequest {
  currentIdeas: string[];
}