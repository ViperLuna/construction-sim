// Where saves live (see docs/DESIGN.md, section 11.1).
//
// Two homes, used together:
//  - IndexedDB is the main one. It has far more room than localStorage (which is
//    only about 5 MB), so it's where a big save will end up living.
//  - localStorage keeps a mirror copy. It can be written instantly while a page
//    is closing (IndexedDB writes are asynchronous and can be cut off), and it's
//    the fallback if IndexedDB is blocked (some private windows).
// On load both are read and the newer save wins.
import { validate, SAVE_KEY } from './save.js';

const DB_NAME = 'construction-sim';
const STORE = 'saves';
const ROW = 'current';

// ----- IndexedDB backend -----
function openDb(idb) {
  return new Promise((resolve) => {
    try {
      const req = idb.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function request(db, mode, fn) {
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve({ ok: true, value: req ? req.result : undefined });
      tx.onerror = tx.onabort = () => resolve({ ok: false });
    } catch {
      resolve({ ok: false });
    }
  });
}

export function indexedDbBackend(idb = globalThis.indexedDB) {
  let dbPromise = null;
  const db = () => (dbPromise ||= idb ? openDb(idb) : Promise.resolve(null));
  return {
    name: 'IndexedDB',
    async read() {
      const d = await db();
      if (!d) return null;
      const r = await request(d, 'readonly', (s) => s.get(ROW));
      return r.ok && typeof r.value === 'string' ? r.value : null;
    },
    async write(text) {
      const d = await db();
      if (!d) return false;
      return (await request(d, 'readwrite', (s) => s.put(text, ROW))).ok;
    },
    async clear() {
      const d = await db();
      if (!d) return false;
      return (await request(d, 'readwrite', (s) => s.delete(ROW))).ok;
    },
  };
}

// ----- localStorage backend (every call guarded: it can be blocked or full) -----
export function localStorageBackend(storage = globalThis.localStorage) {
  return {
    name: 'localStorage',
    async read() {
      try {
        return storage.getItem(SAVE_KEY);
      } catch {
        return null;
      }
    },
    // Also available instantly, for the moment a page is closing.
    writeNow(text) {
      try {
        storage.setItem(SAVE_KEY, text);
        return true;
      } catch {
        return false;
      }
    },
    async write(text) {
      return this.writeNow(text);
    },
    async clear() {
      try {
        storage.removeItem(SAVE_KEY);
        return true;
      } catch {
        return false;
      }
    },
  };
}

function parse(text) {
  if (!text) return null;
  try {
    return validate(JSON.parse(text));
  } catch {
    return null;
  }
}

export class SaveStore {
  constructor(primary = indexedDbBackend(), mirror = localStorageBackend()) {
    this.primary = primary;
    this.mirror = mirror;
  }

  // Reads both homes and returns the newer valid save: { data, text, source } or null.
  async load() {
    const safeRead = (backend) => Promise.resolve().then(() => backend.read()).catch(() => null);
    const [a, b] = await Promise.all([safeRead(this.primary), safeRead(this.mirror)]);
    const found = [
      { text: a, source: this.primary.name },
      { text: b, source: this.mirror.name },
    ]
      .map((x) => ({ ...x, data: parse(x.text) }))
      .filter((x) => x.data);
    if (!found.length) return null;
    found.sort((x, y) => y.data.savedAt - x.data.savedAt);
    return found[0];
  }

  // Writes to both. The mirror is written immediately (so it works even as the
  // page closes); the returned promise settles when IndexedDB has finished.
  save(data) {
    const text = JSON.stringify(data);
    let mirrorOk = false;
    try {
      mirrorOk = this.mirror.writeNow ? !!this.mirror.writeNow(text) : false;
    } catch {
      mirrorOk = false;
    }
    const primaryDone = Promise.resolve()
      .then(() => this.primary.write(text))
      .then((ok) => !!ok)
      .catch(() => false);
    return { text, mirrorOk, done: primaryDone.then((primaryOk) => ({ primaryOk, mirrorOk, ok: primaryOk || mirrorOk, bytes: text.length })) };
  }

  async clear() {
    await Promise.all([this.primary, this.mirror].map((b) => Promise.resolve().then(() => b.clear()).catch(() => false)));
  }
}
