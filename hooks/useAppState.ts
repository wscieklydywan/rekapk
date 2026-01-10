
import { useEffect } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from './useAuth';

/**
 * Clean & Optimized Hook for App State (Single Source of Truth version).
 * It has ONE responsibility: listen to the app's state (active/background)
 * and save it to the user's document in the 'users' collection.
 */
export const useAppState = () => {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;

    const userDocRef = doc(db, 'users', user.uid);

    const handleAppStateChange = async (nextAppState: AppStateStatus) => {
      const status = (nextAppState === 'active') ? 'active' : 'background';
      try {
        await setDoc(userDocRef, { appState: status }, { merge: true });
        console.log(`SUCCESS: App state '${status}' saved to users/${user.uid}`);
      } catch (error) {
        console.error("ERROR: Failed to save app state to Firestore:", error);
      }
    };

    // Set the initial state when the hook mounts
    const initialState = AppState.currentState;
    if (initialState) {
        handleAppStateChange(initialState);
    }

    // Subscribe to future app state changes
    const subscription = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      subscription.remove();
    };
  }, [user]);
};
