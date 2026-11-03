import { expect, test } from "vitest";
import { resolveActivePath } from "./nav-active";
const P = ["/app", "/app/leads", "/app/leads/dashboard", "/app/finance", "/app/finance/funds"];
test("Lead Dashboard does not also select Leads", () => expect(resolveActivePath("/app/leads/dashboard", P)).toBe("/app/leads/dashboard"));
test("lead detail selects Leads", () => expect(resolveActivePath("/app/leads/abc", P)).toBe("/app/leads"));
test("finance sub page selects only its item", () => expect(resolveActivePath("/app/finance/funds", P)).toBe("/app/finance/funds"));
test("Overview only on exact /app", () => expect(resolveActivePath("/app/profile", P)).toBe(null));
