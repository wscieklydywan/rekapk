
import { useState } from 'react';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { Alert } from 'react-native';

export const useCreateUser = () => {
  const [loading, setLoading] = useState(false);

  const createUser = async (email: string, password: string) => {
    if (!email || !password) {
      Alert.alert('Error', 'Please enter both email and password.');
      return;
    }

    setLoading(true);
    try {
      // This is a simplified example. In a real app, you'd likely
      // want to add a role to the user's profile in Firestore.
      await createUserWithEmailAndPassword(auth, email, password);
    } catch (error: any) {
      Alert.alert('Registration Failed', error.message);
    } finally {
      setLoading(false);
    }
  };

  return { createUser, loading };
};
