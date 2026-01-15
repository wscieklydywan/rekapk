
import { db } from '@/lib/firebase';
import { User } from '@/schemas';
import { collection, getDocs } from 'firebase/firestore';
import { useEffect, useState } from 'react';

export const useAdmins = () => {
  const [admins, setAdmins] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAdmins = async () => {
      try {
        const adminsCollection = collection(db, 'admin_users');
        const adminSnapshot = await getDocs(adminsCollection);
        const adminList = adminSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as User));
        setAdmins(adminList);
      } catch (error) {
        console.error("Error fetching admins: ", error);
      }
      setLoading(false);
    };

    fetchAdmins();
  }, []);

  return { admins, loading };
};
