import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  type DocumentData,
  type QueryConstraint,
} from "firebase/firestore";
import { app } from "./firebase";

export const db = getFirestore(app);

export const getDocument = async <T = DocumentData>(
  collectionPath: string,
  docId: string
): Promise<T | null> => {
  const snap = await getDoc(doc(db, collectionPath, docId));
  return snap.exists() ? (snap.data() as T) : null;
};

export const getCollection = async <T = DocumentData>(
  collectionPath: string,
  ...constraints: QueryConstraint[]
): Promise<(T & { id: string })[]> => {
  const q = query(collection(db, collectionPath), ...constraints);
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as T) }));
};

export const setDocument = (collectionPath: string, docId: string, data: DocumentData) =>
  setDoc(doc(db, collectionPath, docId), data);

export const addDocument = (collectionPath: string, data: DocumentData) =>
  addDoc(collection(db, collectionPath), data);

export const updateDocument = (collectionPath: string, docId: string, data: Partial<DocumentData>) =>
  updateDoc(doc(db, collectionPath, docId), data);

export const deleteDocument = (collectionPath: string, docId: string) =>
  deleteDoc(doc(db, collectionPath, docId));

export { collection, doc, query, where, orderBy, limit, onSnapshot };
