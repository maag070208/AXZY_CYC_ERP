import { test, expect } from "@playwright/test";
import {
  candidatePolicies,
  conditionHolds,
  evaluatePolicies,
  readPath,
  resolveValue,
} from "../../src/core/policies/evaluator";
import { isPolicyField, policyActionOf } from "../../src/core/policies/actions";
import type { PolicyActor, PolicyDef } from "../../src/core/policies/types";

/**
 * Motor ABAC puro: orden por prioridad, primera que casa decide, roles a los
 * que aplica, operadores y referencias al actor (`@user.*`).
 */

const actor: PolicyActor = { id: "u-1", username: "ana", roles: ["SCHOOL_CONTROL"] };

const policy = (overrides: Partial<PolicyDef>): PolicyDef => ({
  id: overrides.key ?? "p",
  key: "p",
  name: "p",
  action: "users.deactivate",
  effect: "DENY",
  priority: 100,
  active: true,
  roles: [],
  conditions: [],
  ...overrides,
});

test.describe("evaluatePolicies", () => {
  test("sin políticas que casen se permite (el RBAC ya decidió)", () => {
    expect(evaluatePolicies([], "users.deactivate", actor, {})).toEqual({ allowed: true, policy: null });
  });

  test("una DENY sin condiciones niega", () => {
    const decision = evaluatePolicies([policy({ key: "no" })], "users.deactivate", actor, {});
    expect(decision.allowed).toBe(false);
    expect(decision.policy?.key).toBe("no");
  });

  test("la menor prioridad se evalúa primero; empate por code", () => {
    const list = [
      policy({ key: "deny", effect: "DENY", priority: 20 }),
      policy({ key: "allow", effect: "ALLOW", priority: 10 }),
    ];
    expect(evaluatePolicies(list, "users.deactivate", actor, {})).toMatchObject({
      allowed: true,
      policy: { key: "allow" },
    });
    const tie = [policy({ key: "b", effect: "ALLOW" }), policy({ key: "a", effect: "DENY" })];
    expect(evaluatePolicies(tie, "users.deactivate", actor, {}).policy?.key).toBe("a");
  });

  test("si las condiciones no casan, sigue con la siguiente", () => {
    const list = [
      policy({
        key: "allow_alumnos",
        effect: "ALLOW",
        priority: 1,
        conditions: [{ field: "target.roles", operator: "in", value: ["STUDENT"] }],
      }),
      policy({ key: "deny_rest", priority: 2 }),
    ];
    expect(evaluatePolicies(list, "users.deactivate", actor, { target: { roles: ["STUDENT"] } }).allowed).toBe(true);
    expect(evaluatePolicies(list, "users.deactivate", actor, { target: { roles: ["ADMIN"] } })).toMatchObject({
      allowed: false,
      policy: { key: "deny_rest" },
    });
  });

  test("las inactivas, de otra acción o de otro rol no cuentan", () => {
    const list = [
      policy({ key: "off", active: false }),
      policy({ key: "other", action: "users.create" }),
      policy({ key: "admins", roles: ["ADMIN"] }),
    ];
    expect(candidatePolicies(list, "users.deactivate", actor)).toEqual([]);
    expect(candidatePolicies(list, "users.deactivate", { ...actor, roles: ["ADMIN"] }).map((p) => p.key)).toEqual([
      "admins",
    ]);
  });
});

test.describe("conditionHolds", () => {
  const ctx = { target: { id: "u-2", roles: ["ADMIN", "TEACHER"] }, amount: 1500, scope: "ALL", note: "urgente" };
  const holds = (field: string, operator: Parameters<typeof conditionHolds>[0]["operator"], value: unknown) =>
    conditionHolds({ field, operator, value }, ctx, actor);

  test("eq / neq con escalares y arreglos (como conjunto)", () => {
    expect(holds("scope", "eq", "ALL")).toBe(true);
    expect(holds("target.roles", "eq", ["TEACHER", "ADMIN"])).toBe(true);
    expect(holds("scope", "neq", "ALL")).toBe(false);
  });

  test("in / not_in: un arreglo casa si alguno de sus elementos está en la lista", () => {
    expect(holds("target.roles", "in", ["ADMIN"])).toBe(true);
    expect(holds("scope", "in", ["OWN", "AREA"])).toBe(false);
    expect(holds("target.roles", "not_in", ["STUDENT"])).toBe(true);
  });

  test("contains / not_contains sobre arreglos y textos", () => {
    expect(holds("target.roles", "contains", "ADMIN")).toBe(true);
    expect(holds("note", "contains", "gen")).toBe(true);
    expect(holds("target.roles", "not_contains", "STUDENT")).toBe(true);
  });

  test("comparaciones numéricas; tipos distintos no casan", () => {
    expect(holds("amount", "gt", 1000)).toBe(true);
    expect(holds("amount", "lte", 1500)).toBe(true);
    expect(holds("amount", "lt", "2000")).toBe(false);
  });

  test("exists y campos ausentes", () => {
    expect(holds("target.id", "exists", true)).toBe(true);
    expect(holds("target.salario", "exists", true)).toBe(false);
    expect(holds("target.salario", "exists", false)).toBe(true);
    expect(holds("target.salario", "eq", 1)).toBe(false);
  });

  test("referencias al actor: @user.id y @user.roles", () => {
    expect(holds("target.id", "neq", "@user.id")).toBe(true);
    expect(conditionHolds({ field: "target.id", operator: "eq", value: "@user.id" }, { target: { id: "u-1" } }, actor)).toBe(true);
    expect(holds("target.roles", "in", "@user.roles")).toBe(false);
    expect(resolveValue(["@user.username", "x"], actor)).toEqual(["ana", "x"]);
  });

  test("operador desconocido no casa (la política no aplica)", () => {
    expect(conditionHolds({ field: "scope", operator: "regex" as never, value: ".*" }, ctx, actor)).toBe(false);
  });

  test("readPath no truena con nulos", () => {
    expect(readPath({ a: null }, "a.b.c")).toBeUndefined();
    expect(readPath(undefined, "a")).toBeUndefined();
  });
});

test.describe("registro de acciones", () => {
  test("solo las acciones registradas exponen sus campos", () => {
    expect(policyActionOf("users.deactivate")).toBeDefined();
    expect(policyActionOf("payments.approve")).toBeUndefined();
    expect(isPolicyField("users.deactivate", "target.roles")).toBe(true);
    expect(isPolicyField("users.deactivate", "amount")).toBe(false);
  });
});
