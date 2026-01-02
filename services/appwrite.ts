import { Client, Databases, Account, ID, Query } from 'appwrite';
import { DateIdea } from '../types';

const PROJECT_ID = '69505859000f4ab4347d';
const ENDPOINT = 'https://cloud.appwrite.io/v1'; 

const DB_ID = 'datejar_db';
const COLL_ID = 'ideas';
const META_COLL_ID = 'collections_meta';

const client = new Client()
    .setEndpoint(ENDPOINT)
    .setProject(PROJECT_ID);

const databases = new Databases(client);
const account = new Account(client);

export interface CollectionMeta {
    $id: string;
    name: string;
}

// Helper public machen, damit wir Realtime-Daten formatieren können
export const mapDoc = (doc: any): DateIdea => ({
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
    type: doc.type || 'Aktivitäten',
    order: doc.order || 0,
    plannedMonth: doc.plannedMonth || undefined,
});

export const appwriteService = {
    // Auth Methods
    async login(email, password) { return await account.createEmailPasswordSession(email, password); },
    async logout() { try { await account.deleteSession('current'); } catch {} },
    async getUser() { try { return await account.get(); } catch { return null; } },

    // --- IDEA METHODS ---
    async listIdeas(): Promise<DateIdea[]> {
        try {
            const response = await databases.listDocuments(DB_ID, COLL_ID, [
                Query.orderAsc('order'),
                Query.orderDesc('createdAt'),
                Query.limit(100)
            ]);
            return response.documents.map(mapDoc);
        } catch (error) {
            console.error("Appwrite listIdeas failed:", error);
            throw error;
        }
    },

    async addIdea(idea: any): Promise<DateIdea> {
        const payload = {
            title: idea.title,
            completed: idea.completed,
            createdAt: idea.createdAt,
            category: idea.category,
            description: idea.description,
            location: idea.location,
            cost: idea.cost,
            duration: idea.duration,
            createdBy: idea.createdBy,
            type: idea.type,
            order: idea.order,
            plannedMonth: idea.plannedMonth
        };
        const response = await databases.createDocument(DB_ID, COLL_ID, ID.unique(), payload);
        return mapDoc(response);
    },

    async updateIdea(id: string, data: any): Promise<DateIdea> {
        const payload: any = {};
        const keys = ['title', 'completed', 'category', 'description', 'location', 'cost', 'duration', 'createdBy', 'type', 'order', 'plannedMonth'];
        
        keys.forEach(key => {
            if (data[key] !== undefined) payload[key] = data[key];
        });
        if (data.plannedMonth === null) payload.plannedMonth = null;

        const response = await databases.updateDocument(DB_ID, COLL_ID, id, payload);
        return mapDoc(response);
    },

    async deleteIdea(id: string): Promise<void> {
        await databases.deleteDocument(DB_ID, COLL_ID, id);
    },

    // --- COLLECTION MANAGEMENT ---
    async listCollections(): Promise<CollectionMeta[]> {
        try {
            const res = await databases.listDocuments(DB_ID, META_COLL_ID);
            return res.documents.map(d => ({ $id: d.$id, name: d.name }));
        } catch (e) {
            return [];
        }
    },

    async createCollection(name: string): Promise<CollectionMeta> {
        const res = await databases.createDocument(DB_ID, META_COLL_ID, ID.unique(), { name });
        return { $id: res.$id, name: res.name };
    },

    async deleteCollection(id: string, name: string): Promise<void> {
        const ideas = await databases.listDocuments(DB_ID, COLL_ID, [
            Query.equal('type', name),
            Query.limit(100)
        ]);
        const deletePromises = ideas.documents.map(doc => 
            databases.deleteDocument(DB_ID, COLL_ID, doc.$id)
        );
        await Promise.all(deletePromises);
        await databases.deleteDocument(DB_ID, META_COLL_ID, id);
    },

    async renameCollection(id: string, oldName: string, newName: string): Promise<void> {
         await databases.updateDocument(DB_ID, META_COLL_ID, id, { name: newName });
         const ideas = await databases.listDocuments(DB_ID, COLL_ID, [
            Query.equal('type', oldName),
            Query.limit(100)
        ]);
        const updatePromises = ideas.documents.map(doc => 
            databases.updateDocument(DB_ID, COLL_ID, doc.$id, { type: newName })
        );
        await Promise.all(updatePromises);
    },

    // --- REALTIME SUBSCRIPTION (NEU) ---
    subscribe(callback: (response: any) => void) {
        // Wir abonnieren beide Channels: Ideen und Sammlungen
        return client.subscribe([
            `databases.${DB_ID}.collections.${COLL_ID}.documents`,
            `databases.${DB_ID}.collections.${META_COLL_ID}.documents`
        ], callback);
    }
};