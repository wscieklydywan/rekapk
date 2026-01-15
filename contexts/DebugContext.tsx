
import React, { createContext, ReactNode, useContext, useState } from 'react';

// Define the shape of the context data
interface DebugContextType {
  messages: string[];
  addMessage: (message: string) => void;
}

// Create the context with a default value that should ideally not be used
const DebugContext = createContext<DebugContextType>({ messages: [], addMessage: () => {} });

// Create a provider component
export const DebugProvider = ({ children }: { children: ReactNode }) => {
  const [messages, setMessages] = useState<string[]>([]);

  const addMessage = (message: string) => {
    // Create a message with a timestamp
    const timedMessage = `${new Date().toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}: ${message}`;
    // Log to console for developers viewing logs in the terminal
    if ((global as any).__DEV__) {
      console.debug(`[DIAGNOSTIC LOG] ${message}`);
    }
    // Update state, keeping only the last 20 messages to prevent memory leaks
    setMessages(prev => [...prev.slice(-20), timedMessage]);
  };

  return (
    <DebugContext.Provider value={{ messages, addMessage }}>
      {children}
    </DebugContext.Provider>
  );
};

// Create a custom hook to easily use the debug context
export const useDebug = () => {
  const context = useContext(DebugContext);
  // No need to check for undefined since we provided a default value.
  return context;
};
