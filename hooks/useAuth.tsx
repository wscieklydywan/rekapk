
import { auth, db } from '@/lib/firebase';
import useSessionStore from '@/stores/sessionStore';
import { User as FirebaseUser, onAuthStateChanged } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import React, { createContext, useContext, useEffect, useState } from 'react';

export interface AuthContextType {
  user: FirebaseUser | null;
  loading: boolean;
  displayName: string | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [displayName, setDisplayName] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setLoading(false);

      if (firebaseUser) {
        const userRef = doc(db, 'users', firebaseUser.uid);
        // try to read persisted session fallback first
        try {
          const s = useSessionStore.getState();
          if (s && s.displayName) {
            setDisplayName(s.displayName);
          }
        } catch (e) { /* ignore */ }

        const unsubscribeSnapshot = onSnapshot(userRef, (docSnap) => {
          if (docSnap.exists()) {
            const name = docSnap.data().displayName || null;
            setDisplayName(name);
            try { useSessionStore.getState().setSession({ uid: firebaseUser.uid, displayName: name }); } catch (e) { /* ignore */ }
          }
        }, (err) => {
          if ((global as any).__DEV__) console.warn('user snapshot error (using persisted session if available):', err);
        });
        return () => unsubscribeSnapshot();
      }
    });

    return () => unsubscribeAuth();
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, displayName }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
