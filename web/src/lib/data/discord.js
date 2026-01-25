import { getFunctions, httpsCallable } from "firebase/functions";

export async function startDiscordOAuth() {
  const functions = getFunctions();
  const startAuth = httpsCallable(functions, "discordOAuthStart");
  const response = await startAuth();
  return response.data?.authUrl || null;
}

export async function generateDiscordLinkCode(groupId) {
  const functions = getFunctions();
  const generateCode = httpsCallable(functions, "discordGenerateLinkCode");
  const response = await generateCode({ groupId });
  return response.data;
}
