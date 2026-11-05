import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { FileSystemConfigLoader, HtmlValidate } from "html-validate";
import { parse } from "node-html-parser";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REQUIRED_PAGES = ["index.html", "products.html", "about.html", "contact.html"];
const SITE_ORIGIN = "https://site.local";

const htmlvalidate = new HtmlValidate(new FileSystemConfigLoader());

function listHtmlFiles() {
  return readdirSync(ROOT)
    .filter((name) => name.endsWith(".html"))
    .sort();
}

function readPage(name) {
  return readFileSync(path.join(ROOT, name), "utf8");
}

function loadPage(name) {
  return parse(readPage(name));
}

function classify(raw) {
  if (raw == null || raw === "" || raw.startsWith("javascript:") || raw.startsWith("data:")) {
    return { kind: "invalid", raw: raw ?? "" };
  }
  if (raw.startsWith("mailto:")) return { kind: "mailto", raw };
  if (raw.startsWith("tel:")) return { kind: "tel", raw };
  if (/^https?:\/\//i.test(raw)) return { kind: "external", raw };
  return { kind: "local", raw };
}

function resolveLocal(pageFile, raw) {
  const base = new URL(pageFile, `${SITE_ORIGIN}/`);
  const url = new URL(raw, base);
  if (url.origin !== SITE_ORIGIN) return { kind: "external", href: url.href };
  let pathname = decodeURIComponent(url.pathname);
  if (pathname.endsWith("/")) pathname += "index.html";
  const rel = path.posix.normalize(pathname.replace(/^\/+/, "") || "index.html");
  if (rel.startsWith("..") || path.posix.isAbsolute(rel)) {
    throw new Error(`${pageFile} 中的链接逃出站点根目录: ${raw}`);
  }
  return {
    kind: "local",
    rel,
    hash: decodeURIComponent(url.hash.replace(/^#/, "")),
  };
}

function pageReferences(document) {
  const refs = [];
  for (const el of document.querySelectorAll("a[href], area[href], img[src], script[src], source[src], video[src], audio[src], link[href]")) {
    const tag = el.tagName.toLowerCase();
    if (tag === "link") {
      const rels = (el.getAttribute("rel") || "").toLowerCase().split(/\s+/);
      const resource = rels.some((rel) =>
        ["stylesheet", "icon", "manifest", "apple-touch-icon", "preload", "modulepreload"].includes(rel),
      );
      if (!resource) continue;
    }
    refs.push(el.getAttribute("href") || el.getAttribute("src"));
  }
  return refs;
}

function idsIn(file) {
  const document = loadPage(file);
  const counts = new Map();
  for (const el of document.querySelectorAll("[id]")) {
    const id = el.getAttribute("id");
    counts.set(id, (counts.get(id) || 0) + 1);
  }
  return counts;
}

const idCache = new Map();
function idsFor(file) {
  if (!idCache.has(file)) idCache.set(file, idsIn(file));
  return idCache.get(file);
}

describe("页面清单", () => {
  it("根目录包含四张关键页面", () => {
    const files = listHtmlFiles();
    for (const name of REQUIRED_PAGES) {
      assert.ok(files.includes(name), `缺少 ${name}`);
    }
  });
});

describe("HTML 校验", () => {
  for (const name of listHtmlFiles()) {
    it(`${name} 通过 html-validate`, async () => {
      const report = await htmlvalidate.validateFile(path.join(ROOT, name));
      const details = report.results
        .flatMap((result) => result.messages.map((message) => `${message.ruleId} ${message.line}:${message.column} ${message.message}`))
        .join("\n");
      assert.equal(report.valid, true, details);
    });
  }
});

describe("文档骨架", () => {
  for (const name of listHtmlFiles()) {
    it(`${name} 具备语言、标题、描述、图标和唯一 h1`, () => {
      const html = readPage(name);
      const document = parse(html);
      assert.match(html, /^<!DOCTYPE html>/i, `${name} 缺少 doctype`);
      assert.equal(document.querySelector("html")?.getAttribute("lang"), "zh-CN");
      assert.ok(document.querySelector("meta[charset]"), `${name} 缺少 charset`);
      assert.match(document.querySelector("meta[name=viewport]")?.getAttribute("content") || "", /width=device-width/);
      const title = document.querySelector("title")?.text?.trim();
      assert.ok(title && title.includes("潜势"), `${name} 的 title 异常: ${title}`);
      const description = document.querySelector("meta[name=description]")?.getAttribute("content")?.trim();
      assert.ok(description && description.length > 10, `${name} 缺少 meta description`);
      assert.equal(document.querySelectorAll("h1").length, 1, `${name} 应有且仅有一个 h1`);
      assert.equal(document.querySelector("link[rel=icon]")?.getAttribute("href"), "images/logo-mark.svg");
    });

    it(`${name} 有页头、页脚、品牌回首页和移动菜单`, () => {
      const document = loadPage(name);
      assert.ok(document.querySelector("header.site-header"));
      assert.ok(document.querySelector("footer"));
      assert.equal(document.querySelector("a.brand")?.getAttribute("href"), "index.html");
      assert.ok(document.querySelector("a.brand img")?.getAttribute("alt"));
      const menu = document.querySelector("#menuBtn");
      assert.equal(menu?.getAttribute("aria-label"), "菜单");
      assert.equal(menu?.getAttribute("aria-expanded"), "false");
      assert.ok(document.querySelector("#mobileMenu"));
    });
  }
});

describe("导航", () => {
  const shared = ["products.html", "about.html", "contact.html"];

  it("首页导航指向站内栏目", () => {
    const document = loadPage("index.html");
    for (const selector of [".nav-links", "#mobileMenu"]) {
      const hrefs = document.querySelectorAll(`${selector} a`).map((anchor) => anchor.getAttribute("href"));
      for (const href of [...shared, "#moat", "#cases"]) {
        assert.ok(hrefs.includes(href), `index.html ${selector} 缺少 ${href}`);
      }
    }
  });

  for (const name of ["products.html", "about.html", "contact.html"]) {
    it(`${name} 导航能回到首页栏目`, () => {
      const document = loadPage(name);
      for (const selector of [".nav-links", "#mobileMenu"]) {
        const hrefs = document.querySelectorAll(`${selector} a`).map((anchor) => anchor.getAttribute("href"));
        for (const href of [...shared, "index.html#moat", "index.html#cases"]) {
          assert.ok(hrefs.includes(href), `${name} ${selector} 缺少 ${href}`);
        }
      }
    });
  }
});

describe("关键页面元素", () => {
  it("首页包含主标题、栏目锚点和创始人", () => {
    const html = readPage("index.html");
    const document = loadPage("index.html");
    assert.match(document.querySelector("h1").text, /把专业问题接住/);
    for (const id of ["top", "products", "moat", "cases", "values", "contact"]) {
      assert.ok(document.querySelector(`#${id}`), `首页缺少 #${id}`);
    }
    assert.ok(document.querySelector("[data-stats-band]"));
    assert.ok(document.querySelector("[data-prod-grid]"));
    assert.match(html, /邢鹏越/);
    assert.equal(document.querySelector("img[alt='邢鹏越']")?.getAttribute("src"), "images/founder.svg");
    assert.equal(document.querySelector("img[alt='新媒体官方账号矩阵示意']")?.getAttribute("src"), "images/hero-matrix.svg");
  });

  it("业务页包含五段价值链", () => {
    const html = readPage("products.html");
    assert.match(loadPage("products.html").querySelector("h1").text, /五段价值链/);
    for (const snippet of [
      "国央企新媒体官方账号矩阵化运营",
      "权威与专业内容传播",
      "佣金争夺战",
      "本地生活、文旅及家庭业务协同",
      "潜势咨询",
    ]) {
      assert.ok(html.includes(snippet), `业务页缺少「${snippet}」`);
    }
  });

  it("关于页包含品牌、团队和时间线", () => {
    const html = readPage("about.html");
    const document = loadPage("about.html");
    assert.match(document.querySelector("h1").text, /一体化组织/);
    assert.ok(document.querySelector(".timeline"));
    assert.ok(document.querySelector(".founder-card"));
    assert.equal(document.querySelector("img[alt='邢鹏越']")?.getAttribute("src"), "images/founder.svg");
    for (const snippet of ["潜势二字,源出乾卦", "2020", "2025", "2027"]) {
      assert.ok(html.includes(snippet), `关于页缺少「${snippet}」`);
    }
  });

  it("联系页包含电话、地址和需求表单控件", () => {
    const html = readPage("contact.html");
    const document = loadPage("contact.html");
    assert.match(document.querySelector("h1").text, /运营商合作/);
    assert.ok(html.includes("香格里拉"));
    assert.ok(html.includes("邢鹏越"));
    assert.ok(document.querySelector("a.tel-link[href^='tel:']"));
    assert.ok(document.querySelector("#formFields input[type=text]"));
    assert.ok(document.querySelector("#formFields input[type=tel]"));
    assert.ok(document.querySelector("#formFields select"));
    assert.ok(document.querySelector("#formFields textarea"));
    assert.equal(document.querySelectorAll("#formFields option").length, 6);
    assert.ok(document.querySelector("#submitBtn"));
    assert.ok(document.querySelector("#formDone"));
  });

  it("首页团队段落与关于页一样使用「全流程」", () => {
    const index = readPage("index.html");
    const about = readPage("about.html");
    const start = index.indexOf(">团队<");
    const end = index.indexOf('id="values"');
    const team = index.slice(start, end);
    assert.ok(start !== -1 && end > start, "首页缺少团队段落");
    assert.equal(team.includes("全链路"), false, team);
    assert.ok(team.includes("全流程的实战团队"));
    assert.ok(team.includes("客资全流程"));
    assert.ok(team.includes(">全流程<"));
    assert.ok(about.includes("跑通全流程的实战团队"));
    assert.ok(about.includes("客资全流程"));
  });

  it("电话链接与可见号码一致", () => {
    const numbers = new Set();
    for (const name of ["index.html", "contact.html"]) {
      for (const anchor of loadPage(name).querySelectorAll("a[href^='tel:']")) {
        const hrefDigits = anchor.getAttribute("href").replace(/^tel:/, "").replace(/\D/g, "");
        const textDigits = anchor.text.replace(/\D/g, "");
        assert.ok(hrefDigits.length >= 8, `${name} 的电话链接不完整`);
        assert.equal(textDigits, hrefDigits, `${name} 的电话文案与 href 不一致`);
        numbers.add(hrefDigits);
      }
    }
    assert.equal(numbers.size, 1, `各页电话号码不一致: ${[...numbers].join(", ")}`);
  });
});

describe("联系表单", () => {
  const fields = [
    ["contactName", "INPUT"],
    ["contactTel", "INPUT"],
    ["contactTopic", "SELECT"],
    ["contactNote", "TEXTAREA"],
  ];

  it("必填字段和标签关联,且不把表单交给第三方", () => {
    const html = readPage("contact.html");
    const document = loadPage("contact.html");
    const form = document.querySelector("#formFields");
    assert.equal(form?.tagName, "FORM");
    assert.equal((form.getAttribute("action") || "").startsWith("http"), false);
    assert.doesNotMatch(html, /formspree|getform|netlify|web3forms|formsubmit|jinshuju|金数据/i);
    for (const [id, tag] of fields) {
      const field = document.querySelector(`#${id}`);
      assert.equal(field?.tagName, tag, id);
      assert.equal(field?.hasAttribute("required"), true, `${id} 应必填`);
      const label = document.querySelector(`label[for="${id}"]`);
      assert.ok(label && label.text.trim(), `${id} 缺少关联标签`);
    }
    const source = scriptText(document);
    const handler = source.slice(source.indexOf("form.addEventListener('submit'"));
    assert.match(handler, /preventDefault/);
    assert.ok(handler.indexOf("reportValidity") !== -1 && handler.indexOf("reportValidity") < handler.indexOf("formDone"));
    assert.match(source, /addEventListener\('input',\s*function \(\) \{\s*if \(field\.value\.trim\(\) !== ''\) field\.setCustomValidity\(''\);/);
    assert.doesNotMatch(html, /已收到/);
    assert.doesNotMatch(html, /1 个工作日/);
    assert.match(document.querySelector("#formDone").text, /还没有送出/);
    assert.match(document.querySelector("#formDone").text, /尚未收到/);
    assert.match(document.querySelector("#formDone").text, /186 1120 6321/);
    assert.match(document.querySelector("#formIntro").text, /不会自动送达|没有联系邮箱/);
  });

  it("页面上没有邮箱时引导电话,有邮箱时才组装 mailto", () => {
    const api = loadContactApi();
    const page = readPage("contact.html");
    assert.equal(api.findContactEmail(page), "");
    const tel = { href: "tel:18611206321", text: "186 1120 6321" };
    const filled = { name: "张经理", phone: "13800001111", topic: "其他", note: "想做账号矩阵" };
    const empty = api.deliverContact("", tel, { name: "  ", phone: "", topic: "其他", note: "有内容" });
    assert.equal(empty.ok, false);
    const phonePath = api.deliverContact("", tel, filled);
    assert.equal(phonePath.ok, true);
    assert.equal(phonePath.mode, "tel");
    assert.equal(phonePath.href, "tel:18611206321");
    assert.match(phonePath.detail, /186 1120 6321/);
    assert.match(phonePath.detail, /尚未收到/);
    assert.doesNotMatch(`${phonePath.title}${phonePath.detail}`, /已收到/);
    assert.match(phonePath.summary, /想做账号矩阵/);
    const noPhone = api.deliverContact("", null, filled);
    assert.equal(noPhone.mode, "tel");
    assert.match(noPhone.detail, /电话/);
    assert.equal(noPhone.href, "");
    const withLink = "<p><a href=\"mailto:hello@example.com?subject=old\">邮箱</a></p><script>skip@hidden.test</script>";
    assert.equal(api.findContactEmail(withLink), "hello@example.com");
    const mailed = api.deliverContact("hello@example.com", tel, filled);
    assert.equal(mailed.mode, "mailto");
    assert.equal(mailed.href.startsWith("mailto:hello@example.com?"), true);
    const query = mailed.href.slice(mailed.href.indexOf("?"));
    const params = new URLSearchParams(query);
    assert.equal(params.get("subject"), "官网合作需求");
    assert.match(params.get("body"), /张经理/);
    assert.match(params.get("body"), /想做账号矩阵/);
    assert.match(mailed.detail, /邮件客户端/);
    assert.match(mailed.detail, /没有收到/);
    assert.equal(api.findContactEmail("<p>写给 owner@qianshi.example 即可</p>"), "owner@qianshi.example");
    assert.equal(api.findContactEmail("<script>only@secret.test</script><style>also@secret.test</style>"), "");
  });
});

describe("无脚本时内容可见", () => {
  for (const name of listHtmlFiles()) {
    it(`${name} 只在 html.js 下隐藏 data-reveal`, () => {
      const html = readPage(name);
      const head = html.slice(html.indexOf("<head>"), html.indexOf("</head>"));
      assert.match(head, /document\.documentElement\.classList\.add\(["']js["']\)/);
      const css = [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((match) => match[1]).join("\n");
      let hideRules = 0;
      for (const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        const selector = match[1];
        const body = match[2];
        if (!selector.includes("[data-reveal]") || !/opacity\s*:\s*0/.test(body)) continue;
        hideRules += 1;
        assert.match(selector, /html\.js\s+\[data-reveal\]/, `${name} 在无脚本时仍会隐藏: ${selector.trim()}`);
      }
      assert.ok(hideRules >= 1, `${name} 缺少 data-reveal 的渐进增强规则`);
    });
  }
});

function walkReferences() {
  const external = new Map();
  for (const name of listHtmlFiles()) {
    const document = loadPage(name);
    for (const image of document.querySelectorAll("img")) {
      const alt = image.getAttribute("alt");
      assert.ok(alt && alt.trim(), `${name} 有图片缺少 alt`);
    }
    for (const raw of pageReferences(document)) {
      const kind = classify(raw);
      if (kind.kind === "invalid") assert.fail(`${name} 含有无效链接: ${raw}`);
      if (kind.kind === "tel") {
        assert.match(kind.raw, /^tel:\+?\d{8,15}$/, `${name} 的电话链接异常: ${kind.raw}`);
        continue;
      }
      if (kind.kind === "mailto") continue;
      if (kind.kind === "external") {
        if (!external.has(kind.raw)) external.set(kind.raw, name);
        continue;
      }
      const local = resolveLocal(name, kind.raw);
      if (local.kind === "external") {
        if (!external.has(local.href)) external.set(local.href, name);
        continue;
      }
      const target = path.join(ROOT, local.rel);
      assert.ok(existsSync(target), `${name} 死链: ${kind.raw} -> ${local.rel}`);
      if (local.hash) {
        assert.ok(local.rel.endsWith(".html"), `${name} 的锚点不在 HTML 上: ${kind.raw}`);
        assert.equal(idsFor(local.rel).get(local.hash), 1, `${name} 指向不存在或重复的锚点 ${local.rel}#${local.hash}`);
      }
    }
  }
  return external;
}

describe("链接", () => {
  it("站内链接指向存在的文件和锚点，图片都有替代文本", () => {
    walkReferences();
  });

  it("页面内 id 不重复", () => {
    for (const name of listHtmlFiles()) {
      for (const [id, count] of idsFor(name)) {
        assert.equal(count, 1, `${name} 的 id="${id}" 出现 ${count} 次`);
      }
    }
  });

  it("外部资源可以访问", { skip: process.env.SKIP_EXTERNAL_LINKS === "1" }, async () => {
    const external = walkReferences();
    assert.ok(external.size > 0, "页面中没有需要检查的外部资源");
    const failures = [];
    for (const [url, page] of external) {
      try {
        await assertReachable(url);
      } catch (error) {
        failures.push(`${page} -> ${url}: ${error.message}`);
      }
    }
    assert.deepEqual(failures, []);
  });
});

function scriptText(document) {
  return document.querySelectorAll("script").map((script) => script.text).join("\n");
}

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `contact.html 缺少 ${name}`);
  let depth = 0;
  for (let i = source.indexOf("{", start); i < source.length; i += 1) {
    if (source[i] === "{") depth += 1;
    else if (source[i] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  assert.fail(`contact.html 中的 ${name} 没有结束`);
}

function loadContactApi() {
  const source = scriptText(loadPage("contact.html"));
  const code = ["stripBlocks", "findContactEmail", "buildContactMailto", "deliverContact"]
    .map((name) => extractFunction(source, name))
    .join("\n");
  const sandbox = {};
  vm.runInNewContext(`${code}\nthis.api = { findContactEmail, buildContactMailto, deliverContact };`, sandbox);
  return sandbox.api;
}

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
