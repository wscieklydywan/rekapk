
import { hideNotificationForChat } from '@/app/contexts/NotificationContext';
import { DebugProvider } from '@/contexts/DebugContext';
import { AuthProvider, useAuth } from '@/hooks/useAuth';
import { usePresence } from '@/hooks/usePresence';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import * as Notifications from 'expo-notifications';
import { Slot, useRouter, useSegments } from 'expo-router';
// Dev-only: import test screen to allow bypassing app wrappers when debugging overscroll
import { useEffect } from 'react';
import { Platform, UIManager } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { ChatProvider } from './contexts/ChatProvider';
import { FormProvider } from './contexts/FormProvider';
import { NotificationProvider } from './contexts/NotificationContext';
import { SessionProvider } from './contexts/SessionContext';
import TestOverscroll from './test-overscroll';

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
        try { hideNotificationForChat(data.chatId); } catch (e) { /* ignore */ }
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
  // Toggle this to `true` during debugging to render `TestOverscroll` without providers/wrappers.
  const DEV_BYPASS_TEST_OVERSCROLL = false && (global as any).__DEV__;

  if (DEV_BYPASS_TEST_OVERSCROLL) {
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaView style={{ flex: 1 }}>
          <TestOverscroll />
        </SafeAreaView>
      </GestureHandlerRootView>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AuthProvider>
        <SessionProvider>
          <ChatProvider>
            <FormProvider>
              <NotificationProvider>
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
              </NotificationProvider>
            </FormProvider>
          </ChatProvider>
        </SessionProvider>
      </AuthProvider>
    </GestureHandlerRootView>
  );
}

export default RootLayout;
