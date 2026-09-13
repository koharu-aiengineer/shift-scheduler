import { randomBytes } from "crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { decryptToken, encryptToken } from "../tokenCrypto";

describe("tokenCrypto", () => {
  beforeEach(() => {
    // テスト専用のダミー鍵。本番のGOOGLE_TOKEN_ENCRYPTION_KEYとは無関係。
    process.env.GOOGLE_TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  });

  it("暗号化したものを復号すると元の文字列に戻る", () => {
    const original = "1//0test-refresh-token-value";

    const encrypted = encryptToken(original);
    const decrypted = decryptToken(encrypted);

    expect(decrypted).toBe(original);
  });

  it("同じ平文でも呼ぶたびに異なる暗号文になる（IVがランダムなため）", () => {
    const original = "same-plain-text";

    const encryptedA = encryptToken(original);
    const encryptedB = encryptToken(original);

    expect(encryptedA).not.toBe(encryptedB);
    expect(decryptToken(encryptedA)).toBe(original);
    expect(decryptToken(encryptedB)).toBe(original);
  });

  it("鍵未設定なら暗号化・復号ともにエラーになる", () => {
    delete process.env.GOOGLE_TOKEN_ENCRYPTION_KEY;

    expect(() => encryptToken("x")).toThrow();
  });

  it("鍵の長さが不正（256bitでない）ならエラーになる", () => {
    process.env.GOOGLE_TOKEN_ENCRYPTION_KEY = Buffer.from("too-short").toString("base64");

    expect(() => encryptToken("x")).toThrow();
  });

  it("改ざんされた暗号文は認証タグの検証で復号エラーになる", () => {
    const encrypted = encryptToken("secret-value");
    const [iv, authTag, cipherText] = encrypted.split(":");
    const tamperedCipherText = Buffer.from(cipherText, "base64");
    tamperedCipherText[0] ^= 0xff; // 1バイト反転して改ざんする
    const tampered = [iv, authTag, tamperedCipherText.toString("base64")].join(":");

    expect(() => decryptToken(tampered)).toThrow();
  });

  it("形式が不正な暗号文はエラーになる", () => {
    expect(() => decryptToken("not-a-valid-format")).toThrow();
  });
});
