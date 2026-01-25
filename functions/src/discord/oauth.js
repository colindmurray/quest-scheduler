const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const crypto = require("crypto");
const { DISCORD_REGION, DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, APP_URL } = require("./config");

if (!admin.apps.length) {
  admin.initializeApp();
}

function getRedirectUri() {
  if (process.env.DISCORD_OAUTH_REDIRECT_URI) {
    return process.env.DISCORD_OAUTH_REDIRECT_URI;
  }
  const project = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || "";
  return `https://${DISCORD_REGION}-${project}.cloudfunctions.net/discordOAuthCallback`;
}

exports.discordOAuthStart = onCall(
  {
    region: DISCORD_REGION,
    secrets: [DISCORD_CLIENT_ID],
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Login required");
    }

    const state = crypto.randomBytes(16).toString("hex");
    const expiresAt = admin.firestore.Timestamp.fromDate(new Date(Date.now() + 10 * 60 * 1000));
    await admin.firestore().collection("oauthStates").doc(state).set({
      uid: request.auth.uid,
      provider: "discord",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt,
    });

    const redirectUri = getRedirectUri();
    const params = new URLSearchParams({
      client_id: DISCORD_CLIENT_ID.value(),
      response_type: "code",
      scope: "identify",
      state,
      redirect_uri: redirectUri,
    });

    return {
      authUrl: `https://discord.com/api/oauth2/authorize?${params.toString()}`,
    };
  }
);

exports.discordOAuthCallback = onRequest(
  {
    region: DISCORD_REGION,
    secrets: [DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET],
  },
  async (req, res) => {
    try {
      const code = String(req.query.code || "");
      const state = String(req.query.state || "");
      if (!code || !state) {
        res.status(400).send("Missing code or state");
        return;
      }

      const stateRef = admin.firestore().collection("oauthStates").doc(state);
      const stateSnap = await stateRef.get();
      if (!stateSnap.exists) {
        res.status(400).send("Invalid state");
        return;
      }

      const stateData = stateSnap.data() || {};
      const expiresAt = stateData.expiresAt?.toDate?.();
      if (stateData.provider !== "discord" || !stateData.uid) {
        await stateRef.delete();
        res.status(400).send("Invalid state");
        return;
      }
      if (expiresAt && expiresAt.getTime() < Date.now()) {
        await stateRef.delete();
        res.status(400).send("State expired. Please retry.");
        return;
      }

      const redirectUri = getRedirectUri();
      const tokenParams = new URLSearchParams({
        client_id: DISCORD_CLIENT_ID.value(),
        client_secret: DISCORD_CLIENT_SECRET.value(),
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
      });

      const tokenResponse = await fetch("https://discord.com/api/oauth2/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: tokenParams.toString(),
      });

      const tokenJson = await tokenResponse.json();
      if (!tokenResponse.ok) {
        await stateRef.delete();
        res.status(400).send("Discord token exchange failed");
        return;
      }

      const accessToken = tokenJson.access_token;
      if (!accessToken) {
        await stateRef.delete();
        res.status(400).send("Missing access token");
        return;
      }

      const userResponse = await fetch("https://discord.com/api/users/@me", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      const userJson = await userResponse.json();
      if (!userResponse.ok || !userJson?.id) {
        await stateRef.delete();
        res.status(400).send("Failed to fetch Discord user");
        return;
      }

      const discordUserId = String(userJson.id);
      const linkRef = admin.firestore().collection("discordUserLinks").doc(discordUserId);
      const existingLink = await linkRef.get();
      if (existingLink.exists && existingLink.data()?.qsUserId !== stateData.uid) {
        await stateRef.delete();
        res.status(409).send("Discord account already linked to another user");
        return;
      }

      await linkRef.set({
        qsUserId: stateData.uid,
        linkedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      await admin.firestore().collection("users").doc(stateData.uid).set(
        {
          discord: {
            userId: discordUserId,
            username: userJson.username || null,
            globalName: userJson.global_name || null,
            linkedAt: admin.firestore.FieldValue.serverTimestamp(),
            linkSource: "oauth",
          },
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      await stateRef.delete();
      res.redirect(`${APP_URL}/settings?discord=linked`);
    } catch (err) {
      res.status(500).send("Discord OAuth failed");
    }
  }
);
