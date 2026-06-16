// Persistência via IndexedDB (cota grande, aguenta imagens base64).
// Fallback/migração do localStorage para não perder conteúdo antigo.

const DB_NAME = 'tiptap-playground'
const STORE = 'kv'
let dbPromise = null

function openDb() {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

export async function loadContent(key) {
  try {
    const db = await openDb()
    const val = await new Promise((resolve, reject) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(key)
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    if (val != null) return val
  } catch {
    /* IndexedDB indisponível */
  }
  try {
    return localStorage.getItem(key) || null
  } catch {
    return null
  }
}

export async function saveContent(key, val) {
  try {
    const db = await openDb()
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).put(val, key)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    // evita duplicar e estourar a cota do localStorage
    try {
      localStorage.removeItem(key)
    } catch {
      /* ignore */
    }
  } catch {
    try {
      localStorage.setItem(key, val)
    } catch {
      /* sem espaço — ignora */
    }
  }
}

export async function clearContent(key) {
  try {
    const db = await openDb()
    await new Promise((resolve) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).delete(key)
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
    })
  } catch {
    /* ignore */
  }
  try {
    localStorage.removeItem(key)
  } catch {
    /* ignore */
  }
}
