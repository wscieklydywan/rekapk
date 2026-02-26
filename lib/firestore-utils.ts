import { CollectionReference, Firestore, getDocs, limit, query, writeBatch, WriteBatch } from 'firebase/firestore';

/**
 * Safely deletes all documents in a collection in batches (avoids 500-op limit).
 * - Default batchSize is 400 (conservative under Firestore 500 limit).
 * - Accepts optional injection for getDocs/writeBatch to ease unit testing.
 *
 * Returns number of deleted documents.
 */
export async function deleteCollectionInBatches(
  db: Firestore,
  collectionRef: CollectionReference,
  batchSize = 400,
  opts?: {
    getDocsFn?: typeof getDocs;
    writeBatchFn?: typeof writeBatch;
  }
): Promise<number> {
  const _getDocs = opts?.getDocsFn ?? getDocs;
  const _writeBatch = opts?.writeBatchFn ?? writeBatch;
  if (batchSize <= 0 || batchSize >= 500) batchSize = 400;

  let totalDeleted = 0;

  while (true) {
    // query one page
    const q = query(collectionRef, limit(batchSize));
    const snap = await _getDocs(q as any);
    if (!snap || snap.empty) break;

    const batch = _writeBatch(db as any);
    snap.docs.forEach((d: any) => batch.delete(d.ref));

    await commitBatchWithRetries(batch as WriteBatch);

    totalDeleted += snap.size;

    // If we deleted fewer than page size, we're done
    if (snap.size < batchSize) break;

    // small pause to avoid hot tight-loop against emulator / backend
    await new Promise((r) => setTimeout(r, 20));
  }

  return totalDeleted;
}

/**
 * Commit a WriteBatch with simple retry logic on transient/precondition failures.
 * Retries when the error code contains 'failed-precondition' up to `maxRetries`.
 */
export async function commitBatchWithRetries(batch: WriteBatch, maxRetries = 3): Promise<void> {
  let attempt = 0;
  while (true) {
    try {
      await batch.commit();
      return;
    } catch (err: any) {
      attempt++;
      const codeStr = (err && (err.code || err.status || err.message) || '').toString();
      if (attempt > maxRetries) throw err;
      // Retry on failed-precondition which often indicates a write conflict.
      if (codeStr.includes('failed-precondition')) {
        const delay = 150 * Math.pow(2, attempt); // exponential backoff base
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }
}
