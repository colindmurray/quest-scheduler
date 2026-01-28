import { getFunctions, httpsCallable } from "firebase/functions";

export async function registerQsUsername(username) {
  const functions = getFunctions();
  const register = httpsCallable(functions, "registerQsUsername");
  const response = await register({ username });
  return response.data;
}
