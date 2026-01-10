
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import * as firebaseAuth from "firebase/auth";
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAeJ2HyFd0apmYydHH1xhIc5oD7iR5ANnI",
  authDomain: "reklamchat-bb1fe.firebaseapp.com",
  projectId: "reklamchat-bb1fe",
  storageBucket: "reklamchat-bb1fe.appspot.com",
  messagingSenderId: "798299866954",
  appId: "1:798299866954:web:1216cefd6eacacfcff23b3",
  measurementId: "G-YQGZ9ZQ4XL"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase services
const auth = firebaseAuth.initializeAuth(app, {
  persistence: Platform.OS === 'web' 
    ? firebaseAuth.inMemoryPersistence 
    : (firebaseAuth as any).getReactNativePersistence(AsyncStorage)
});

const db = getFirestore(app);

// Export them for use in other parts of your app
export { auth, db };
