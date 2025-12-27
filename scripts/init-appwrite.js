import { Client, Databases, Permission, Role } from 'node-appwrite';

// Configuration
const ENDPOINT = 'https://cloud.appwrite.io/v1'; 
const PROJECT_ID = '69505859000f4ab4347d';
const API_KEY = 'standard_2cfbd2f45b0198e7b0ee5367e0bd8b72719d228fed58e0a403f53e5ff6be54dd34282a42b260b91d87eebcb35f8ec77338e119ad900453e916b5ee0ab8743c483d40eaf5363774caa14e5a47dd94ef4b7ae0191c69268a30f4ab6e9250e0bc673baa5ac0bafe81c4ed3c967dfeed8fd2d55f52d0e3c0c696908e4e0439eb35dd';

const DB_ID = 'datejar_db';
const COLL_ID = 'ideas';

const client = new Client()
    .setEndpoint(ENDPOINT)
    .setProject(PROJECT_ID)
    .setKey(API_KEY);

const databases = new Databases(client);

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
    // Don't throw here to allow script to continue if one attribute is stuck, 
    // but in prod you might want to throw.
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

    // 2. Check/Create Collection & Permissions
    const permissions = [
        Permission.read(Role.any()),
        Permission.write(Role.any()),
        Permission.update(Role.any()),
        Permission.delete(Role.any()),
    ];

    try {
        await databases.getCollection(DB_ID, COLL_ID);
        console.log('✅ Collection exists. Updating permissions...');
        await databases.updateCollection(DB_ID, COLL_ID, 'Date Ideas', permissions);
    } catch (e) {
        if (e.code === 404) {
            console.log('Creating collection...');
            await databases.createCollection(DB_ID, COLL_ID, 'Date Ideas', permissions);
            console.log('✅ Collection created');
        } else throw e;
    }

    // 3. Create Attributes helper
    const ensureAttribute = async (key, createPromise) => {
        try {
            const attrs = await databases.listAttributes(DB_ID, COLL_ID);
            const exists = attrs.attributes.find(a => a.key === key);
            if (!exists) {
                console.log(`Creating attribute: ${key}...`);
                await createPromise();
            } else {
                console.log(`✅ Attribute '${key}' exists`);
            }
            await waitForAttribute(DB_ID, COLL_ID, key);
        } catch (e) {
            console.error(`Error handling attribute ${key}:`, e);
        }
    };

    // --- Core Fields ---
    await ensureAttribute('title', () => databases.createStringAttribute(DB_ID, COLL_ID, 'title', 255, true));
    await ensureAttribute('completed', () => databases.createBooleanAttribute(DB_ID, COLL_ID, 'completed', true));
    await ensureAttribute('createdAt', () => databases.createIntegerAttribute(DB_ID, COLL_ID, 'createdAt', true));

    // --- New Fields (Metadata) ---
    // Category: e.g. 'Active', 'Food', etc.
    await ensureAttribute('category', () => databases.createStringAttribute(DB_ID, COLL_ID, 'category', 50, false, 'Sonstiges'));
    
    // Description: Longer text for details
    await ensureAttribute('description', () => databases.createStringAttribute(DB_ID, COLL_ID, 'description', 2000, false));
    
    // Location: Where does it happen?
    await ensureAttribute('location', () => databases.createStringAttribute(DB_ID, COLL_ID, 'location', 255, false));
    
    // Cost: e.g. '€€'
    await ensureAttribute('cost', () => databases.createStringAttribute(DB_ID, COLL_ID, 'cost', 20, false));
    
    // Duration: e.g. '2 Stunden'
    await ensureAttribute('duration', () => databases.createStringAttribute(DB_ID, COLL_ID, 'duration', 100, false));

    // CreatedBy: Store user name/email
    await ensureAttribute('createdBy', () => databases.createStringAttribute(DB_ID, COLL_ID, 'createdBy', 255, false));


    console.log('🎉 Initialization Complete! Schema is ready.');
}

init().catch(console.error);