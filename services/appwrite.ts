import { Client, Databases, Account, ID, Query } from 'appwrite';
import { DateIdea } from '../types';

const PROJECT_ID = '69505859000f4ab4347d';
const ENDPOINT = 'https://cloud.appwrite.io/v1'; 

const DB_ID = 'datejar_db';
const COLL_ID = 'ideas';

const client = new Client()
    .setEndpoint(ENDPOINT)
    .setProject(PROJECT_ID);

const databases = new Databases(client);
const account = new Account(client);

// Map Appwrite document to our DateIdea type
const mapDoc = (doc: any): DateIdea => ({
    id: doc.$id,
    title: doc.title,
    category: doc.category || 'Sonstiges',
    description: doc.description || '',
    location: doc.location || '',
    duration: doc.duration || '',
    cost: doc.cost || 'Kostenlos',
    createdBy: doc.createdBy || '',
    completed: doc.completed,
    createdAt: doc.createdAt,
});

export const appwriteService = {
    // Auth Methods
    async login(email: string, password: string) {
        try {
            return await account.createEmailPasswordSession(email, password);
        } catch (error) {
            console.error("Login failed:", error);
            throw error;
        }
    },

    async logout() {
        try {
            await account.deleteSession('current');
        } catch (error) {
            console.error("Logout failed:", error);
        }
    },

    async getUser() {
        try {
            return await account.get();
        } catch (error) {
            return null;
        }
    },

    // Database Methods
    async listIdeas(): Promise<DateIdea[]> {
        try {
            const response = await databases.listDocuments(DB_ID, COLL_ID, [
                Query.orderDesc('createdAt'),
                Query.limit(100)
            ]);
            return response.documents.map(mapDoc);
        } catch (error) {
            console.error("Appwrite listIdeas failed:", error);
            throw error;
        }
    },

    async addIdea(idea: Omit<DateIdea, 'id'>): Promise<DateIdea> {
        try {
            const payload: any = {
                title: idea.title,
                completed: idea.completed,
                createdAt: idea.createdAt,
                category: idea.category,
                description: idea.description,
                location: idea.location,
                cost: idea.cost,
                duration: idea.duration,
                createdBy: idea.createdBy
            };

            const response = await databases.createDocument(DB_ID, COLL_ID, ID.unique(), payload);
            return mapDoc(response);
        } catch (error) {
            console.error("Appwrite addIdea failed:", error);
            throw error;
        }
    },

    async updateIdea(id: string, data: Partial<DateIdea>): Promise<DateIdea> {
        try {
            const payload: any = {};
            // Only add fields if they are defined in the update data
            if (data.title !== undefined) payload.title = data.title;
            if (data.completed !== undefined) payload.completed = data.completed;
            if (data.category !== undefined) payload.category = data.category;
            if (data.description !== undefined) payload.description = data.description;
            if (data.location !== undefined) payload.location = data.location;
            if (data.cost !== undefined) payload.cost = data.cost;
            if (data.duration !== undefined) payload.duration = data.duration;
            if (data.createdBy !== undefined) payload.createdBy = data.createdBy;

            const response = await databases.updateDocument(DB_ID, COLL_ID, id, payload);
            return mapDoc(response);
        } catch (error) {
            console.error("Appwrite updateIdea failed:", error);
            throw error;
        }
    },

    async deleteIdea(id: string): Promise<void> {
        try {
            await databases.deleteDocument(DB_ID, COLL_ID, id);
        } catch (error) {
            console.error("Appwrite deleteIdea failed:", error);
            throw error;
        }
    }
};