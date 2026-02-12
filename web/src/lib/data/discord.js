import { getFunctions, httpsCallable } from "firebase/functions";

export async function startDiscordOAuth() {
  const functions = getFunctions();
  const startAuth = httpsCallable(functions, "discordOAuthStart");
  const response = await startAuth();
  return response.data?.authUrl || null;
}

export async function startDiscordLogin(returnTo = "/dashboard") {
  const functions = getFunctions();
  const startAuth = httpsCallable(functions, "discordOAuthLoginStart");
  const response = await startAuth({ returnTo });
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

export async function repostDiscordPollCard(schedulerId) {
  const functions = getFunctions();
  const repost = httpsCallable(functions, "discordRepostPollCard");
  const response = await repost({ schedulerId });
  return response.data;
}

export async function nudgeDiscordSessionPoll(schedulerId) {
  const functions = getFunctions();
  const nudge = httpsCallable(functions, "nudgeDiscordParticipants");
  const response = await nudge({ schedulerId });
  return response.data;
}

export async function nudgeDiscordBasicPoll(groupId, pollId) {
  const functions = getFunctions();
  const nudge = httpsCallable(functions, "nudgeDiscordBasicPollParticipants");
  const response = await nudge({ groupId, pollId });
  return response.data;
}
