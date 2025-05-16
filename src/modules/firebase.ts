// Firebase configuration and utility functions
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, doc, getDocs, getDoc, addDoc, updateDoc, query, where, type DocumentData, DocumentReference, CollectionReference } from 'firebase/firestore';
import type { Mosque } from './mosqueData';

// Firebase configuration
// For development purposes, using a placeholder config
// In production, this should be replaced with actual Firebase config
const firebaseConfig = {
  apiKey: import.meta.env.FIREBASE_API_KEY || (window as any).__ENV__?.FIREBASE_API_KEY || '',
  authDomain: "akh-mosques.firebaseapp.com",
  projectId: "akh-mosques",
  storageBucket: "akh-mosques.firebasestorage.app",
  messagingSenderId: "22059571998",
  appId: "1:22059571998:web:13e83b2ba4a8eb0b63870f",
  measurementId: "G-N82N2LKR11"
};

// Initialize Firebase
let app;
let db: boolean | any;

// Initialize Firebase only in browser environment
if (typeof window !== 'undefined') {
  try {
    app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    console.log('Firebase initialized successfully');
  } catch (error) {
    console.error('Error initializing Firebase:', error);
  }
}

// Collection references
const getMosquesCollection = (): CollectionReference => {
  if (!db) throw new Error('Firestore not initialized');
  return collection(db, 'mosques');
};

// Mosque CRUD operations
export async function fetchMosques(): Promise<Mosque[]> {
  try {
    const mosquesCollection = getMosquesCollection();
    const snapshot = await getDocs(mosquesCollection);
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as Mosque[];
  } catch (error) {
    console.error('Error fetching mosques:', error);
    return [];
  }
}

export async function fetchMosqueById(id: string): Promise<Mosque | null> {
  try {
    const mosqueRef = doc(getMosquesCollection(), id);
    const snapshot = await getDoc(mosqueRef);
    
    if (snapshot.exists()) {
      return { id: snapshot.id, ...snapshot.data() } as Mosque;
    }
    return null;
  } catch (error) {
    console.error(`Error fetching mosque with ID ${id}:`, error);
    return null;
  }
}

export async function searchMosquesByName(searchQuery: string): Promise<Mosque[]> {
  try {
    // For a proper search, you might want to use Firebase's array-contains or other query methods
    // This is a simple implementation that fetches all and filters client-side
    const mosques = await fetchMosques();
    return mosques.filter(mosque => 
      mosque.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
  } catch (error) {
    console.error('Error searching mosques:', error);
    return [];
  }
}

export async function createMosque(mosque: Omit<Mosque, 'id'>): Promise<Mosque | null> {
  try {
    const docRef = await addDoc(getMosquesCollection(), mosque);
    return { id: docRef.id, ...mosque };
  } catch (error) {
    console.error('Error creating mosque:', error);
    return null;
  }
}

export async function updateMosqueData(id: string, data: Partial<Mosque>): Promise<boolean> {
  try {
    const mosqueRef = doc(getMosquesCollection(), id);
    await updateDoc(mosqueRef, data as DocumentData);
    return true;
  } catch (error) {
    console.error(`Error updating mosque with ID ${id}:`, error);
    return false;
  }
}