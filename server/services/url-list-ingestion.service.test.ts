import { describe, expect, it } from "vitest";
import { assertPublicHttpUrl, parseUrlList } from "./url-list-ingestion.service";

describe("url list ingestion", () => {
  it("accepts unique public HTTP URLs and ignores comments", () => {
    expect(parseUrlList("# Fontes\nhttps://example.com/a\nhttps://example.com/a\nhttps://www.gov.br/saude")).toEqual([
      "https://example.com/a",
      "https://www.gov.br/saude",
    ]);
  });

  it("blocks internal, credentialed and non-HTTP destinations", () => {
    expect(() => assertPublicHttpUrl("http://127.0.0.1:3000/private")).toThrow(/não permitida/);
    expect(() => assertPublicHttpUrl("http://user:password@example.com")).toThrow(/não permitida/);
    expect(() => assertPublicHttpUrl("file:///etc/passwd")).toThrow(/não permitida/);
  });

  it("rejects URLs that cannot fit safely in the persisted source field", () => {
    expect(() => parseUrlList(`https://example.com/${"a".repeat(500)}`)).toThrow(/excede o tamanho/);
  });
});
