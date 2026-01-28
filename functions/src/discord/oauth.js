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

function sanitizeReturnTo(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "/dashboard";
  if (!trimmed.startsWith("/")) return "/dashboard";
  if (trimmed.startsWith("//")) return "/dashboard";
  if (trimmed.includes("://")) return "/dashboard";
  return trimmed;
}

function buildAuthorizeUrl({ scope, state }) {
  const redirectUri = getRedirectUri();
  const params = new URLSearchParams({
    client_id: DISCORD_CLIENT_ID.value(),
    response_type: "code",
    scope,
    state,
    redirect_uri: redirectUri,
    prompt: "consent",
  });
  return `https://discord.com/api/oauth2/authorize?${params.toString()}`;
}

function buildDiscordAvatarUrl(userId, avatarHash, size = 256) {
  if (!userId) return null;
  if (!avatarHash) {
    try {
      const index = Number((BigInt(userId) >> 22n) % 6n);
      return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
    } catch (err) {
      return null;
    }
  }
  const isAnimated = String(avatarHash).startsWith("a_");
  const ext = isAnimated ? "gif" : "png";
  return `https://cdn.discordapp.com/avatars/${userId}/${avatarHash}.${ext}?size=${size}`;
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
      intent: "link",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt,
    });

    return {
      authUrl: buildAuthorizeUrl({ scope: "identify", state }),
    };
  }
);

exports.discordOAuthLoginStart = onCall(
  {
    region: DISCORD_REGION,
    secrets: [DISCORD_CLIENT_ID],
  },
  async (request) => {
    const state = crypto.randomBytes(16).toString("hex");
    const expiresAt = admin.firestore.Timestamp.fromDate(new Date(Date.now() + 10 * 60 * 1000));
    const returnTo = sanitizeReturnTo(request.data?.returnTo);

    await admin.firestore().collection("oauthStates").doc(state).set({
      provider: "discord",
      intent: "login",
      returnTo,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt,
    });

    return {
      authUrl: buildAuthorizeUrl({ scope: "identify email", state }),
    };
  }
);

exports.discordOAuthCallback = onRequest(
  {
    region: DISCORD_REGION,
    secrets: [DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET],
  },
  async (req, res) => {
    let intent = "link";
    let stateData = null;
    const stateId = String(req.query.state || "");
    try {
      const code = String(req.query.code || "");
      if (!code || !stateId) {
        res.status(400).send("Missing code or state");
        return;
      }

      const stateRef = admin.firestore().collection("oauthStates").doc(stateId);
      const stateSnap = await stateRef.get();
      if (!stateSnap.exists) {
        res.status(400).send("Invalid state");
        return;
      }

      stateData = stateSnap.data() || {};
      intent = stateData.intent || "link";
      const expiresAt = stateData.expiresAt?.toDate?.();
      if (stateData.provider !== "discord") {
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

      const tokenJson = await tokenResponse.json().catch(() => ({}));
      if (!tokenResponse.ok) {
        const safeToken = { ...tokenJson };
        if (safeToken.access_token) safeToken.access_token = "[redacted]";
        if (safeToken.refresh_token) safeToken.refresh_token = "[redacted]";
        console.error("Discord token exchange failed", {
          status: tokenResponse.status,
          body: safeToken,
        });
        await stateRef.delete();
        if (intent === "login") {
          res.redirect(`${APP_URL}/auth?error=discord_failed`);
        } else {
          res.redirect(`${APP_URL}/settings?discord=failed`);
        }
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
      const userJson = await userResponse.json().catch(() => ({}));
      if (!userResponse.ok || !userJson?.id) {
        console.error("Discord user fetch failed", {
          status: userResponse.status,
          body: userJson,
        });
        await stateRef.delete();
        if (intent === "login") {
          res.redirect(`${APP_URL}/auth?error=discord_failed`);
        } else {
          res.redirect(`${APP_URL}/settings?discord=failed`);
        }
        return;
      }

      const discordUserId = String(userJson.id);
      const discordUsername = userJson.username || null;
      const discordGlobalName = userJson.global_name || null;
      const discordAvatarHash = userJson.avatar || null;
      const discordAvatarUrl = buildDiscordAvatarUrl(discordUserId, discordAvatarHash, 256);
      const discordEmail = userJson.verified === true ? userJson.email || null : null;

      const db = admin.firestore();
      const linkRef = db.collection("discordUserLinks").doc(discordUserId);
      const existingLink = await linkRef.get();

      if (intent === "login") {
        let uid = existingLink.exists ? existingLink.data()?.qsUserId : null;

        if (!uid) {
          if (!discordEmail) {
            await stateRef.delete();
            res.redirect(`${APP_URL}/auth?error=email_required`);
            return;
          }

          try {
            const existingUser = await admin.auth().getUserByEmail(discordEmail);
            uid = existingUser.uid;
          } catch (err) {
            if (err?.code !== "auth/user-not-found") {
              await stateRef.delete();
              res.redirect(`${APP_URL}/auth?error=server_error`);
              return;
            }
          }
        }

        if (!uid) {
          const newUser = await admin.auth().createUser({
            email: discordEmail,
            emailVerified: true,
            displayName: discordGlobalName || discordUsername || undefined,
          });
          uid = newUser.uid;
        } else {
          if (discordEmail) {
            try {
              const authRecord = await admin.auth().getUser(uid);
              const authEmail = String(authRecord.email || "").trim().toLowerCase();
              if (authEmail && authEmail === String(discordEmail).toLowerCase()) {
                await admin.auth().updateUser(uid, { emailVerified: true });
              }
            } catch (err) {
              console.warn("Failed to update emailVerified for Discord login", err);
            }
          }
          const userDoc = await db.collection("users").doc(uid).get();
          const linkedDiscordId = userDoc.data()?.discord?.userId;
          if (linkedDiscordId && linkedDiscordId !== discordUserId) {
            await stateRef.delete();
            res.redirect(`${APP_URL}/auth?error=email_conflict`);
            return;
          }
        }

        if (existingLink.exists && existingLink.data()?.qsUserId !== uid) {
          await stateRef.delete();
          res.redirect(`${APP_URL}/auth?error=discord_in_use`);
          return;
        }

        await linkRef.set({
          qsUserId: uid,
          linkedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        const userRef = db.collection("users").doc(uid);
        const publicRef = db.collection("usersPublic").doc(uid);
        const userSnap = await userRef.get();
        const existingUserData = userSnap.exists ? userSnap.data() : {};
        const displayName = discordGlobalName || discordUsername || null;

        const userUpdates = {
          discord: {
            userId: discordUserId,
            username: discordUsername,
            globalName: discordGlobalName,
            avatarHash: discordAvatarHash,
            linkedAt: admin.firestore.FieldValue.serverTimestamp(),
            linkSource: "oauth",
          },
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };
        if (!existingUserData.email && discordEmail) {
          userUpdates.email = discordEmail;
        }
        if (!existingUserData.displayName && displayName) {
          userUpdates.displayName = displayName;
        }
        if (!existingUserData.publicIdentifierType && discordUsername) {
          userUpdates.publicIdentifierType = "discordUsername";
        }
        if ((existingUserData.avatarSource === "discord" || !existingUserData.photoURL) && discordAvatarUrl) {
          userUpdates.photoURL = discordAvatarUrl;
        }

        const publicUpdates = {
          discordUsername,
          discordUsernameLower: discordUsername ? String(discordUsername).toLowerCase() : null,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };
        if (!existingUserData.email && discordEmail) {
          publicUpdates.email = discordEmail;
        }
        if (!existingUserData.displayName && displayName) {
          publicUpdates.displayName = displayName;
        }
        if (!existingUserData.publicIdentifierType && discordUsername) {
          publicUpdates.publicIdentifierType = "discordUsername";
          publicUpdates.publicIdentifier = discordUsername;
        }
        if ((existingUserData.avatarSource === "discord" || !existingUserData.photoURL) && discordAvatarUrl) {
          publicUpdates.photoURL = discordAvatarUrl;
        }

        await Promise.all([
          userRef.set(userUpdates, { merge: true }),
          publicRef.set(publicUpdates, { merge: true }),
        ]);

        const customToken = await admin.auth().createCustomToken(uid);
        const returnTo = sanitizeReturnTo(stateData.returnTo);
        await stateRef.delete();
        res.redirect(
          `${APP_URL}/auth/discord/finish?token=${encodeURIComponent(
            customToken
          )}&returnTo=${encodeURIComponent(returnTo)}`
        );
        return;
      }

      if (!stateData.uid) {
        await stateRef.delete();
        res.status(400).send("Invalid state");
        return;
      }

      if (existingLink.exists && existingLink.data()?.qsUserId !== stateData.uid) {
        await stateRef.delete();
        res.status(409).send("Discord account already linked to another user");
        return;
      }

      await linkRef.set({
        qsUserId: stateData.uid,
        linkedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      const userRef = db.collection("users").doc(stateData.uid);
      const userSnap = await userRef.get();
      const userData = userSnap.exists ? userSnap.data() : {};
      const shouldSetPhoto =
        userData.avatarSource === "discord" || (!userData.photoURL && discordAvatarUrl);

      await Promise.all([
        userRef.set(
          {
            discord: {
              userId: discordUserId,
              username: discordUsername,
              globalName: discordGlobalName,
              avatarHash: discordAvatarHash,
              linkedAt: admin.firestore.FieldValue.serverTimestamp(),
              linkSource: "oauth",
            },
            ...(shouldSetPhoto ? { photoURL: discordAvatarUrl } : {}),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        ),
        db.collection("usersPublic").doc(stateData.uid).set(
          {
            discordUsername,
            discordUsernameLower: discordUsername ? String(discordUsername).toLowerCase() : null,
            ...(shouldSetPhoto ? { photoURL: discordAvatarUrl } : {}),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        ),
      ]);

      await stateRef.delete();
      res.redirect(`${APP_URL}/settings?discord=linked`);
    } catch (err) {
      console.error("Discord OAuth callback failed", err);
      if (stateId) {
        try {
          await admin.firestore().collection("oauthStates").doc(stateId).delete();
        } catch (cleanupErr) {
          console.warn("Failed to cleanup oauth state after error", cleanupErr);
        }
      }
      if (intent === "login") {
        res.redirect(`${APP_URL}/auth?error=discord_failed`);
      } else {
        res.redirect(`${APP_URL}/settings?discord=failed`);
      }
    }
  }
);
