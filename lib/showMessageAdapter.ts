import { useNotification } from '@/app/contexts/NotificationContext';

// Global notification hook — can be accessed from anywhere via useNotification
export function useGlobalNotification() {
  return useNotification();
}

// Wrapper to replace showMessage calls — provides same API
export function createShowMessage() {
  // This will be called at runtime, we need to inject the context hook
  // Since showMessage is imported globally, we create a module-level adapter
  return function showMessage(config: any) {
    // This won't work directly — we need a different approach
    // Use the NotificationContext from the component level instead
  };
}
