import { db } from '@/lib/firebase';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { doc, setDoc } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { useAuth } from './useAuth';

/**
 * Registers the app for push notifications and returns the Expo Push Token.
 */
async function registerForPushNotificationsAsync(): Promise<string | null> {
  if (!Device.isDevice) {
    console.warn("Push notifications are only available on physical devices.");
    return null;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.warn("Failed to get push token for push notification!");
    return null;
  }

  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  if (!projectId) {
      console.warn("Could not find 'projectId' in app config. 'getExpoPushTokenAsync' might not work correctly in production builds.");
  }

  try {
    const tokenObject = await Notifications.getExpoPushTokenAsync({ projectId });
    const token = tokenObject.data;
    
    // ANDROID: Create a high-importance channel for heads-up notifications
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('chat-messages', {
        name: 'Wiadomości i formularze',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250], // Standard vibration
        lightColor: '#FF231F7C', // Optional custom light color
        sound: 'default', // Use the default notification sound
      });
    }
    
    return token;
  } catch (error) {
    console.error("Error getting Expo push token:", error);
    return null;
  }
}

/**
 * A hook that handles push notification registration and token saving.
 */
export const usePushNotifications = () => {
  const { user } = useAuth();
  const [expoPushToken, setExpoPushToken] = useState<string | null>(null);

  useEffect(() => {
    const registerAndSaveToken = async () => {
      if (!user?.uid) return;

      const token = await registerForPushNotificationsAsync();
      setExpoPushToken(token);

      if (token) {
        try {
          const userDocRef = doc(db, 'users', user.uid);
          await setDoc(userDocRef, { pushToken: token }, { merge: true });
        } catch (error) {
          console.error("Error saving push token to Firestore:", error);
        }
      }
    };

    registerAndSaveToken();
  }, [user]);

  return { expoPushToken };
};
