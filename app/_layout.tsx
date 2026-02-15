import { hideNotificationForChat } from '@/app/contexts/NotificationContext';
import { DebugProvider } from '@/contexts/DebugContext';
import { AuthProvider, useAuth } from '@/hooks/useAuth';
import { usePresence } from '@/hooks/usePresence';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import * as Notifications from 'expo-notifications';
import { Stack, useRouter, useSegments } from 'expo-router';
// Dev-only: import test screen to allow bypassing app wrappers when debugging overscroll
import BottomToast from '@/components/BottomToast';
import { Colors } from '@/constants/theme';
import * as NavigationBar from 'expo-navigation-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { Platform, StatusBar, UIManager, useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
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

  // Sonner/Toast removed per request

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

  return (
    // Keep root Stack mounted so Android does not detach inactive screens.
    <Stack screenOptions={{ detachInactiveScreens: false, freezeOnBlur: false, headerShown: false } as any} />
  );
};

const RootLayout = () => {
  const scheme = useColorScheme() ?? 'light';
  const themeColors = Colors[scheme];

  useEffect(() => {
    if (Platform.OS === 'android' && NavigationBar && typeof NavigationBar.setBackgroundColorAsync === 'function') {
      try {
        NavigationBar.setBackgroundColorAsync(themeColors.background);
        NavigationBar.setButtonStyleAsync(scheme === 'light' ? 'dark' : 'light');
      } catch (e) { /* ignore */ }
    }
    // Try to hide any native splash overlay that may remain (no-op if already hidden)
    try { SplashScreen.hideAsync().catch(() => {}); } catch (e) { /* ignore */ }
  }, [scheme, themeColors]);
  // sonnerBridge removed per request; no bridge registration

  return (
    <>
      <StatusBar translucent backgroundColor="transparent" />
      <GestureHandlerRootView style={{ flex: 1 }}>
        <AuthProvider>
          <SessionProvider>
            <ChatProvider>
              <FormProvider>
                <NotificationProvider>
                  <SafeAreaProvider>
                    <KeyboardProvider>
                      <SafeAreaView style={{ flex: 1 }} edges={[ 'left', 'right', 'bottom' as any ]}>
                        { (global as any).__DEV__ ? (
                          <DebugProvider>
                            <InitialLayout />
                          </DebugProvider>
                        ) : (
                          <InitialLayout />
                        ) }
                      </SafeAreaView>
                    </KeyboardProvider>
                  </SafeAreaProvider>
                </NotificationProvider>
              </FormProvider>
            </ChatProvider>
          </SessionProvider>
        </AuthProvider>
      </GestureHandlerRootView>
      <BottomToast />
    </>
  );
}

export default RootLayout;
