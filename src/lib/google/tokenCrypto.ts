import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // GCMで推奨されるIV長

function getKey(): Buffer {
  const base64Key = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY;
  if (!base64Key) {
    throw new Error("環境変数 GOOGLE_TOKEN_ENCRYPTION_KEY が設定されていません");
  }
  const key = Buffer.from(base64Key, "base64");
  if (key.length !== 32) {
    throw new Error(
      "GOOGLE_TOKEN_ENCRYPTION_KEY は256bit鍵（base64エンコードで32バイト）である必要があります",
    );
  }
  return key;
}

// 暗号文は "iv:authTag:ciphertext"（それぞれbase64）をコロン区切りで連結した
// 1つの文字列としてDBカラムに保存する。
export function encryptToken(plainText: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [iv, authTag, encrypted].map((buffer) => buffer.toString("base64")).join(":");
}

export function decryptToken(cipherText: string): string {
  const key = getKey();
  const [ivBase64, authTagBase64, encryptedBase64] = cipherText.split(":");
  if (!ivBase64 || !authTagBase64 || !encryptedBase64) {
    throw new Error("暗号文の形式が不正です");
  }

  const iv = Buffer.from(ivBase64, "base64");
  const authTag = Buffer.from(authTagBase64, "base64");
  const encrypted = Buffer.from(encryptedBase64, "base64");

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);

  return decrypted.toString("utf8");
}
