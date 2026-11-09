import assert from "node:assert/strict";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { reportExternalFailure, visitReferences } from "./references.mjs";

// 单独执行：npm run test:links
// 默认 npm test 不加载本文件。这里的失败都算数，包括税务总局和财政部。

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("外链实请求", () => {
  it("页面中的每一条外链都返回成功状态", async () => {
    const external = visitReferences(ROOT);
    assert.ok(external.size > 0, "页面中没有需要检查的外部资源");
    const failures = [];
    for (const [url, page] of external) {
      try {
        await assertReachable(url);
      } catch (error) {
        failures.push(reportExternalFailure(page, url, error));
      }
    }
    assert.deepEqual(failures, []);
  });
});

async function assertReachable(url) {
  let lastError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch(url, {
        redirect: "follow",
        headers: { "user-agent": "qianshi-website-linkcheck/1.0" },
        signal: AbortSignal.timeout(20000),
      });
      await response.body?.cancel();
      if (response.status >= 400) throw new Error(`HTTP ${response.status}`);
      return;
    } catch (error) {
      lastError = error;
      if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  throw lastError;
}
