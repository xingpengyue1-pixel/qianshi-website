import { readdirSync } from "node:fs";
import path from "node:path";
import { listHtmlFiles } from "./references.mjs";

// 公开页红线。只匹配已从审阅稿撤下的主张和收集入口。
// 同一句里的否定（不写、不构成、不等于）不算回归。
// docs/、tests/、README 不在公开扫描范围内。

export const RED_LINES = [
  { id: "sync-live", re: /同步在播/g },
  { id: "account-1210", re: /1210\s*\+/g },
  { id: "leads-20k", re: /2\s*万\s*\+/g },
  { id: "zero-complaint", re: /零客诉|0\s*客诉/g },
  { id: "break-even", re: /即可保本|日销\s*3/g },
  { id: "ten-million", re: /千万级/g },
  { id: "named-carrier", re: /中国移动|中国联通|内蒙古移动/g },
  { id: "named-school", re: /艺术学院/g },
  { id: "named-partner", re: /东方国信/g },
  { id: "golf-club", re: /高尔夫|高端客勤基地/g },
  { id: "contest-three", re: /连续承办三届|三届运营商直播大赛/g },
  { id: "licensed-claim", re: /持牌经营/g },
  { id: "test-form", re: /测试表单/g },
  { id: "jinshuju", re: /jsjform\.com|金数据/g },
  { id: "fake-icp", re: /蒙ICP|ICP备/g },
  { id: "investor-cta", re: /投资洽谈|投资人/g },
  { id: "ordos-training-done", re: /首期培训已开展/g },
  { id: "ordos-undertake", re: /公司承接/g },
];

const NEGATION = /不构成|不把|不写|不报|不设|不要|不是|不能|不会|没有|并未|并非|勿|避免|不等于/;

export function listPublicCopyFiles(root) {
  const html = listHtmlFiles(root);
  const imagesDir = path.join(root, "images");
  const svg = readdirSync(imagesDir)
    .filter((name) => name.endsWith(".svg"))
    .map((name) => `images/${name}`);
  return [...html, ...svg].sort();
}

function clauseBefore(text, index) {
  const raw = text.slice(Math.max(0, index - 80), index).replace(/<[^>]*>/g, "");
  const parts = raw.split(/[。！？\n]/);
  return parts[parts.length - 1];
}

export function findRedLines(text) {
  const hits = [];
  for (const rule of RED_LINES) {
    rule.re.lastIndex = 0;
    for (const match of text.matchAll(rule.re)) {
      if (NEGATION.test(clauseBefore(text, match.index))) continue;
      hits.push({ id: rule.id, index: match.index, text: match[0] });
    }
  }
  if (/<iframe\b[^>]*(?:jsjform\.com|jinshuju\.com)/i.test(text)) {
    hits.push({ id: "iframe-collector", index: text.search(/<iframe\b/i), text: "iframe" });
  }
  if (/<form\b/i.test(text)) {
    hits.push({ id: "html-form", index: text.search(/<form\b/i), text: "form" });
  }
  if (/href\s*=\s*["'][^"']*jsjform\.com/i.test(text)) {
    hits.push({ id: "form-link", index: text.search(/jsjform\.com/i), text: "jsjform.com" });
  }
  return hits;
}
