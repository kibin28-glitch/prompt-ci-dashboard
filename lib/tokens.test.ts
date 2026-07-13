import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { deleteOwnedToken } from "./tokens";

function createMockAdmin(rows: unknown[]) {
  const eqUserId = vi.fn().mockReturnValue({
    select: vi.fn().mockResolvedValue({ data: rows, error: null }),
  });
  const eqId = vi.fn().mockReturnValue({ eq: eqUserId });
  const del = vi.fn().mockReturnValue({ eq: eqId });
  const from = vi.fn().mockReturnValue({ delete: del });

  return {
    admin: { from } as unknown as SupabaseClient,
    from,
    eqId,
    eqUserId,
  };
}

describe("deleteOwnedToken", () => {
  it("scopes the delete to the given id AND user_id, and returns deleted:true when a row is removed", async () => {
    const { admin, from, eqId, eqUserId } = createMockAdmin([{ id: "tok-1" }]);

    const result = await deleteOwnedToken(admin, "tok-1", "user-1");

    expect(result).toEqual({ deleted: true });
    expect(from).toHaveBeenCalledWith("api_tokens");
    expect(eqId).toHaveBeenCalledWith("id", "tok-1");
    expect(eqUserId).toHaveBeenCalledWith("user_id", "user-1");
  });

  it("returns deleted:false when no row matches (wrong owner or missing id)", async () => {
    const { admin } = createMockAdmin([]);

    const result = await deleteOwnedToken(admin, "tok-1", "someone-elses-user-id");

    expect(result).toEqual({ deleted: false });
  });
});
