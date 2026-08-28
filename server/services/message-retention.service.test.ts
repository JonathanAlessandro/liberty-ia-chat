import { beforeEach, describe, expect, it, vi } from "vitest";

const repository = vi.hoisted(() => ({ deleteMessagesOlderThan: vi.fn() }));
vi.mock("../repositories/conversation.repository", () => repository);

import { cleanExpiredMessages, MESSAGE_RETENTION_DAYS } from "./message-retention.service";

describe("message retention", () => {
  beforeEach(() => vi.resetAllMocks());

  it("removes messages older than exactly seven days", async () => {
    repository.deleteMessagesOlderThan.mockResolvedValue(4);
    const now = new Date("2026-08-28T12:00:00.000Z");

    await expect(cleanExpiredMessages(now)).resolves.toEqual({
      removed: 4,
      cutoff: new Date("2026-08-21T12:00:00.000Z"),
    });
    expect(MESSAGE_RETENTION_DAYS).toBe(7);
    expect(repository.deleteMessagesOlderThan).toHaveBeenCalledWith(new Date("2026-08-21T12:00:00.000Z"));
  });
});
