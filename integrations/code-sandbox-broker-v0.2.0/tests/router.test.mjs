import assert from "node:assert/strict";
import test from "node:test";
import { routeWork } from "../src/router.mjs";

test("routes project development to sandbox", () => {
  assert.equal(routeWork({ request: "帮我修复这个 Node 项目并跑测试", projectPath: "/srv/vlab/projects/demo" }).route, "sandbox");
});

test("keeps read-only Session inspection in Gateway", () => {
  assert.equal(routeWork({ request: "查询一下隔壁群的 session 状态" }).route, "gateway");
});

test("requires approval for production deployment", () => {
  assert.equal(routeWork({ request: "测试好以后直接部署到 production" }).route, "approval");
});
