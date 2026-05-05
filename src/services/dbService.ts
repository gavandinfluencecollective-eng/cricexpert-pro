import { 
  collection, 
  addDoc, 
  query, 
  where, 
  getDocs, 
  orderBy, 
  limit, 
  Timestamp,
  serverTimestamp
} from 'firebase/firestore';
import { getFirebase } from '../lib/firebase';
import { AnalysisResult } from './geminiService';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: any;
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: "auth details hidden for privacy in logs",
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export async function saveAnalysis(userId: string, leagueType: string, teamCount: number, matchId: string | undefined, result: AnalysisResult) {
  const { db } = await getFirebase();
  if (!db) return null;

  const path = 'sessions';
  try {
    const docRef = await addDoc(collection(db, path), {
      userId,
      leagueType,
      teamCount,
      matchId: matchId || null,
      result,
      timestamp: serverTimestamp(),
    });
    return docRef.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function getAnalysisHistory(userId: string) {
  const { db } = await getFirebase();
  if (!db) return [];

  const path = 'sessions';
  try {
    const q = query(
      collection(db, path),
      where('userId', '==', userId),
      orderBy('timestamp', 'desc'),
      limit(20)
    );
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}
