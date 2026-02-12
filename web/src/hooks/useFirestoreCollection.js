import { useEffect, useState } from "react";
import { onSnapshot } from "firebase/firestore";

export function useFirestoreCollection(queryRef) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(Boolean(queryRef));
  const [error, setError] = useState(null);
  const hasQuery = Boolean(queryRef);

  useEffect(() => {
    if (!queryRef) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLoading(false);
      setError(null);
      setData([]);
      return undefined;
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);
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

  return {
    data: hasQuery ? data : [],
    loading: hasQuery ? loading : false,
    error: hasQuery ? error : null,
  };
}
