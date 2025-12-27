import { GoogleGenAI, Type } from "@google/genai";
import { DateIdea, Category, CostLevel } from "../types";

const apiKey = process.env.API_KEY || ''; 

// Initialize GenAI
const ai = new GoogleGenAI({ apiKey });

// Helper interface for what we want from AI (without ID/Completed/CreatedAt)
interface GeneratedIdea {
    title: string;
    category: Category;
    description: string;
    location: string;
    cost: CostLevel;
    duration: string;
}

export const generateDateIdeas = async (existingTitles: string[]): Promise<GeneratedIdea[]> => {
  if (!apiKey) {
    console.warn("API Key is missing via process.env.API_KEY");
    // Mock response for testing/offline
    return [
        {
            title: "Spaziergang im Großen Garten",
            category: "Aktiv",
            description: "Ein entspannter Spaziergang durch den schönsten Park Dresdens.",
            location: "Großer Garten, Dresden",
            cost: "Kostenlos",
            duration: "1-2 Stunden"
        },
        {
            title: "Abendessen im Dunkelrestaurant",
            category: "Essen & Trinken",
            description: "Ein einzigartiges kulinarisches Erlebnis in völliger Dunkelheit.",
            location: "Sinnesrausch, Dresden",
            cost: "€€€",
            duration: "2-3 Stunden"
        }
    ];
  }

  try {
    const prompt = `
      Ich habe eine App für Date-Ideen. Aktuelle Titel sind: ${existingTitles.join(", ")}.
      
      Erstelle 3 neue, kreative Date-Ideen für Paare (Fokus: Dresden & Umgebung oder allgemein).
      
      Kategorien Auswahl: 'Aktiv', 'Entspannung', 'Essen & Trinken', 'Kultur', 'Reisen', 'Sonstiges'.
      Kosten Auswahl: 'Kostenlos', '€', '€€', '€€€'.
      
      Antworte im JSON Format.
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              category: { type: Type.STRING, enum: ['Aktiv', 'Entspannung', 'Essen & Trinken', 'Kultur', 'Reisen', 'Sonstiges'] },
              description: { type: Type.STRING },
              location: { type: Type.STRING },
              cost: { type: Type.STRING, enum: ['Kostenlos', '€', '€€', '€€€'] },
              duration: { type: Type.STRING },
            },
            required: ['title', 'category', 'description', 'location', 'cost', 'duration']
          }
        }
      }
    });

    const jsonStr = response.text;
    if (!jsonStr) return [];
    
    // Validate types roughly
    const newIdeas = JSON.parse(jsonStr) as GeneratedIdea[];
    return newIdeas;

  } catch (error) {
    console.error("Error generating date ideas:", error);
    throw error;
  }
};