import { describe, it, expect } from "vitest";
import { authorizeMutation } from "./dashboards";
import type { dashboardsTable } from "@workspace/db";

type DashboardRow = typeof dashboardsTable.$inferSelect;

/*
 * authorizeMutation is the single access-control decision point shared by every
 * dashboard/card mutation endpoint:
 *   - PATCH /:id            (update dashboard)
 *   - DELETE /:id           (delete dashboard)
 *   - POST /:id/cards       (create card)
 *   - PATCH /cards/:cardId  (update card)
 *   - DELETE /cards/:cardId (delete card)
 *   - POST /cards/reorder   (reorder cards, per owning dashboard)
 * Exercising it directly covers the authorization rules for all of them.
 */

function makeDashboard(overrides: Partial<DashboardRow> = {}): DashboardRow {
  return {
    id: "dash-1",
    name: "My dashboard",
    description: null,
    order: 0,
    builtin: false,
    createdBy: "user-owner",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

const owner = { id: "user-owner", role: "MEMBER" };
const stranger = { id: "user-other", role: "MEMBER" };
const admin = { id: "user-admin", role: "ADMIN" };

describe("authorizeMutation", () => {
  it("blocks mutating a built-in dashboard, even for an admin", () => {
    const builtin = makeDashboard({ builtin: true, createdBy: null });

    const asAdmin = authorizeMutation(builtin, admin);
    expect(asAdmin.ok).toBe(false);
    if (!asAdmin.ok) {
      expect(asAdmin.status).toBe(403);
      expect(asAdmin.error).toMatch(/built-in/i);
    }

    // Built-in beats ownership too.
    const ownedBuiltin = makeDashboard({ builtin: true, createdBy: owner.id });
    expect(authorizeMutation(ownedBuiltin, owner).ok).toBe(false);
  });

  it("rejects a non-owner, non-admin user with 403", () => {
    const res = authorizeMutation(makeDashboard(), stranger);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.status).toBe(403);
      expect(res.error).toMatch(/permission/i);
    }
  });

  it("allows the creator to mutate their own dashboard", () => {
    expect(authorizeMutation(makeDashboard(), owner)).toEqual({ ok: true });
  });

  it("allows an admin to mutate any non-built-in dashboard", () => {
    // Admin who is not the creator.
    expect(authorizeMutation(makeDashboard(), admin)).toEqual({ ok: true });
    // Admin on a seeded/curated dashboard (createdBy = null).
    expect(
      authorizeMutation(makeDashboard({ createdBy: null }), admin),
    ).toEqual({ ok: true });
  });

  it("treats seeded dashboards (createdBy = null) as admin-only", () => {
    const seeded = makeDashboard({ createdBy: null });
    // A regular member cannot mutate a seeded dashboard...
    const asMember = authorizeMutation(seeded, owner);
    expect(asMember.ok).toBe(false);
    if (!asMember.ok) expect(asMember.status).toBe(403);
    // ...but an admin can.
    expect(authorizeMutation(seeded, admin)).toEqual({ ok: true });
  });
});
