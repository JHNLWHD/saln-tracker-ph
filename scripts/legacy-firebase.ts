// Operator-only historical capture; never imported by the public app.
import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

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

