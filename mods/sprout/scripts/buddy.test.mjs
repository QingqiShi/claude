import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash, createPublicKey, verify } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BUDDY = path.join(path.dirname(fileURLToPath(import.meta.url)), "buddy.mjs");
const SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");
const isMac = process.platform === "darwin" && fs.existsSync("/usr/bin/security");

function run(args, stdin) {
  const r = spawnSync(process.execPath, [BUDDY, ...args], { encoding: "utf8", input: stdin });
  return { status: r.status, out: JSON.parse(r.stdout.trim().split("\n").at(-1)) };
}

/** A keychain of its own, so the test never touches the login keychain. */
function withKeychain(body) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "buddy-test-"));
  const keychain = path.join(dir, "test.keychain-db");
  assert.equal(spawnSync("/usr/bin/security", ["create-keychain", "-p", "", keychain]).status, 0);
  try {
    return body(keychain);
  } finally {
    spawnSync("/usr/bin/security", ["delete-keychain", keychain]);
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function publicKeyOf(raw) {
  return createPublicKey({ key: Buffer.concat([SPKI_PREFIX, Buffer.from(raw, "base64")]), format: "der", type: "spki" });
}

test("key replaces a stored value that is not a key", { skip: !isMac }, () => {
  withKeychain((keychain) => {
    const add = ["add-generic-password", "-a", "mac-key", "-s", "sprout-buddy", "-w", "QQ==", keychain];
    assert.equal(spawnSync("/usr/bin/security", add).status, 0);
    const kc = ["--keychain", keychain];
    const made = run(["key", ...kc]);
    assert.equal(made.status, 0);
    assert.equal(Buffer.from(made.out.publicKey, "base64").length, 32);
    assert.deepEqual(run(["key", ...kc]).out, made.out);
  });
});

test("the key is made once in the keychain, and signs what the server checks", { skip: !isMac }, () => {
  withKeychain((keychain) => {
    const kc = ["--keychain", keychain];
    const first = run(["key", ...kc]);
    assert.equal(first.status, 0);
    assert.equal(Buffer.from(first.out.publicKey, "base64").length, 32);
    assert.deepEqual(run(["key", ...kc]).out, first.out);
    const publicKey = publicKeyOf(first.out.publicKey);

    const body = Buffer.from('{"v":1,"at":1700000000000}');
    const signed = run(["sign-upload", "--user", "qingqi", "--machine", "mac-abc", ...kc], body);
    assert.equal(signed.status, 0);
    const uploadMessage = Buffer.from(
      ["buddy-upload-v2", "qingqi", "mac-abc", createHash("sha256").update(body).digest("hex")].join("\n"),
    );
    assert.equal(verify(null, uploadMessage, publicKey, Buffer.from(signed.out.signature, "base64")), true);
    const otherBody = Buffer.from(
      ["buddy-upload-v2", "qingqi", "mac-abc", createHash("sha256").update("{}").digest("hex")].join("\n"),
    );
    assert.equal(verify(null, otherBody, publicKey, Buffer.from(signed.out.signature, "base64")), false);

    const read = run(["sign-read", "--user", "qingqi", "--machine", "mac-abc", "--at", "1700000000000", ...kc]);
    assert.equal(read.status, 0);
    const readMessage = Buffer.from(["buddy-read-v1", "qingqi", "mac-abc", "1700000000000"].join("\n"));
    assert.equal(verify(null, readMessage, publicKey, Buffer.from(read.out.signature, "base64")), true);
  });
});

test("a command the script does not know, or a missing argument, is a usage error", () => {
  assert.equal(run(["dance"]).out.error, "usage");
  assert.equal(run(["sign-upload", "--user", "qingqi"]).out.error, "usage");
});
