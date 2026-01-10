// hooks/usePresence.ts

import { useEffect, useCallback } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { doc, updateDoc } from 'firebase/firestore';
import { useAuth } from './useAuth';
import { db } from '@/lib/firebase';

/**
 * Zarządza obecnością użytkownika w Firestore.
 * Ustawia `isForeground` na true/false w zależności od stanu aplikacji.
 */
export const usePresence = () => {
  const { user } = useAuth();

  const updatePresence = useCallback((isForeground: boolean) => {
    if (!user?.uid) return;
    try {
      const userDocRef = doc(db, 'users', user.uid);
      updateDoc(userDocRef, { isForeground });
    } catch (error) {
      console.error("[usePresence] Error updating user presence:", error);
    }
  }, [user]);

  const handleAppStateChange = useCallback((nextAppState: AppStateStatus) => {
    const isForeground = nextAppState === 'active';
    updatePresence(isForeground);
  }, [updatePresence]);
  
  useEffect(() => {
    if (!user?.uid) return;

    // Ustaw stan początkowy przy montowaniu i po zalogowaniu
    handleAppStateChange(AppState.currentState);

    // Subskrybuj zmiany stanu aplikacji
    const subscription = AppState.addEventListener('change', handleAppStateChange);

    // Funkcja czyszcząca
    return () => {
      subscription.remove();
    };
  }, [user, handleAppStateChange]);
};
