
import { DebugProvider } from '@/contexts/DebugContext';
import { AuthProvider, useAuth } from '@/hooks/useAuth';
import { usePresence } from '@/hooks/usePresence';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import * as Notifications from 'expo-notifications';
import { Slot, useRouter, useSegments } from 'expo-router';
import { useEffect } from 'react';
import { Platform, UIManager } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { ChatProvider } from './contexts/ChatProvider';
import { FormProvider } from './contexts/FormProvider';
import { NotificationProvider } from './contexts/NotificationContext';
import { SessionProvider } from './contexts/SessionContext';

const InitialLayout = () => {
  const { user, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  usePushNotifications();
  usePresence();

  useEffect(() => {
    if (loading) return;
    const inAuthGroup = segments[0] === '(auth)';
    if (user && inAuthGroup) {
      router.replace('/(tabs)/');
    } else if (!user && !inAuthGroup) {
      router.replace('/(auth)/login');
    }
  }, [user, loading, segments, router]);

  // Enable LayoutAnimation on Android for smooth layout transitions
  useEffect(() => {
    if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
      try { UIManager.setLayoutAnimationEnabledExperimental(true); } catch (e) { /* ignore */ }
    }
  }, []);

  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener(response => {
      const data = response.notification.request.content.data;
      if (data && data.chatId) {
        try { require('@/app/contexts/NotificationContext').hideNotificationForChat(data.chatId); } catch (e) { /* ignore */ }
        router.push((`/conversation/${data.chatId}`) as any);
      } else if (data && data.formId) { 
        router.push((`/forms/${data.formId}`) as any);
      }
    });
    return () => subscription.remove();
  }, [router]);

  return <Slot />;
};

const RootLayout = () => {
  return (
    <AuthProvider>
      <SessionProvider>
        <ChatProvider>
          <FormProvider>
            <NotificationProvider>
              <GestureHandlerRootView style={{ flex: 1 }}>
                <SafeAreaProvider>
                    <SafeAreaView style={{ flex: 1 }}>
                      { (global as any).__DEV__ ? (
                        <DebugProvider>
                          <InitialLayout />
                        </DebugProvider>
                      ) : (
                        <InitialLayout />
                      ) }
                    </SafeAreaView>
                </SafeAreaProvider>
              </GestureHandlerRootView>
            </NotificationProvider>
          </FormProvider>
        </ChatProvider>
      </SessionProvider>
    </AuthProvider>
  );
}

export default RootLayout;
