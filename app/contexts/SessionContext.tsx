
import React, { createContext, useState, useEffect, useContext, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';

interface SessionContextType {
  appEnteredAt: number;
}

const SessionContext = createContext<SessionContextType>({ appEnteredAt: Date.now() });

export const useSession = () => useContext(SessionContext);

export const SessionProvider: React.FC<{children: React.ReactNode}> = ({ children }) => {
  const [appEnteredAt, setAppEnteredAt] = useState(Date.now());
  const appState = useRef(AppState.currentState);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextAppState => {
      if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
        // App has come to the foreground!
        setAppEnteredAt(Date.now());
      }
      appState.current = nextAppState;
    });

    return () => {
      subscription.remove();
    };
  }, []);

  return (
    <SessionContext.Provider value={{ appEnteredAt }}>
      {children}
    </SessionContext.Provider>
  );
};
