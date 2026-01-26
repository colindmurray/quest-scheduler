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

export async function unlinkDiscordAccount() {
  const functions = getFunctions();
  const unlinkAccount = httpsCallable(functions, "discordUnlink");
  const response = await unlinkAccount();
  return response.data;
}

export async function fetchDiscordGuildRoles(groupId) {
  const functions = getFunctions();
  const listRoles = httpsCallable(functions, "discordListGuildRoles");
  const response = await listRoles({ groupId });
  return response.data;
}
