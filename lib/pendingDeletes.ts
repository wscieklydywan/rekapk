const pending = new Set<string>();

export function addPendingDelete(id: string) {
  try { pending.add(id); } catch (e) { /* ignore */ }
}

export function removePendingDelete(id: string) {
  try { pending.delete(id); } catch (e) { /* ignore */ }
}

export function isPendingDelete(id: string) {
  return pending.has(id);
}

export function getPendingDeletes() {
  return Array.from(pending);
}

export default { addPendingDelete, removePendingDelete, isPendingDelete, getPendingDeletes };
