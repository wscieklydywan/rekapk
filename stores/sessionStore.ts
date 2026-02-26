import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

type SessionState = {
  uid: string | null;
  displayName: string | null;
  role?: string | null;
  avatar?: string | null;
  isHydrated: boolean;
  setSession: (s: { uid?: string | null; displayName?: string | null; role?: string | null; avatar?: string | null }) => void;
  clearSession: () => void;
  _setHydrated: (v: boolean) => void;
};

const useSessionStore = create<SessionState>()(
  persist(
    (set, get) => ({
      uid: null,
      displayName: null,
      role: null,
      avatar: null,
      isHydrated: false,
      setSession: (s: Partial<{ uid: string | null; displayName: string | null; role: string | null; avatar: string | null }>) => set({ uid: s.uid ?? null, displayName: s.displayName ?? null, role: s.role ?? null, avatar: s.avatar ?? null }),
      clearSession: () => set({ uid: null, displayName: null, role: null, avatar: null }),
      _setHydrated: (v: boolean) => set({ isHydrated: v }),
    }),
    {
      name: 'sessionStore',
      storage: createJSONStorage(() => AsyncStorage),
      onRehydrateStorage: () => (state) => {
        try {
          useSessionStore.getState()._setHydrated(true);
        } catch (e) {}
      },
    }
  )
);

export default useSessionStore;
