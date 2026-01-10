
import { useState, useEffect } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { AdminUser } from '@/schemas';

export const useAdmins = () => {
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAdmins = async () => {
      try {
        const adminsCollection = collection(db, 'admin_users');
        const adminSnapshot = await getDocs(adminsCollection);
        const adminList = adminSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AdminUser));
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
