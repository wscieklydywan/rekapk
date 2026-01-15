import React, { createContext, useContext, useState } from 'react';

export interface NotificationConfig {
  title: string;
  description?: string;
  backgroundColor?: string;
  color?: string;
  icon?: React.ReactNode;
  duration?: number;
  type?: 'success' | 'warning' | 'danger' | 'info' | 'default';
  floating?: boolean;
  position?: 'top' | 'bottom' | 'center';
  style?: any;
  // Optional UX hooks and style overrides
  onPress?: () => void;
  hideOnPress?: boolean;
  titleStyle?: any;
  textStyle?: any;
  // Optional metadata to identify the source (e.g., chatId)
  chatId?: string;
  meta?: Record<string, any>;
}

interface NotificationContextType {
  show: (config: NotificationConfig) => void;
  hide?: () => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

// Color map for types
const typeColorMap: Record<string, { bg: string; text: string }> = {
  success: { bg: '#4CAF50', text: '#fff' },
  warning: { bg: '#FF9800', text: '#fff' },
  danger: { bg: '#F44336', text: '#fff' },
  // Use a more translucent default/info background so banner shows content beneath
  info: { bg: 'rgba(255,255,255,0.45)', text: '#111' },
  default: { bg: 'rgba(255,255,255,0.45)', text: '#111' },
};

// Global reference to notification controller (set by provider)
let globalNotificationController: NotificationContextType | undefined;
// Keep a module-level reference to current notification for quick checks
let currentNotification: NotificationConfig | null = null;

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [notification, setNotification] = useState<NotificationConfig | null>(null);

  const show = (config: NotificationConfig) => {
    // When showing, we set the current notification and let the banner itself
    // handle the auto-hide timing and run the exit animation before calling
    // back to `onDismiss`. This prevents unmounting before the exit animation.
    setNotification(config);
  };

  const hide = () => {
    setNotification(null);
  };

  // Update global reference (controller functions)
  React.useEffect(() => {
    globalNotificationController = { show, hide };
  }, []);

  // Keep module-level copy of current notification
  React.useEffect(() => {
    currentNotification = notification;
  }, [notification]);

  return (
    <NotificationContext.Provider value={{ show }}>
      {children}
      {notification && (
        <NotificationDisplay notification={notification} onDismiss={hide} />
      )}
    </NotificationContext.Provider>
  );
};

// Hide current notification if it matches the given chatId
export const hideNotificationForChat = (chatId?: string) => {
  if (!chatId) return;
  if (currentNotification && currentNotification.chatId === chatId) {
    if (globalNotificationController && typeof globalNotificationController.hide === 'function') {
      globalNotificationController.hide();
    }
  }
};

const NotificationDisplay: React.FC<{
  notification: NotificationConfig;
  onDismiss: () => void;
}> = ({ notification, onDismiss }) => {
  // Import here to avoid circular dependency
  const DismissibleBanner = require('@/components/DismissibleBanner').default;

  // Determine colors based on type if not explicitly set
  const typeColors = typeColorMap[notification.type ?? 'default'] ?? typeColorMap.default;
  const backgroundColor = notification.backgroundColor ?? typeColors.bg;
  const color = notification.color ?? typeColors.text;

  return (
    <DismissibleBanner
      title={notification.title}
      description={notification.description}
      backgroundColor={backgroundColor}
      color={color}
      icon={notification.icon}
      variant={notification.floating !== false ? 'floating' : 'flash'}
      duration={notification.duration ?? 1850}
      onDismiss={onDismiss}
      onPress={notification.onPress}
      hideOnPress={notification.hideOnPress}
      titleStyle={notification.titleStyle}
      textStyle={notification.textStyle}
      style={notification.style}
    />
  );
};

export const useNotification = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotification must be used within NotificationProvider');
  }
  return context;
};

// Global function — accepts either new API (title) or old API (message)
export const showNotification = (config: any) => {
  if (globalNotificationController) {
    // Normalize old API (message) to new API (title)
    const normalizedIcon = typeof config.icon === 'function' ? config.icon() : config.icon;

    const normalizedConfig: NotificationConfig = {
      title: config.message ?? config.title ?? '',
      description: config.description,
      backgroundColor: config.backgroundColor,
      color: config.color,
      icon: normalizedIcon,
      duration: config.duration,
      type: config.type,
      floating: config.floating ?? true, // default to floating
      position: config.position,
      style: config.style,
      // Forward optional behavior/style hooks
      onPress: config.onPress,
      hideOnPress: config.hideOnPress,
      titleStyle: config.titleStyle,
      textStyle: config.textStyle,
      // Forward optional identifiers
      chatId: config.chatId,
      meta: config.meta,
    };
    globalNotificationController.show(normalizedConfig);
  } else {
    console.warn('NotificationProvider not mounted, notification not shown');
  }
};

export const hideNotification = () => {
  if (globalNotificationController && typeof globalNotificationController.hide === 'function') {
    globalNotificationController.hide();
  } else {
    console.warn('NotificationProvider not mounted, cannot hide notification');
  }
};
