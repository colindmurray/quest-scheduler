import { useEffect, useState } from "react";
import { onSnapshot } from "firebase/firestore";

export function useFirestoreDoc(docRef) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(Boolean(docRef));
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!docRef) {
      setLoading(false);
      return undefined;
    }

    setLoading(true);
    const unsubscribe = onSnapshot(
      docRef,
      (snapshot) => {
        setData(snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null);
        setLoading(false);
      },
      (err) => {
        setError(err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [docRef]);

  return { data, loading, error };
}
