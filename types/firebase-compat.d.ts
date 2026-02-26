declare module '@/lib/firebase' {
  export const db: any;
  export const auth: any;
  export function collection(...args: any[]): any;
  export function doc(...args: any[]): any;
  export function onSnapshot(ref: any, cb: (snap: QuerySnapshot) => void, errCb?: any): () => void;
  export function query(ref: any, ...constraints: any[]): any;
  export function orderBy(field: string, dir?: any): any;
  export function limit(n: number): any;
  export function startAfter(cursor: any): any;
  export function getDocs(q: any): Promise<any>;
  export function getDoc(d: any): Promise<any>;
  export function addDoc(coll: any, data: any): Promise<any>;
  export function setDoc(d: any, data: any, options?: any): Promise<any>;
  export function updateDoc(d: any, data: any): Promise<any>;
  export function deleteDoc(d: any): Promise<any>;
  export function writeBatch(_db?: any): any;
  export function runTransaction(...args: any[]): Promise<any>;
  export function serverTimestamp(): any;
  export function increment(n: number): any;
  export function where(field: string, op: any, value: any): any;
  export const Timestamp: any;
  export type Timestamp = any;

  export interface QueryDocumentSnapshot { id: string; data(): any; }
  export interface QuerySnapshot { docs: QueryDocumentSnapshot[]; docChanges(): any[]; forEach(cb: (d: QueryDocumentSnapshot) => void): void; empty?: boolean; size?: number }
  export interface DocumentSnapshot { exists(): boolean; id: string; data(): any; }
  export function disableNetwork(_db?: any): Promise<any>;
  export function enableNetwork(_db?: any): Promise<any>;
  export function signInWithEmailAndPassword(_auth: any, email: string, password: string): Promise<any>;
  export function createUserWithEmailAndPassword(_auth: any, email: string, password: string): Promise<any>;
  export function signOut(_auth: any): Promise<any>;
  export function onAuthStateChanged(_auth: any, cb: any): any;
  const _default: any;
  export default _default;
}
