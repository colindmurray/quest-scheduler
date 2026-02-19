import { normalizeEmail } from "./utils";

export const ANONYMOUS_VOTER_NAMES = Object.freeze([
  "Anonymous Paladin",
  "Anonymous Rogue",
  "Anonymous Wizard",
  "Anonymous Cleric",
  "Anonymous Ranger",
  "Anonymous Druid",
  "Anonymous Bard",
  "Anonymous Warlock",
  "Anonymous Monk",
  "Anonymous Sorcerer",
  "Anonymous Barbarian",
  "Anonymous Fighter",
  "Anonymous Artificer",
  "Anonymous Alchemist",
  "Anonymous Arcanist",
  "Anonymous Battlemage",
  "Anonymous Beastmaster",
  "Anonymous Bladesinger",
  "Anonymous Cartographer",
  "Anonymous Champion",
  "Anonymous Chronomancer",
  "Anonymous Corsair",
  "Anonymous Diviner",
  "Anonymous Dragoon",
  "Anonymous Duelist",
  "Anonymous Enchanter",
  "Anonymous Explorer",
  "Anonymous Farseer",
  "Anonymous Gladiator",
  "Anonymous Guardian",
  "Anonymous Harbinger",
  "Anonymous Herbalist",
  "Anonymous Illusionist",
  "Anonymous Inquisitor",
  "Anonymous Loremaster",
  "Anonymous Marauder",
  "Anonymous Necromancer",
  "Anonymous Outrider",
  "Anonymous Pathfinder",
  "Anonymous Runekeeper",
  "Anonymous Sentinel",
  "Anonymous Shadowblade",
  "Anonymous Spellblade",
  "Anonymous Stormcaller",
  "Anonymous Tactician",
  "Anonymous Thaumaturge",
  "Anonymous Trickster",
  "Anonymous Warden",
  "Anonymous Wildheart",
  "Anonymous Witch Knight",
]);

function hashString(value) {
  const normalized = String(value || "");
  let hash = 0;
  for (let index = 0; index < normalized.length; index += 1) {
    hash = ((hash << 5) - hash) + normalized.charCodeAt(index);
    hash |= 0; // Convert to 32-bit integer.
  }
  return Math.abs(hash);
}

export function resolveUserIdentityKey(user = {}, fallbackKey = null) {
  const userId = String(user?.id || "").trim();
  if (userId) return `id:${userId}`;

  const email = normalizeEmail(user?.email);
  if (email) return `email:${email}`;

  const publicIdentifier = String(user?.publicIdentifier || "").trim().toLowerCase();
  if (publicIdentifier) return `public:${publicIdentifier}`;

  const displayName = String(user?.displayName || "").trim().toLowerCase();
  if (displayName) return `name:${displayName}`;

  const fallback = String(fallbackKey || "").trim().toLowerCase();
  if (fallback) return `fallback:${fallback}`;
  return null;
}

function buildAnonymousIdentity(displayName, scopeKey, identityKey) {
  const syntheticKey = hashString(`${scopeKey}:${identityKey}:${displayName}`).toString(36);
  return {
    id: `anon-${syntheticKey}`,
    email: `anon:${displayName.toLowerCase()}`,
    displayName,
    publicIdentifier: displayName,
    avatar: null,
    isAnonymous: true,
  };
}

export function buildAnonymousIdentityMap(users = [], { scopeKey = "global" } = {}) {
  const scope = String(scopeKey || "global").trim() || "global";
  const identityKeys = Array.from(
    new Set(
      (Array.isArray(users) ? users : [])
        .map((user, index) => resolveUserIdentityKey(user, `u-${index}`))
        .filter(Boolean)
    )
  ).sort((left, right) => left.localeCompare(right));

  const aliasCountByBase = new Map();
  const usedNameIndexes = new Set();
  const identityMap = new Map();

  identityKeys.forEach((identityKey) => {
    const preferredIndex = hashString(`${scope}:${identityKey}`) % ANONYMOUS_VOTER_NAMES.length;
    let chosenIndex = preferredIndex;
    let attempts = 0;

    while (
      attempts < ANONYMOUS_VOTER_NAMES.length &&
      usedNameIndexes.has(chosenIndex)
    ) {
      attempts += 1;
      chosenIndex = (chosenIndex + 1) % ANONYMOUS_VOTER_NAMES.length;
    }

    if (attempts < ANONYMOUS_VOTER_NAMES.length) {
      usedNameIndexes.add(chosenIndex);
    }

    const baseName = ANONYMOUS_VOTER_NAMES[chosenIndex];
    const nextBaseCount = (aliasCountByBase.get(baseName) || 0) + 1;
    aliasCountByBase.set(baseName, nextBaseCount);
    const displayName = nextBaseCount === 1 ? baseName : `${baseName} ${nextBaseCount}`;

    identityMap.set(
      identityKey,
      buildAnonymousIdentity(displayName, scope, identityKey)
    );
  });

  return identityMap;
}

export function anonymizeUser(user = {}, identityMap, fallbackKey = null) {
  const identityKey = resolveUserIdentityKey(user, fallbackKey);
  if (!identityKey || !(identityMap instanceof Map)) return user;
  const anonymousIdentity = identityMap.get(identityKey);
  if (!anonymousIdentity) return user;

  return {
    ...user,
    ...anonymousIdentity,
    photoURL: null,
    photoUrl: null,
    userAvatar: null,
    avatarUrl: null,
    customAvatarUrl: null,
  };
}

export function anonymizeUsers(users = [], identityMap, { keyPrefix = "user" } = {}) {
  const source = Array.isArray(users) ? users : [];
  return source.map((user, index) =>
    anonymizeUser(user, identityMap, `${keyPrefix}-${index}`)
  );
}
