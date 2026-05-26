import { encryptSecret, decryptSecret, keyFingerprint } from "./envelope";

async function main() {
  const testKey = "sk-ant-admin-test1234567890abcdef";
  console.log("Testing envelope encryption...\n");

  // Test 1: Encrypt
  console.log("1. Encrypting test secret...");
  const encrypted = await encryptSecret(testKey);
  console.log("   ciphertext length:", encrypted.ciphertext.length, "bytes");
  console.log("   encryptedDek length:", encrypted.encryptedDek.length, "bytes");
  console.log("   iv length:", encrypted.iv.length, "bytes");
  console.log("   authTag length:", encrypted.authTag.length, "bytes");

  // Test 2: Decrypt
  console.log("\n2. Decrypting...");
  const decrypted = await decryptSecret(encrypted);
  console.log("   decrypted matches original:", decrypted === testKey);
  if (decrypted !== testKey) {
    console.error("   FAIL: decrypted value does not match!");
    process.exit(1);
  }

  // Test 3: Encrypted DEK alone reveals nothing
  console.log("\n3. Verifying encrypted DEK alone is useless...");
  const dekString = encrypted.encryptedDek.toString("utf8");
  console.log(
    "   encrypted DEK contains plaintext key:",
    dekString.includes(testKey)
  );
  if (dekString.includes(testKey)) {
    console.error("   FAIL: encrypted DEK leaks the plaintext key!");
    process.exit(1);
  }

  // Test 4: Ciphertext alone reveals nothing
  console.log("\n4. Verifying ciphertext alone is useless...");
  const cipherString = encrypted.ciphertext.toString("utf8");
  console.log(
    "   ciphertext contains plaintext key:",
    cipherString.includes(testKey)
  );
  if (cipherString.includes(testKey)) {
    console.error("   FAIL: ciphertext leaks the plaintext key!");
    process.exit(1);
  }

  // Test 5: Fingerprint
  console.log("\n5. Testing fingerprint...");
  const fp = keyFingerprint(testKey);
  console.log("   fingerprint:", fp);
  console.log("   correct:", fp === "cdef");

  // Test 6: Tampered ciphertext fails
  console.log("\n6. Verifying tampered ciphertext fails...");
  try {
    const tampered = { ...encrypted, ciphertext: Buffer.from("tampered") };
    await decryptSecret(tampered);
    console.error("   FAIL: tampered ciphertext did not throw!");
    process.exit(1);
  } catch {
    console.log("   correctly rejected tampered ciphertext");
  }

  console.log("\nAll tests passed.");
}

main().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
