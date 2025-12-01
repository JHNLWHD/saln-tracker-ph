import { initializeApp } from 'firebase/app';
import { getFirestore, enableIndexedDbPersistence } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyCMAns-f4uD4_zFyLqzK-Rn_POU3ib8pQw",
  authDomain: "saln-tracker-ph.firebaseapp.com",
  projectId: "saln-tracker-ph",
  storageBucket: "saln-tracker-ph.firebasestorage.app",
  messagingSenderId: "773061778885",
  appId: "1:773061778885:web:dc7522e2a9ef8bb6517fac",
  measurementId: "G-JY0WZWBC2P"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firestore
export const db = getFirestore(app);

// Enable offline persistence (cache to IndexedDB)
// This allows the app to work offline and reduces Firestore reads
if (typeof window !== 'undefined') {
  enableIndexedDbPersistence(db).catch((err) => {
    if (err.code === 'failed-precondition') {
      // Multiple tabs open, persistence can only be enabled in one tab at a time
      console.warn('Firestore persistence failed: Multiple tabs open');
    } else if (err.code === 'unimplemented') {
      // The current browser doesn't support persistence
      console.warn('Firestore persistence not supported in this browser');
    }
  });
}


