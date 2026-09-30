// VNC "VncAuth" (security type 2) challenge/response.
//
// The server sends a 16-byte challenge; the client answers with the challenge
// encrypted by DES-ECB using the password as the key. VNC's convention is
// that every key byte is bit-reversed before being fed to standard DES. Node's
// OpenSSL build no longer ships single DES, but 3DES with K1 = K2 = K3 is
// exactly single DES, so `des-ede3-ecb` with the key repeated three times does
// the job without any hand-rolled cipher.
import crypto from "node:crypto";

function reverseBits(byte) {
  let out = 0;
  for (let i = 0; i < 8; i += 1) {
    out = (out << 1) | ((byte >> i) & 1);
  }
  return out & 0xff;
}

export function vncDesKey(password) {
  const raw = Buffer.alloc(8, 0);
  Buffer.from(String(password ?? ""), "latin1").copy(raw, 0, 0, 8);
  const key = Buffer.alloc(8);
  for (let i = 0; i < 8; i += 1) {
    key[i] = reverseBits(raw[i]);
  }
  return key;
}

export function vncAuthResponse(password, challenge) {
  if (!Buffer.isBuffer(challenge) || challenge.length !== 16) {
    throw new TypeError("VncAuth challenge must be 16 bytes");
  }
  const key8 = vncDesKey(password);
  const cipher = crypto.createCipheriv("des-ede3-ecb", Buffer.concat([key8, key8, key8]), null);
  cipher.setAutoPadding(false);
  return Buffer.concat([cipher.update(challenge), cipher.final()]);
}
