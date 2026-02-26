// Lightweight RNFirebase compatibility wrapper
// Provides a small subset of the Web SDK style API used across the app
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';

const db = firestore();
const authClient = auth();

function _normalizeSegments(args: any[]) {
  // If first arg is a db object (legacy web call: collection(db, 'chats', id)), drop it
  if (args.length >= 2 && (args[0] === db || args[0] === undefined || typeof args[0] === 'object')) {
    return args.slice(1);
  }
  return args;
}

export function collection(...args: any[]) {
  const segments = _normalizeSegments(args);
  let ref: any = firestore();
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (i % 2 === 0) {
      ref = ref.collection(seg);
    } else {
      ref = ref.doc(seg);
    }
  }
  return ref;
}

export function doc(...args: any[]) {
  // Patterns supported:
  // doc(collectionRef, id)
  // doc(db, 'chats', id)
  if (args.length === 2 && typeof args[0] === 'object') {
    return args[0].doc(args[1]);
  }
  const last = args[args.length - 1];
  const coll = collection(...args.slice(0, args.length - 1));
  return coll.doc(last);
}

export function onSnapshot(ref: any, cb: any, errCb?: any) {
  const unsub = ref.onSnapshot((snap: any) => cb(snap), errCb);
  return unsub;
}

export function query(ref: any, ...constraints: any[]) {
  let r = ref;
  constraints.forEach((c) => {
    r = c(r);
  });
  return r;
}

export function orderBy(fieldPath: string, directionStr?: any) {
  return (ref: any) => ref.orderBy(fieldPath, directionStr);
}

export function limit(n: number) {
  return (ref: any) => ref.limit(n);
}

export function startAfter(cursor: any) {
  return (ref: any) => ref.startAfter(cursor);
}

export async function getDocs(q: any) {
  return q.get();
}

export async function getDoc(d: any) {
  return d.get();
}

export async function addDoc(coll: any, data: any) {
  return coll.add(data);
}

export async function setDoc(d: any, data: any, options?: any) {
  if (options && options.merge) return d.set(data, { merge: true });
  return d.set(data);
}

export async function updateDoc(d: any, data: any) {
  return d.update(data);
}

export async function deleteDoc(d: any) {
  return d.delete();
}

export function writeBatch(_db?: any) {
  return firestore().batch();
}

export function runTransaction(...args: any[]) {
  // support both runTransaction(db, fn) and runTransaction(fn)
  let fn: any;
  if (args.length === 2) fn = args[1];
  else fn = args[0];
  return firestore().runTransaction(fn);
}

export const serverTimestamp = () => firestore.FieldValue.serverTimestamp();
export const increment = (n: number) => firestore.FieldValue.increment(n);

export function where(fieldPath: string, opStr: any, value: any) {
  return (ref: any) => ref.where(fieldPath, opStr, value);
}

export const disableNetwork = (_db?: any) => firestore().disableNetwork();
export const enableNetwork = (_db?: any) => firestore().enableNetwork();

export class Timestamp {
  static now() {
    const ms = Date.now();
    return { toMillis: () => ms, seconds: Math.floor(ms / 1000) } as any;
  }
  static fromMillis(ms: number) {
    return { toMillis: () => ms, seconds: Math.floor(ms / 1000) } as any;
  }
}

export { db, authClient as auth };

export default firestore;

// Auth helpers that mirror Web SDK signatures used across the app
export async function signInWithEmailAndPassword(_auth: any, email: string, password: string) {
  return authClient.signInWithEmailAndPassword(email, password);
}

export function onAuthStateChanged(_auth: any, cb: any) {
  return authClient.onAuthStateChanged(cb);
}

export async function signOut(_auth: any) {
  return authClient.signOut();
}

export async function createUserWithEmailAndPassword(_auth: any, email: string, password: string) {
  return authClient.createUserWithEmailAndPassword(email, password);
}
