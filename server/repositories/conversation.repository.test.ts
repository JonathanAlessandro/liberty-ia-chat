import { beforeEach, describe, expect, it, vi } from "vitest";
import { MySqlDialect } from "drizzle-orm/mysql-core";
const state = vi.hoisted(() => ({ rows: [] as unknown[][], filters: [] as unknown[], insert: vi.fn(), remove: vi.fn() }));
vi.mock("../db", () => ({ getDb: async () => ({
  select: () => { const rows = state.rows.shift() ?? []; const chain: any = { from: () => chain, where: (filter: unknown) => { state.filters.push(filter); return chain; }, limit: async () => rows, orderBy: () => { const ordered: any = Promise.resolve(rows); ordered.limit = async () => rows; return ordered; } }; return chain; },
  insert: state.insert,
  delete: state.remove,
}) }));
import { findOrCreateConversation, listConversationMessages, listRecentConversationMessages, listUserConversations, deleteMessagesOlderThan } from "./conversation.repository";
const dialect = new MySqlDialect();
const query = (filter: any) => dialect.sqlToQuery(filter);
describe("permanent account-owned conversations", () => {
  beforeEach(() => { state.rows = []; state.filters = []; vi.clearAllMocks(); });
  it("reopens an owned conversation from another browser", async () => {
    state.rows = [[{ id: 31, ownerUserId: 7, visitorId: "old-browser" }]];
    expect((await findOrCreateConversation(7, "new-browser", 31)).id).toBe(31);
    expect(query(state.filters[0]).params).toEqual([31, 7]);
    expect(state.insert).not.toHaveBeenCalled();
  });
  it("rejects another account's conversation instead of silently creating a chat", async () => {
    state.rows = [[]];
    await expect(findOrCreateConversation(8, "browser", 31)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(query(state.filters[0]).params).toEqual([31, 8]);
    expect(state.insert).not.toHaveBeenCalled();
  });
  it("lists chats by authenticated account and never by browser", async () => {
    state.rows = [[{ id: 31 }]];
    expect(await listUserConversations(7, "different-browser")).toEqual([{ id: 31 }]);
    expect(query(state.filters[0]).params).toEqual([7]);
    expect(query(state.filters[0]).sql).not.toContain("visitorId");
  });
  it("does not read messages from a conversation outside the account", async () => {
    state.rows = [[]];
    expect(await listConversationMessages(31, 8, "browser")).toEqual([]);
    expect(state.filters).toHaveLength(1);
    expect(query(state.filters[0]).params).toEqual([31, 8]);
  });
  it("restores initial context and recent messages without duplicates", async () => {
    state.rows = [[{ id: 31 }], [{ id: 4 }, { id: 3 }, { id: 2 }], [{ id: 1 }, { id: 2 }]];
    expect((await listRecentConversationMessages(31, 7, "browser")).map(message => message.id)).toEqual([1, 2, 3, 4]);
    expect(query(state.filters[0]).params).toEqual([31, 7]);
  });
  it("never deletes old messages automatically", async () => {
    expect(await deleteMessagesOlderThan(new Date("2099-01-01"))).toBe(0);
    expect(state.remove).not.toHaveBeenCalled();
  });
});
