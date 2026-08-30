import { openDB } from 'idb';

const DB_NAME = 'honeychain_pwa_db';
const STORE_TELEMETRY = 'telemetry_queue';
const STORE_HIVES = 'hives_cache';
const STORE_BATCHES = 'batches_queue';

export async function initDb() {
  return openDB(DB_NAME, 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_TELEMETRY)) {
        db.createObjectStore(STORE_TELEMETRY, { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains(STORE_HIVES)) {
        db.createObjectStore(STORE_HIVES, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_BATCHES)) {
        db.createObjectStore(STORE_BATCHES, { keyPath: 'id', autoIncrement: true });
      }
    },
  });
}

export async function queueTelemetry(log: any) {
  const db = await initDb();
  await db.add(STORE_TELEMETRY, { ...log, queuedAt: new Date().toISOString() });
}

export async function getQueuedTelemetry() {
  const db = await initDb();
  return db.getAll(STORE_TELEMETRY);
}

export async function clearQueuedTelemetry(ids: number[]) {
  const db = await initDb();
  const tx = db.transaction(STORE_TELEMETRY, 'readwrite');
  for (const id of ids) {
    await tx.store.delete(id);
  }
  await tx.done;
}

export async function cacheHives(hives: any[]) {
  const db = await initDb();
  const tx = db.transaction(STORE_HIVES, 'readwrite');
  await tx.store.clear();
  for (const hive of hives) {
    await tx.store.put(hive);
  }
  await tx.done;
}

export async function getCachedHives() {
  const db = await initDb();
  return db.getAll(STORE_HIVES);
}

export async function queueBatch(batch: any) {
  const db = await initDb();
  await db.add(STORE_BATCHES, { ...batch, queuedAt: new Date().toISOString() });
}

export async function getQueuedBatches() {
  const db = await initDb();
  return db.getAll(STORE_BATCHES);
}

export async function clearQueuedBatches(ids: number[]) {
  const db = await initDb();
  const tx = db.transaction(STORE_BATCHES, 'readwrite');
  for (const id of ids) {
    await tx.store.delete(id);
  }
  await tx.done;
}
