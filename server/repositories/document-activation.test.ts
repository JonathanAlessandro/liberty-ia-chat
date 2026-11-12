import { beforeEach, describe, expect, it, vi } from "vitest";
import { MySqlDialect } from "drizzle-orm/mysql-core";
const state = vi.hoisted(() => ({ conditions: [] as any[], updates: [] as any[], failInsert: false, committed: [] as any[] }));
vi.mock("../db", () => ({ getDb: async () => {
  const chain: any = { from: () => chain, innerJoin: () => chain, where: (condition: any) => { state.conditions.push(condition); return chain; }, orderBy: () => chain, limit: async () => [], then: (resolve: any) => Promise.resolve([]).then(resolve) };
  return {
    select: () => chain,
    transaction: async (run: any) => {
      const pending: any[] = [];
      const result = await run({
        update: () => ({ set: (values: any) => ({ where: async () => { pending.push(values); } }) }),
        delete: () => ({ where: async () => {} }),
        insert: () => ({ values: async () => { if (state.failInsert) throw new Error("insert failed"); } }),
      });
      state.committed.push(...pending); return result;
    },
  };
} }));
import { completeDocumentIndexing, listChatDocumentCatalog, listReadyDocumentChunks, listReadyPageChunks, listReadyRegisteredWebDocuments, searchReadyChunksWithDocuments } from "./document.repository";
beforeEach(() => { state.conditions = []; state.committed = []; state.failInsert = false; });
describe("bases ativas no índice", () => {
  it("filters inactive sources in every retrieval path including numeric fallback and web", async () => {
    await listChatDocumentCatalog(); await listReadyDocumentChunks(1); await listReadyPageChunks([{ documentId: 1, pageStart: 1 }]);
    await listReadyRegisteredWebDocuments(); await searchReadyChunksWithDocuments(["carencia"]); await searchReadyChunksWithDocuments(["12"]);
    expect(state.conditions).toHaveLength(6);
    const dialect = new MySqlDialect();
    for (const condition of state.conditions) {
      const query = dialect.sqlToQuery(condition);
      expect(query.sql).toContain("`documents`.`isActive` = ?");
      expect(query.params).toContain(1);
    }
  });
  it("commits retirement and new chunks together", async () => {
    await completeDocumentIndexing(9, 1, [{ ordinal: 0, content: "New source", pageStart: 1, pageEnd: 1 }], [2]);
    expect(state.committed).toEqual([expect.objectContaining({ isActive: 0 }), expect.objectContaining({ status: "ready" })]);
  });
  it("does not retire old sources when chunk insertion fails", async () => {
    state.failInsert = true;
    await expect(completeDocumentIndexing(9, 1, [{ ordinal: 0, content: "New source", pageStart: 1, pageEnd: 1 }], [2])).rejects.toThrow("insert failed");
    expect(state.committed).toEqual([]);
  });
});
