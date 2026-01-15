
import { Colors } from '@/constants/theme';
import { useAuth } from '@/hooks/useAuth';
import { db } from '@/lib/firebase';
import { showMessage } from '@/lib/showMessage';
import { ContactForm } from '@/schemas';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useSegments } from 'expo-router';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, useColorScheme } from 'react-native';

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
              const newFormData = change.doc.data();
              showMessage({
                message: "Nowy Formularz",
                description: `Od: ${newFormData.userInfo.contact}`,
                duration: 4000,
                onPress: () => router.push((`/forms/${change.doc.id}`) as any),
                floating: true,
                hideOnPress: true,
                style: { backgroundColor: theme === 'light' ? '#EFEFF4' : '#2C2C2E', borderRadius: 16, marginTop: Platform.OS === 'ios' ? 20 : 10, marginHorizontal: 8, ...Platform.select({ ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 8 }, android: { elevation: 10 } }) },
                titleStyle: { fontWeight: 'bold', fontSize: 16, color: themeColors.text },
                icon: () => <Ionicons name="document-text-outline" size={28} color={themeColors.tint} style={{ marginRight: 15, marginLeft: 5 }} />,
              });
          }
        }
      });

      setForms(newForms);
      if (loading) setLoading(false);

    }, (error) => {
      console.error("Błąd w FormProvider: ", error);
      setLoading(false);
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
