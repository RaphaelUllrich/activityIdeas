import { Client, Databases, Permission, Role, Storage } from 'node-appwrite';

// Configuration
const ENDPOINT = 'https://cloud.appwrite.io/v1'; 
const PROJECT_ID = '69505859000f4ab4347d';
// ACHTUNG: Das ist dein API Key. Wenn du das Projekt veröffentlichst (GitHub), nimm diesen Key raus!
const API_KEY = 'standard_2cfbd2f45b0198e7b0ee5367e0bd8b72719d228fed58e0a403f53e5ff6be54dd34282a42b260b91d87eebcb35f8ec77338e119ad900453e916b5ee0ab8743c483d40eaf5363774caa14e5a47dd94ef4b7ae0191c69268a30f4ab6e9250e0bc673baa5ac0bafe81c4ed3c967dfeed8fd2d55f52d0e3c0c696908e4e0439eb35dd';

const DB_ID = 'datejar_db';
const COLL_ID = 'ideas';
const META_COLL_ID = 'collections_meta';
const BUCKET_ID = 'images';

const client = new Client()
    .setEndpoint(ENDPOINT)
    .setProject(PROJECT_ID)
    .setKey(API_KEY);

const databases = new Databases(client);
const storage = new Storage(client);

// Helper: Wartet, bis ein Attribut fertig erstellt ist (Status 'available')
async function waitForAttribute(dbId, collId, key) {
    let retries = 0;
    while (retries < 30) {
        try {
            const attr = await databases.getAttribute(dbId, collId, key);
            if (attr.status === 'available') {
                return true;
            }
            console.log(`⏳ Attribute '${key}' is '${attr.status}', waiting...`);
        } catch (e) {
            console.log(`⏳ Waiting for attribute '${key}' to appear...`);
        }
        await new Promise(r => setTimeout(r, 1000));
        retries++;
    }
    console.warn(`Warning: Attribute ${key} did not become available in time.`);
}

async function init() {
    console.log('🚀 Starting Appwrite Initialization...');

    // 1. Check/Create Database
    try {
        await databases.get(DB_ID);
        console.log('✅ Database exists');
    } catch (e) {
        if (e.code === 404) {
            console.log('Creating database...');
            await databases.create(DB_ID, 'DateJar Database');
            console.log('✅ Database created');
        } else throw e;
    }

    // Permissions (Public Read/Write for simplicity)
    const permissions = [
        Permission.read(Role.any()),
        Permission.write(Role.any()),
        Permission.update(Role.any()),
        Permission.delete(Role.any()),
    ];

    // 2. Storage Bucket
    try {
        await storage.getBucket(BUCKET_ID);
        console.log('✅ Storage Bucket exists');
    } catch (e) {
        if (e.code === 404) {
            console.log('Creating Storage Bucket...');
            // File Security true, aber Permissions public
            await storage.createBucket(BUCKET_ID, 'Images', permissions, true);
            console.log('✅ Storage Bucket created');
        } else throw e;
    }

    // 3. Collection: IDEAS
    try {
        await databases.getCollection(DB_ID, COLL_ID);
        console.log('✅ Ideas Collection exists. Updating permissions...');
        await databases.updateCollection(DB_ID, COLL_ID, 'Date Ideas', permissions);
    } catch (e) {
        if (e.code === 404) {
            console.log('Creating Ideas collection...');
            await databases.createCollection(DB_ID, COLL_ID, 'Date Ideas', permissions);
            console.log('✅ Ideas Collection created');
        } else throw e;
    }

    // 4. Collection: META (Sammlungen)
    try {
        await databases.getCollection(DB_ID, META_COLL_ID);
        console.log('✅ Meta Collection exists.');
    } catch (e) {
        if (e.code === 404) {
            console.log('Creating Meta collection...');
            await databases.createCollection(DB_ID, META_COLL_ID, 'Collection Names', permissions);
            console.log('✅ Meta Collection created');
        } else throw e;
    }

    // 5. Attributes Helper
    const ensureAttribute = async (collId, key, createPromise) => {
        try {
            await createPromise();
            console.log(`Creating attribute in ${collId}: ${key}...`);
        } catch (e) {
            // Error 409 bedeutet, das Attribut existiert schon. Das ist gut.
            if (e.code !== 409) {
                console.error(`Error creating attribute ${key}:`, e.message);
            }
        }
        await waitForAttribute(DB_ID, collId, key);
    };

    console.log("--- Setting up Idea Attributes ---");
    
    // Core Data
    await ensureAttribute(COLL_ID, 'title', () => databases.createStringAttribute(DB_ID, COLL_ID, 'title', 255, true));
    await ensureAttribute(COLL_ID, 'completed', () => databases.createBooleanAttribute(DB_ID, COLL_ID, 'completed', true));
    await ensureAttribute(COLL_ID, 'createdAt', () => databases.createIntegerAttribute(DB_ID, COLL_ID, 'createdAt', true));
    
    // NEU: Favoriten Status
    await ensureAttribute(COLL_ID, 'isFavorite', () => databases.createBooleanAttribute(DB_ID, COLL_ID, 'isFavorite', false, false));

    // Metadata
    await ensureAttribute(COLL_ID, 'category', () => databases.createStringAttribute(DB_ID, COLL_ID, 'category', 50, false, 'Sonstiges'));
    await ensureAttribute(COLL_ID, 'description', () => databases.createStringAttribute(DB_ID, COLL_ID, 'description', 2000, false));
    await ensureAttribute(COLL_ID, 'location', () => databases.createStringAttribute(DB_ID, COLL_ID, 'location', 255, false));
    await ensureAttribute(COLL_ID, 'cost', () => databases.createStringAttribute(DB_ID, COLL_ID, 'cost', 20, false));
    await ensureAttribute(COLL_ID, 'duration', () => databases.createStringAttribute(DB_ID, COLL_ID, 'duration', 100, false));
    await ensureAttribute(COLL_ID, 'createdBy', () => databases.createStringAttribute(DB_ID, COLL_ID, 'createdBy', 255, false));

    // Features / Sorting
    await ensureAttribute(COLL_ID, 'type', () => databases.createStringAttribute(DB_ID, COLL_ID, 'type', 50, false, 'Aktivitäten'));
    await ensureAttribute(COLL_ID, 'order', () => databases.createFloatAttribute(DB_ID, COLL_ID, 'order', false)); 
    await ensureAttribute(COLL_ID, 'plannedMonth', () => databases.createStringAttribute(DB_ID, COLL_ID, 'plannedMonth', 10, false));
    
    // Images
    await ensureAttribute(COLL_ID, 'imageId', () => databases.createStringAttribute(DB_ID, COLL_ID, 'imageId', 255, false));

    // --- Attributes for META (Collections) ---
    console.log("--- Setting up Meta Attributes ---");
    await ensureAttribute(META_COLL_ID, 'name', () => databases.createStringAttribute(DB_ID, META_COLL_ID, 'name', 50, true));

    console.log('🎉 Initialization Complete! Schema is ready.');
}

init().catch(console.error);