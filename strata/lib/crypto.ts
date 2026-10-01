import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/** 사용자 API 키를 서버 비밀값으로 암호화해 DB에 저장한다 (AES-256-GCM) */
function key(): Buffer {
  const secret = process.env.API_KEY_ENCRYPTION_SECRET;
  if (!secret || secret.length < 32) throw new Error("API_KEY_ENCRYPTION_SECRET이 설정되지 않았거나 너무 짧습니다 (32자 이상)");
  return createHash("sha256").update(secret).digest();
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), enc]).toString("base64");
}

export function decryptSecret(stored: string): string {
  const buf = Buffer.from(stored, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key(), buf.subarray(0, 12));
  decipher.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString("utf8");
}

export const last4 = (s: string) => s.trim().slice(-4);
