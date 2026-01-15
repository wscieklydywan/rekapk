// Wrapper to replace react-native-flash-message's showMessage
// with our custom notification system

import { showNotification } from '@/app/contexts/NotificationContext';

export function showMessage(config: any) {
  // Simply delegate to our custom showNotification
  // which handles all the normalization
  showNotification(config);
}

// Re-export hideMessage as no-op since we handle hide in context
import { hideNotification } from '@/app/contexts/NotificationContext';

export function hideMessage() {
  // Delegate to NotificationContext's hide
  hideNotification();
}
