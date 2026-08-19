import { describe, expect, it } from "vitest";
import { hashLocalPassword, verifyLocalPassword } from "./local-user-auth.service";

describe("local user password hashing", () => {
  it("hashes passwords with a unique salt and verifies only the matching password", () => {
    const firstHash = hashLocalPassword("SenhaTemporaria#2026");
    const secondHash = hashLocalPassword("SenhaTemporaria#2026");

    expect(firstHash).not.toBe(secondHash);
    expect(verifyLocalPassword("SenhaTemporaria#2026", firstHash)).toBe(true);
    expect(verifyLocalPassword("senha-incorreta", firstHash)).toBe(false);
  });
});
