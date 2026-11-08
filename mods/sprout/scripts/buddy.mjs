#!/usr/bin/env node
// This Mac's Buddy key, and the signatures it makes. The private key lives in
// the macOS Keychain and never leaves this process: the mod asks for the
// public key and for signatures, and does the network itself.
//
//   buddy.mjs key                                   -> { publicKey }
//   buddy.mjs sign-upload --user U --machine M      -> { signature }   (body on stdin)
//   buddy.mjs sign-read --user U --machine M --at T -> { signature }
//
// `--keychain <path>` points every command at another keychain, for tests.
import { createHash, createPrivateKey, createPublicKey, randomBytes, sign } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";

const SECURITY = "/usr/bin/security";
const SERVICE = "sprout-buddy";
const ACCOUNT = "mac-key";
const LABEL = "sprout (小苗): Buddy sync key";
const NOT_FOUND = 44;
// The DER headers of an Ed25519 PKCS #8 private key and SubjectPublicKeyInfo, before the 32 key bytes.
const PKCS8_PREFIX = Buffer.from("302e020100300506032b657004220420", "hex");
const SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

export const UPLOAD_PREFIX = "buddy-upload-v2";
export const READ_PREFIX = "buddy-read-v1";

function parseArgs(argv) {
  const out = { command: argv[2] ?? "" };
  for (let i = 3; i < argv.length; i += 2) out[argv[i].replace(/^--/, "")] = argv[i + 1];
  return out;
}

class BuddyError extends Error {
  constructor(code, detail) {
    super(detail ?? code);
    this.code = code;
  }
}

function security(args, keychain) {
  if (!fs.existsSync(SECURITY)) throw new BuddyError("no-keychain");
  const r = spawnSync(SECURITY, keychain ? [...args, keychain] : args, { encoding: "utf8" });
  if (r.error) throw new BuddyError("keychain", r.error.message);
  return r;
}

function readSeed(keychain) {
  const r = security(["find-generic-password", "-a", ACCOUNT, "-s", SERVICE, "-w"], keychain);
  if (r.status === NOT_FOUND) return null;
  if (r.status !== 0) throw new BuddyError("keychain", r.stderr.trim());
  const seed = Buffer.from(r.stdout.trim(), "base64");
  if (seed.length !== 32) throw new BuddyError("bad-key", "the stored key is not an Ed25519 seed");
  return seed;
}

// Send the key to `security -i` on stdin. A key in the arguments shows in the process list and in exec logs.
// `security -i` exits 0 also when the command fails, so read the key back to make sure that it is stored.
function writeSeed(seed, keychain) {
  if (!fs.existsSync(SECURITY)) throw new BuddyError("no-keychain");
  if (keychain?.includes('"')) throw new BuddyError("usage", "--keychain cannot contain a quote");
  const target = keychain ? ` "${keychain}"` : "";
  const command = `add-generic-password -a ${ACCOUNT} -s ${SERVICE} -l "${LABEL}" -w ${seed.toString("base64")} -U${target}\n`;
  const r = spawnSync(SECURITY, ["-i"], { input: command, encoding: "utf8" });
  if (r.error) throw new BuddyError("keychain", r.error.message);
  const stored = readSeed(keychain);
  if (stored === null || !stored.equals(seed)) throw new BuddyError("keychain", r.stderr.trim() || "the key was not stored");
}

function privateKeyOf(seed) {
  return createPrivateKey({ key: Buffer.concat([PKCS8_PREFIX, seed]), format: "der", type: "pkcs8" });
}

export function rawPublicKeyOf(seed) {
  const spki = createPublicKey(privateKeyOf(seed)).export({ format: "der", type: "spki" });
  return spki.subarray(SPKI_PREFIX.length).toString("base64");
}

/** The bytes the server checks an upload's signature over: the user, the machine and the body's SHA-256. */
export function uploadMessage(user, machine, body) {
  const bodyHash = createHash("sha256").update(body).digest("hex");
  return Buffer.from([UPLOAD_PREFIX, user, machine, bodyHash].join("\n"));
}

/** The bytes the server checks a read's signature over: the user, the machine and the time. */
export function readMessage(user, machine, at) {
  return Buffer.from([READ_PREFIX, user, machine, String(at)].join("\n"));
}

// A bad stored value cannot belong to a connected Mac, because the server refuses a key that is not 32 bytes. Thus `key` can replace it.
function readSeedOrNullIfBad(keychain) {
  try {
    return readSeed(keychain);
  } catch (error) {
    if (error instanceof BuddyError && error.code === "bad-key") return null;
    throw error;
  }
}

function requireSeed(keychain) {
  const seed = readSeed(keychain);
  if (seed === null) throw new BuddyError("no-key");
  return seed;
}

function requireArg(args, name) {
  const value = args[name];
  if (typeof value !== "string" || value === "") throw new BuddyError("usage", `--${name} is required`);
  return value;
}

function run(args) {
  const keychain = args.keychain;
  switch (args.command) {
    case "key": {
      let seed = readSeedOrNullIfBad(keychain);
      if (seed === null) {
        writeSeed(randomBytes(32), keychain);
        seed = requireSeed(keychain);
      }
      return { publicKey: rawPublicKeyOf(seed) };
    }
    case "sign-upload": {
      const user = requireArg(args, "user");
      const machine = requireArg(args, "machine");
      const body = fs.readFileSync(0);
      const signature = sign(null, uploadMessage(user, machine, body), privateKeyOf(requireSeed(keychain)));
      return { signature: signature.toString("base64") };
    }
    case "sign-read": {
      const user = requireArg(args, "user");
      const machine = requireArg(args, "machine");
      const at = Number(requireArg(args, "at"));
      if (!Number.isInteger(at) || at < 0) throw new BuddyError("usage", "--at is a time in milliseconds");
      const signature = sign(null, readMessage(user, machine, at), privateKeyOf(requireSeed(keychain)));
      return { signature: signature.toString("base64") };
    }
    default:
      throw new BuddyError("usage", "commands: key, sign-upload, sign-read");
  }
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  try {
    process.stdout.write(`${JSON.stringify(run(parseArgs(process.argv)))}\n`);
  } catch (error) {
    const code = error instanceof BuddyError ? error.code : "error";
    process.stdout.write(`${JSON.stringify({ error: code, detail: String(error.message ?? error) })}\n`);
    process.exitCode = 1;
  }
}
