
import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { AiConversation } from '@/schemas';

export const useAiChats = () => {
  const [aiChats, setAiChats] = useState<AiConversation[]>([]);

  useEffect(() => {
    const aiChatsCollection = collection(db, 'ai_conversations');
    const q = query(aiChatsCollection, orderBy('lastActivity', 'desc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const chatsData = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          userInfo: data.userInfo,
          createdAt: data.createdAt,
          lastActivity: data.lastActivity,
          messageCount: data.messageCount,
          status: data.status,
          searchableContent: data.searchableContent,
          tags: data.tags,
        } as AiConversation;
      });
      setAiChats(chatsData);
    }, (error) => {
      console.error("Error fetching AI chats: ", error);
    });

    return () => unsubscribe();
  }, []);

  return { aiChats };
};
