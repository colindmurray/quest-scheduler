import { useEffect, useState } from "react";
import { onSnapshot } from "firebase/firestore";

export function useFirestoreCollection(queryRef) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(Boolean(queryRef));
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!queryRef) {
      setLoading(false);
      return undefined;
    }

    setLoading(true);
    const unsubscribe = onSnapshot(
      queryRef,
      (snapshot) => {
        setData(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
        setLoading(false);
      },
      (err) => {
        setError(err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [queryRef]);

  return { data, loading, error };
}
