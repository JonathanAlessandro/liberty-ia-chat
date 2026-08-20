import { describe, expect, it } from "vitest";
import { latestScrollOffset } from "./chat-scroll";

describe("latestScrollOffset", () => {
  it("anchors the viewport at the latest message without negative offsets", () => {
    expect(latestScrollOffset(240, 400)).toBe(0);
    expect(latestScrollOffset(1200, 400)).toBe(800);
  });
});
