/**
 * db.js
 * IndexedDB-based local storage for Aadhaar History
 * Works offline and on static hosts like Netlify.
 */

const DB_NAME = 'AadhaarHistoryDB';
const STORE_NAME = 'history';
const DB_VERSION = 1;

const dbService = {
    _db: null,

    async init() {
        if (this._db) return this._db;
        
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME, { keyPath: 'id' });
                }
            };

            request.onsuccess = (event) => {
                this._db = event.target.result;
                resolve(this._db);
            };

            request.onerror = (event) => {
                console.error('IndexedDB error:', event.target.error);
                reject(event.target.error);
            };
        });
    },

    async getAll() {
        const db = await this.init();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.getAll();

            request.onsuccess = () => {
                // Sort by timestamp descending (newest first)
                const results = request.result || [];
                results.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
                resolve(results);
            };

            request.onerror = (event) => {
                console.error('Failed to get history:', event.target.error);
                resolve([]);
            };
        });
    },

    async save(item) {
        const db = await this.init();
        
        // Ensure item has ID and Timestamp
        if (!item.id) item.id = Date.now().toString();
        if (!item.timestamp) item.timestamp = new Date().toLocaleString();

        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.put(item);

            request.onsuccess = async () => {
                await this.enforceLimit(50);
                resolve(item);
            };

            request.onerror = (event) => {
                console.error('Failed to save history:', event.target.error);
                reject(event.target.error);
            };
        });
    },

    async delete(id) {
        const db = await this.init();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.delete(id);

            request.onsuccess = () => resolve({ status: 'deleted' });
            request.onerror = (event) => {
                console.error('Failed to delete history:', event.target.error);
                reject(event.target.error);
            };
        });
    },

    async clear() {
        const db = await this.init();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.clear();

            request.onsuccess = () => resolve();
            request.onerror = (event) => reject(event.target.error);
        });
    },

    async enforceLimit(limit = 50) {
        const all = await this.getAll();
        if (all.length > limit) {
            const toDelete = all.slice(limit);
            const db = await this.init();
            const transaction = db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            
            toDelete.forEach(item => {
                store.delete(item.id);
            });
            
            return new Promise((resolve) => {
                transaction.oncomplete = () => resolve();
            });
        }
        return Promise.resolve();
    }
};

// Auto-initialize
dbService.init().catch(console.error);

window.dbService = dbService;
