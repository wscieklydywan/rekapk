import NetInfo from '@react-native-community/netinfo';
import { disableNetwork, enableNetwork } from 'firebase/firestore';
import { db } from './firebase';

let networkDisabled = false;
let unsubscribe: (() => void) | null = null;

const handleState = async (state: any) => {
  try {
    const hasInternet = state.isConnected === true && state.isInternetReachable !== false;

    if (!hasInternet && !networkDisabled) {
      console.log('[net] No internet → disabling Firestore network');
      try { await disableNetwork(db); } catch (e) { console.warn('[net] disableNetwork failed', e); }
      networkDisabled = true;
    }

    if (hasInternet && networkDisabled) {
      console.log('[net] Internet back → enabling Firestore network');
      try { await enableNetwork(db); } catch (e) { console.warn('[net] enableNetwork failed', e); }
      networkDisabled = false;
    }
  } catch (e) {
    console.warn('[net] handleState error', e);
  }
};

export const initFirestoreNetworkControl = async () => {
  if (unsubscribe) return;

  try {
    // Initial state check to handle cold-start offline cases
    const initial = await NetInfo.fetch();
    await handleState(initial);

    // Subscribe to changes
    unsubscribe = NetInfo.addEventListener(handleState);
  } catch (e) {
    console.warn('Failed to init FirestoreNetworkControl', e);
  }
};

export const shutdownFirestoreNetworkControl = () => {
  try {
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
  } catch (e) { /* ignore */ }
};

export default initFirestoreNetworkControl;
