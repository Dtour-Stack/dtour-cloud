import { v } from "convex/values";
import { action, internalMutation, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { getConfig } from "./config_read";
import { logEvent } from "./events";

const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

function generateChallenge(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let base64 = "";
  for (let i = 0; i < bytes.length; i++) {
    base64 += String.fromCharCode(bytes[i]);
  }
  return btoa(base64).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function parseClientDataJSON(base64url: string): Record<string, unknown> {
  let base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4) base64 += "=";
  const raw = atob(base64);
  return JSON.parse(raw);
}

function cosePublicKeyToJwk(base64urlKey: string): JsonWebKey {
  const base64 = base64urlKey.replace(/-/g, "+").replace(/_/g, "/");
  const raw = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));

  let offset = 0;
  if (raw[offset] >= 0xA0 && raw[offset] <= 0xBF) {
    const mapSize = raw[offset] - 0xA0;
    offset++;
    const map: Record<number, Uint8Array | number | bigint> = {};
    for (let i = 0; i < mapSize; i++) {
      const key = readCborInt(raw, offset);
      offset += cborIntSize(raw, offset);
      const value = readCborValue(raw, offset);
      offset += cborValueSize(raw, offset);
      map[Number(key)] = value as number;
    }

    const kty = map[1] as number;
    const alg = map[3] as number;

    if (kty === 2 && alg === -7) {
      // EC2 P-256
      const x = map[-2] as Uint8Array;
      const y = map[-3] as Uint8Array;
      return {
        kty: "EC",
        crv: "P-256",
        x: uint8ArrayToBase64Url(x),
        y: uint8ArrayToBase64Url(y),
        ext: true,
      };
    }
    if (kty === 8 && alg === -8) {
      // Ed25519 / EdDSA
      const x = map[-2] as Uint8Array;
      return {
        kty: "OKP",
        crv: "Ed25519",
        x: uint8ArrayToBase64Url(x),
        ext: true,
      };
    }
    if (kty === 3 && alg === -257) {
      // RS256
      const n = map[-1] as Uint8Array;
      const e = map[-2] as Uint8Array;
      return {
        kty: "RSA",
        n: uint8ArrayToBase64Url(n),
        e: uint8ArrayToBase64Url(e),
        ext: true,
      };
    }
  }
  throw new Error(`Unsupported COSE key`);
}

function readCborInt(buf: Uint8Array, offset: number): number {
  const byte = buf[offset];
  if (byte <= 0x17) return byte;
  if (byte === 0x18) return buf[offset + 1];
  if (byte === 0x19) return (buf[offset + 1] << 8) | buf[offset + 2];
  if (byte === 0x1A) {
    return Number(
      (BigInt(buf[offset + 1]) << 24n) |
      (BigInt(buf[offset + 2]) << 16n) |
      (BigInt(buf[offset + 3]) << 8n) |
      BigInt(buf[offset + 4]),
    );
  }
  return Number(byte);
}

function cborIntSize(buf: Uint8Array, offset: number): number {
  const byte = buf[offset];
  if (byte <= 0x17) return 1;
  if (byte === 0x18) return 2;
  if (byte === 0x19) return 3;
  if (byte === 0x1A) return 5;
  return 1;
}

function readCborValue(buf: Uint8Array, offset: number): Uint8Array | number {
  const byte = buf[offset];
  if (byte <= 0x17 || (byte >= 0x20 && byte <= 0x37)) {
    return readCborInt(buf, offset);
  }
  if (byte >= 0x40 && byte <= 0x5B) {
    const len = Number(readCborInt(buf, offset));
    const start = offset + cborIntSize(buf, offset);
    return buf.slice(start, start + len);
  }
  if (byte >= 0x60 && byte <= 0x7B) {
    return readCborInt(buf, offset);
  }
  return readCborInt(buf, offset);
}

function cborValueSize(buf: Uint8Array, offset: number): number {
  const byte = buf[offset];
  const intSize = cborIntSize(buf, offset);
  if (byte <= 0x17 || (byte >= 0x20 && byte <= 0x37)) return intSize;
  if (byte >= 0x40 && byte <= 0x5B) {
    const len = Number(readCborInt(buf, offset));
    return intSize + len;
  }
  return intSize;
}

function uint8ArrayToBase64Url(arr: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < arr.length; i++) {
    binary += String.fromCharCode(arr[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToUint8Array(str: string): Uint8Array {
  let base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4) base64 += "=";
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

// ── Config query (accessible from actions via ctx.runQuery) ─────────────────

export const readRpConfig = query({
  args: {},
  handler: async (ctx) => {
    return {
      rpID: await getConfig(ctx, "rp_id", "localhost"),
      rpOrigin: await getConfig(ctx, "rp_origin", "http://localhost:5174"),
    };
  },
});

// ── Registration ────────────────────────────────────────────────────────────

/** Generate WebAuthn registration options. */
export const generateRegistrationOptions = mutation({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    const rpID = await getConfig(ctx, "rp_id", "localhost");
    const challenge = generateChallenge();

    await ctx.db.insert("passkeyChallenges", {
      challenge,
      type: "registration",
      expiresAt: Date.now() + CHALLENGE_TTL_MS,
      used: false,
    });

    return {
      challenge,
      rp: { name: "Detour Cloud", id: rpID },
      user: {
        id: btoa(email).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""),
        name: email,
        displayName: email,
      },
      pubKeyCredParams: [
        { type: "public-key", alg: -7 },
        { type: "public-key", alg: -257 },
        { type: "public-key", alg: -8 },
      ],
      timeout: 60_000,
      authenticatorSelection: {
        residentKey: "preferred",
        userVerification: "preferred",
      },
      attestation: "none",
    };
  },
});

/** Complete WebAuthn registration — verify credential, create user + session. */
export const registerCredential = action({
  args: {
    credentialId: v.string(),
    clientDataJSON: v.string(),
    attestationObject: v.string(),
    transports: v.optional(v.array(v.string())),
    email: v.string(),
    challenge: v.string(),
  },
  handler: async (ctx, args) => {
    const { rpID, rpOrigin } = await ctx.runQuery(internal.authPasskey.readRpConfig);

    // Verify the challenge
    const chalRow = await ctx.runQuery(internal.authPasskey.getChallenge, {
      challenge: args.challenge,
    });
    if (!chalRow || chalRow.type !== "registration" || chalRow.used) {
      throw new Error("Invalid or expired challenge");
    }
    await ctx.runMutation(internal.authPasskey.consumeChallenge, {
      challenge: args.challenge,
    });

    // Verify clientDataJSON
    const clientData = parseClientDataJSON(args.clientDataJSON);
    if (clientData.type !== "webauthn.create") {
      throw new Error("Invalid clientData type");
    }
    if (clientData.challenge !== args.challenge) {
      throw new Error("Challenge mismatch");
    }
    if (clientData.origin !== rpOrigin) {
      throw new Error("Origin mismatch");
    }

    // Parse attestation object
    const attObj = base64UrlToUint8Array(args.attestationObject);
    let pos = 0;
    const fmtLen = attObj[pos] - 0x60;
    pos += 1 + fmtLen;
    if (attObj[pos] >= 0xA0 && attObj[pos] <= 0xBF) {
      const mapSize = attObj[pos] - 0xA0;
      pos += 1;
      for (let i = 0; i < mapSize; i++) {
        pos += cborIntSize(attObj, pos);
        pos += cborValueSize(attObj, pos);
      }
    }

    const authData = attObj.slice(pos);
    const flags = authData[32];
    const signCount = new DataView(authData.buffer, authData.byteOffset + 33, 4).getUint32(0, false);
    const hasAttestedData = (flags & 0x40) !== 0;

    let credOffset = 37;
    let credentialIdBytes: Uint8Array | null = null;
    let publicKeyBytes: Uint8Array | null = null;

    if (hasAttestedData) {
      credOffset += 16; // skip AAGUID
      const credIdLen = new DataView(authData.buffer, authData.byteOffset + credOffset, 2).getUint16(0, false);
      credOffset += 2;
      credentialIdBytes = authData.slice(credOffset, credOffset + credIdLen);
      credOffset += credIdLen;
      publicKeyBytes = authData.slice(credOffset);
    }

    if (!credentialIdBytes || !publicKeyBytes) {
      throw new Error("Missing credential data in authData");
    }

    const credentialId = uint8ArrayToBase64Url(credentialIdBytes);
    const publicKeyB64 = uint8ArrayToBase64Url(publicKeyBytes);

    // Create user + profile
    const userId = crypto.randomUUID();
    await ctx.runMutation(internal.authPasskey.createUserRecord, {
      userId,
      email: args.email,
    });

    // Store credential
    await ctx.runMutation(internal.authPasskey.storeCredential, {
      userId,
      credentialId,
      publicKey: publicKeyB64,
      counter: signCount,
      transports: args.transports ?? [],
    });

    // Issue session
    const token = crypto.randomUUID();
    await ctx.runMutation(internal.authPasskey.createSession, {
      pubkey: userId,
      token,
    });

    await ctx.runMutation(internal.authPasskey.logEventMtn, {
      pubkey: userId,
      type: "passkey_register",
      data: JSON.stringify({ email: args.email }),
    });

    return { token, userId };
  },
});

// ── Authentication ──────────────────────────────────────────────────────────

/** Generate WebAuthn authentication options. */
export const generateLoginOptions = mutation({
  args: {},
  handler: async (ctx) => {
    const rpID = await getConfig(ctx, "rp_id", "localhost");
    const challenge = generateChallenge();

    await ctx.db.insert("passkeyChallenges", {
      challenge,
      type: "authentication",
      expiresAt: Date.now() + CHALLENGE_TTL_MS,
      used: false,
    });

    return {
      challenge,
      rpId: rpID,
      timeout: 60_000,
      userVerification: "preferred",
    };
  },
});

/** Complete WebAuthn login — verify assertion, issue session. */
export const login = action({
  args: {
    credentialId: v.string(),
    clientDataJSON: v.string(),
    authenticatorData: v.string(),
    signature: v.string(),
    userHandle: v.optional(v.string()),
    challenge: v.string(),
  },
  handler: async (ctx, args) => {
    const { rpID, rpOrigin } = await ctx.runQuery(internal.authPasskey.readRpConfig);

    // Verify challenge
    const chalRow = await ctx.runQuery(internal.authPasskey.getChallenge, {
      challenge: args.challenge,
    });
    if (!chalRow || chalRow.type !== "authentication" || chalRow.used) {
      throw new Error("Invalid or expired challenge");
    }
    await ctx.runMutation(internal.authPasskey.consumeChallenge, {
      challenge: args.challenge,
    });

    // Verify clientDataJSON
    const clientData = parseClientDataJSON(args.clientDataJSON);
    if (clientData.type !== "webauthn.get") {
      throw new Error("Invalid clientData type");
    }
    if (clientData.challenge !== args.challenge) {
      throw new Error("Challenge mismatch");
    }
    if (clientData.origin !== rpOrigin) {
      throw new Error("Origin mismatch");
    }

    // Find stored credential
    const cred = await ctx.runQuery(internal.authPasskey.getCredential, {
      credentialId: args.credentialId,
    });
    if (!cred) throw new Error("Credential not found");

    // Verify signature
    const authDataBytes = base64UrlToUint8Array(args.authenticatorData);
    const clientDataBytes = base64UrlToUint8Array(args.clientDataJSON);
    const sigBytes = base64UrlToUint8Array(args.signature);

    const clientDataHash = await crypto.subtle.digest("SHA-256", clientDataBytes);
    const signedPayload = new Uint8Array(authDataBytes.length + clientDataHash.byteLength);
    signedPayload.set(authDataBytes);
    signedPayload.set(new Uint8Array(clientDataHash), authDataBytes.length);

    const publicKeyJwk = cosePublicKeyToJwk(cred.publicKey);

    let algorithm: string;
    if (publicKeyJwk.kty === "EC") algorithm = "ECDSA";
    else if (publicKeyJwk.kty === "OKP") algorithm = "Ed25519";
    else if (publicKeyJwk.kty === "RSA") algorithm = "RSASSA-PKCS1-v1_5";
    else throw new Error("Unsupported key type");

    const publicKey = await crypto.subtle.importKey(
      "jwk",
      publicKeyJwk,
      { name: algorithm } as unknown as AlgorithmIdentifier,
      false,
      ["verify"],
    );

    const verifyAlg: AlgorithmIdentifier =
      algorithm === "ECDSA"
        ? { name: "ECDSA", hash: "SHA-256" }
        : algorithm === "Ed25519"
          ? { name: "Ed25519" }
          : { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" };

    const valid = await crypto.subtle.verify(verifyAlg, publicKey, sigBytes, signedPayload);
    if (!valid) throw new Error("Signature verification failed");

    // Update counter
    const signCount = new DataView(authDataBytes.buffer, authDataBytes.byteOffset + 33, 4).getUint32(0, false);
    await ctx.runMutation(internal.authPasskey.updateCredentialCounter, {
      credentialId: args.credentialId,
      counter: signCount,
    });

    // Issue session
    const token = crypto.randomUUID();
    await ctx.runMutation(internal.authPasskey.createSession, {
      pubkey: cred.userId,
      token,
    });

    // Check for profile
    const profile = await ctx.runQuery(internal.authPasskey.hasProfile, {
      userId: cred.userId,
    });

    return { token, userId: cred.userId, hasProfile: profile !== null };
  },
});

// ── Internal helpers ─────────────────────────────────────────────────────────

export const getChallenge = query({
  args: { challenge: v.string() },
  handler: async (ctx, { challenge }) => {
    const row = await ctx.db
      .query("passkeyChallenges")
      .withIndex("by_challenge", (q) => q.eq("challenge", challenge))
      .unique();
    if (!row || row.expiresAt < Date.now()) return null;
    return row;
  },
});

export const consumeChallenge = internalMutation({
  args: { challenge: v.string() },
  handler: async (ctx, { challenge }) => {
    const row = await ctx.db
      .query("passkeyChallenges")
      .withIndex("by_challenge", (q) => q.eq("challenge", challenge))
      .unique();
    if (row) await ctx.db.patch(row._id, { used: true });
  },
});

export const createUserRecord = internalMutation({
  args: { userId: v.string(), email: v.string() },
  handler: async (ctx, { userId, email }) => {
    const now = Date.now();
    await ctx.db.insert("users", {
      pubkey: userId,
      balance: 0,
      lastLoginAt: now,
    });
    await ctx.db.insert("profiles", {
      pubkey: userId,
      username: email.split("@")[0],
      email,
    });
  },
});

export const storeCredential = internalMutation({
  args: {
    userId: v.string(),
    credentialId: v.string(),
    publicKey: v.string(),
    counter: v.number(),
    transports: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("passkeyCredentials", {
      userId: args.userId,
      credentialId: args.credentialId,
      publicKey: args.publicKey,
      counter: args.counter,
      transports: args.transports,
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
    });
  },
});

export const createSession = internalMutation({
  args: { pubkey: v.string(), token: v.string() },
  handler: async (ctx, { pubkey, token }) => {
    await ctx.db.insert("sessions", {
      token,
      pubkey,
      expiresAt: Date.now() + SESSION_TTL_MS,
    });
  },
});

export const logEventMtn = internalMutation({
  args: { pubkey: v.string(), type: v.string(), data: v.optional(v.string()) },
  handler: async (ctx, { pubkey, type, data }) => {
    await logEvent(ctx, type, { pubkey, data });
  },
});

export const getCredential = query({
  args: { credentialId: v.string() },
  handler: async (ctx, { credentialId }) => {
    const row = await ctx.db
      .query("passkeyCredentials")
      .withIndex("by_credential_id", (q) => q.eq("credentialId", credentialId))
      .unique();
    if (!row) return null;
    return {
      userId: row.userId,
      credentialId: row.credentialId,
      publicKey: row.publicKey,
      counter: row.counter,
    };
  },
});

export const updateCredentialCounter = internalMutation({
  args: { credentialId: v.string(), counter: v.number() },
  handler: async (ctx, { credentialId, counter }) => {
    const row = await ctx.db
      .query("passkeyCredentials")
      .withIndex("by_credential_id", (q) => q.eq("credentialId", credentialId))
      .unique();
    if (row) {
      await ctx.db.patch(row._id, { counter, lastUsedAt: Date.now() });
    }
  },
});

export const hasProfile = query({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_pubkey", (q) => q.eq("pubkey", userId))
      .unique();
    return profile;
  },
});
