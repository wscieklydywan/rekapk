
import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { collection, query, orderBy, onSnapshot, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { ContactMessage } from '@/schemas';

export const useContactMessages = () => {
  const [messages, setMessages] = useState<ContactMessage[]>([]);

  useEffect(() => {
    const messagesCollection = collection(db, 'contact_messages');
    const q = query(messagesCollection, orderBy('timestamp', 'asc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const messagesData = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })) as ContactMessage[];
      setMessages(messagesData);
    });

    return () => unsubscribe();
  }, []);

  const markAsResolved = async (messageId: string) => {
    const messageRef = doc(db, 'contact_messages', messageId);
    await updateDoc(messageRef, {
      resolved: true
    });
  };

  const deleteMessage = async (messageId: string) => {
    const messageRef = doc(db, 'contact_messages', messageId);
    await deleteDoc(messageRef);
  };

  return { messages, markAsResolved, deleteMessage };
};
