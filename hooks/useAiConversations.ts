
import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { useAuth } from '@/hooks/useAuth';
import { Chat } from '@/schemas';

export const useAiConversations = () => {
  const [conversations, setConversations] = useState<Chat[]>([]);
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;

    const conversationsCollection = collection(db, 'aiChats');
    const q = query(conversationsCollection, orderBy('timestamp', 'desc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const conversationsData = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })) as Chat[];
      setConversations(conversationsData);
    });

    return () => unsubscribe();
  }, [user]);

  return { conversations };
};
