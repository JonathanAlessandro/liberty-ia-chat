import { expect, it, vi } from "vitest";
const deletion = vi.hoisted(() => vi.fn());
vi.mock("../repositories/conversation.repository", () => ({ deleteMessagesOlderThan: deletion }));
import { cleanExpiredMessages, startMessageRetentionCleanup, MESSAGE_RETENTION_DAYS } from "./message-retention.service";
it("never expires historical chats or schedules destructive cleanup", async () => {
  vi.useFakeTimers();
  startMessageRetentionCleanup();
  await cleanExpiredMessages(new Date("2099-01-01"));
  expect(MESSAGE_RETENTION_DAYS).toBeNull();
  expect(deletion).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
  vi.useRealTimers();
});
