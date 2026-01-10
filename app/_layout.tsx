
import { useEffect } from 'react';
import { AuthProvider, useAuth } from '@/hooks/useAuth';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { usePresence } from '@/hooks/usePresence';
import { useRouter, useSegments, Slot } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as Notifications from 'expo-notifications';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import FlashMessage from 'react-native-flash-message';
import { ChatProvider } from './contexts/ChatProvider';
import { FormProvider } from './contexts/FormProvider';
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

  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener(response => {
      const data = response.notification.request.content.data;
      if (data && data.chatId) {
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
            <GestureHandlerRootView style={{ flex: 1 }}>
              <SafeAreaProvider>
                <SafeAreaView style={{ flex: 1 }}>
                  <InitialLayout />
                </SafeAreaView>
              </SafeAreaProvider>
              <FlashMessage position="top" floating={true} />
            </GestureHandlerRootView>
          </FormProvider>
        </ChatProvider>
      </SessionProvider>
    </AuthProvider>
  );
}

export default RootLayout;
