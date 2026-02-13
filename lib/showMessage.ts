// Wrapper to replace react-native-flash-message's showMessage
// with our custom notification system

import { hideNotification, showNotification } from '@/app/contexts/NotificationContext';

export function showMessage(config: any) {
  // Use the internal NotificationProvider API only.
  try {
    // Normalize and call provider-level show function
    showNotification(config);
  } catch (e) {
    // swallow to avoid runtime/ts errors in callers
    // eslint-disable-next-line no-console
    console.error('showMessage: showNotification failed', e);
  }
}

export function hideMessage() {
  try { hideNotification(); } catch (e) { /* ignore */ }
}
