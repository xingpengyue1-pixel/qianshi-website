import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { after, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { findRedLines, listPublicCopyFiles } from "./copy-redlines.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const fetchCalls = [];
globalThis.fetch = async (input) => {
  fetchCalls.push(String(input));
  throw new Error("文案红线测试不应访问网络");
};

after(() => {
  assert.deepEqual(fetchCalls, [], `文案红线测试访问了网络: ${fetchCalls.join(", ")}`);
});

function read(name) {
  return readFileSync(path.join(ROOT, name), "utf8");
}

function ids(text) {
  return findRedLines(text).map((hit) => hit.id);
}

describe("文案红线检出", () => {
  it("能检出已撤下的强主张", () => {
    const sample = [
      "1210+ 账号同步在播",
      "2万+ 有效客资",
      "六年零客诉",
      "0 客诉",
      "日销 3 张激活卡即可保本",
      "千万级标杆订单",
      "为中国移动、中国联通服务",
      "推进内蒙古移动标杆订单",
      "内蒙古艺术学院已交付",
      "与东方国信协作",
      "含高尔夫会所高端客勤基地",
      "连续承办三届运营商直播大赛",
      "持牌经营",
      "标题为测试表单",
      "https://b6p2zqjy.jsjform.com/f/yt8gjZ",
      "咨询表单由金数据提供",
      "蒙ICP备12345678号",
      "运营商合作、院校共建、投资洽谈",
      "关注这条赛道的投资人",
      "首期培训已开展",
      "项目由内蒙古潜势科技有限公司承接",
    ].join("。");
    const found = new Set(ids(sample));
    for (const id of [
      "sync-live",
      "account-1210",
      "leads-20k",
      "zero-complaint",
      "break-even",
      "ten-million",
      "named-carrier",
      "named-school",
      "named-partner",
      "golf-club",
      "contest-three",
      "licensed-claim",
      "test-form",
      "jinshuju",
      "fake-icp",
      "investor-cta",
      "ordos-training-done",
      "ordos-undertake",
    ]) {
      assert.ok(found.has(id), `样例没有检出 ${id}`);
    }
  });

  it("不把合法否定和进行中状态当成红线", () => {
    const sample = [
      "不构成投资、收益或合作承诺",
      "这一页不设在线表单",
      "线索不等于采购订单",
      "服务进行中",
      "不把零客诉写成成绩",
      "本页不写即可保本",
      "用直播和短视频承接号卡与宽带",
      "具体合作以书面约定为准",
      "请拨打 186 1120 6321",
    ].join("。");
    assert.deepEqual(findRedLines(sample), []);
  });

  it("能检出重新放回的第三方收集表单", () => {
    const contact = read("contact.html");
    assert.equal(ids(contact).includes("iframe-collector"), false);
    assert.equal(ids(contact).includes("html-form"), false);
    const iframe = `${contact}<iframe src="https://b6p2zqjy.jsjform.com/f/yt8gjZ"></iframe>`;
    assert.ok(ids(iframe).includes("iframe-collector"));
    assert.ok(ids(iframe).includes("jinshuju"));
    const form = `${contact}<form><input name="tel" placeholder="手机"></form>`;
    assert.ok(ids(form).includes("html-form"));
    const link = `${contact}<a href="https://b6p2zqjy.jsjform.com/f/yt8gjZ">在新窗口打开表单</a>`;
    assert.ok(ids(link).includes("form-link"));
  });

  it("把主张插回公开页文本时能检出，原文本身没有这些主张", () => {
    const home = read("index.html");
    assert.deepEqual(findRedLines(home), []);
    const poisoned = home.replace("</h1>", "</h1><p>1210+ 账号同步在播。六年零客诉。</p>");
    const found = new Set(ids(poisoned));
    assert.ok(found.has("sync-live"));
    assert.ok(found.has("account-1210"));
    assert.ok(found.has("zero-complaint"));
  });
});

describe("公开扫描范围", () => {
  it("审阅文档引用了改前原文，因此不能把文档算进公开页", () => {
    const files = listPublicCopyFiles(ROOT);
    assert.equal(files.some((name) => name.startsWith("docs/")), false);
    assert.equal(files.includes("README.md"), false);
    assert.equal(files.includes("images/og-cover.png"), false);
    const review = read("docs/copy-review-2026-11-21.md");
    const found = new Set(ids(review));
    assert.ok(found.has("sync-live"));
    assert.ok(found.has("break-even"));
    assert.ok(found.has("investor-cta"));
  });

  it("当前公开 HTML 和 SVG 没有红线", () => {
    const files = listPublicCopyFiles(ROOT);
    assert.ok(files.includes("index.html"));
    assert.ok(files.includes("contact.html"));
    assert.ok(files.includes("images/hero-matrix.svg"));
    assert.ok(files.includes("images/case-dashboard.svg"));
    const failures = [];
    for (const name of files) {
      const hits = findRedLines(read(name));
      if (hits.length) failures.push(`${name}: ${hits.map((hit) => hit.id).join(", ")}`);
    }
    assert.deepEqual(failures, []);
  });
});
