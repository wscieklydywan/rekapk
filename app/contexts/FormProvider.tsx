
import { Colors } from '@/constants/theme';
import { useAuth } from '@/hooks/useAuth';
import { db } from '@/lib/firebase';
import { showMessage } from '@/lib/showMessage';
import { ContactForm } from '@/schemas';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useSegments } from 'expo-router';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, View, useColorScheme } from 'react-native';

// Helper exported for unit testing: suppress notifications that occur
// within `thresholdMs` after a navigation/segments change.
export function shouldShowToastAfterSegmentChange(lastSegmentsChangeMs: number, nowMs = Date.now(), thresholdMs = 300) {
  return nowMs - (lastSegmentsChangeMs || 0) >= thresholdMs;
}

interface FormContextType {
  forms: ContactForm[];
  loading: boolean;
  totalUnreadCount: number;
  setForms: React.Dispatch<React.SetStateAction<ContactForm[]>>;
}

const FormContext = createContext<FormContextType>({
  forms: [],
  loading: true,
  totalUnreadCount: 0,
  setForms: () => {},
});

export const useFormContext = () => useContext(FormContext);

export const FormProvider: React.FC<{children: React.ReactNode}> = ({ children }) => {
  const [forms, setForms] = useState<ContactForm[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const router = useRouter();
  const segments = useSegments();
  const theme = useColorScheme() ?? 'light';
  const themeColors = Colors[theme];
  const isInitialLoad = useRef(true);
  // Timestamp of the last navigation/segment change — used to suppress
  // transient notifications that are caused by rapid navigation (the
  // reproduction you reported: spam `enter`/`back` causing a fake toast).
  const lastSegmentsChangeRef = useRef<number>(0);

  // Update the last-segments-change timestamp whenever the router segments change.
  useEffect(() => {
    lastSegmentsChangeRef.current = Date.now();
  }, [segments]);

  useEffect(() => {
    if (!user) {
      setForms([]);
      setLoading(false);
      isInitialLoad.current = true;
      return;
    }

    const formsCollection = collection(db, 'contact_forms');
    const q = query(formsCollection, orderBy('createdAt', 'desc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const newForms = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ContactForm));
      const onFormsScreen = segments.join('/').includes('(tabs)/forms');
      const onSpecificFormScreen = segments.join('/').includes('forms/');

      if (isInitialLoad.current) {
        setForms(newForms);
        setLoading(false);
        isInitialLoad.current = false;
        return;
      }

      snapshot.docChanges().forEach(change => {
        if (change.type === 'added' && !change.doc.metadata.hasPendingWrites) {
          if (!onFormsScreen && !onSpecificFormScreen) {
              // Suppress toasts that happen immediately after a navigation change —
              // these are the "ghost" notifications you reported when spamming
              // enter/back. Allow only when segments have been stable for >= 300ms.
              const now = Date.now();
              if (!shouldShowToastAfterSegmentChange(lastSegmentsChangeRef.current, now, 300)) {
                if ((global as any).__DEV__) console.debug('FormProvider: suppressed transient form toast due to recent navigation');
                return; // skip this change
              }

              const newFormData = change.doc.data();
              showMessage({
                message: "Nowy Formularz",
                description: `Od: ${newFormData.userInfo.contact}`,
                duration: 5000,
                onPress: () => { router.push((`/forms/${change.doc.id}`) as any); },
                floating: true,
                hideOnPress: true,
                chatId: change.doc.id,
                style: {
                  backgroundColor: theme === 'light' ? 'rgba(242, 242, 247, 0.97)' : 'rgba(28, 28, 30, 0.97)',
                  borderRadius: 20,
                  marginTop: Platform.OS === 'ios' ? 40 : 20,
                  marginHorizontal: 10,
                  paddingVertical: 10,
                  paddingHorizontal: 5,
                  ...Platform.select({
                    ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 6 },
                    android: { elevation: 8 }
                  })
                },
                titleStyle: { fontWeight: 'bold', fontSize: 15, color: themeColors.text, marginLeft: 5 },
                textStyle: { fontSize: 13, color: themeColors.textMuted, marginLeft: 5, marginTop: 2 },
                icon: () => (
                  <View style={{ justifyContent: 'center', height: '100%', marginLeft: 12, marginRight: 8 }}>
                    <Ionicons name="mail-outline" size={28} color={themeColors.tint} />
                  </View>
                ),
              });
              setLoading(false);
          }
        }
      });

    });

    return () => {
        unsubscribe();
        isInitialLoad.current = true;
    };
  }, [user, router, theme, segments]);

  const totalUnreadCount = useMemo(() =>
    forms.reduce((sum, form) => sum + (form.adminUnread > 0 ? 1 : 0), 0), 
  [forms]);

  const value = { forms, loading, totalUnreadCount, setForms };

  return (
    <FormContext.Provider value={value}>
      {children}
    </FormContext.Provider>
  );
};
