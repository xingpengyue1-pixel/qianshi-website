import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { parse } from "node-html-parser";

const SITE_ORIGIN = "https://site.local";
const SKIP_DIRS = new Set(["node_modules"]);

export function listHtmlFiles(root, dir = root) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || SKIP_DIRS.has(entry.name)) continue;
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...listHtmlFiles(root, abs));
    else if (entry.isFile() && entry.name.endsWith(".html")) {
      files.push(path.relative(root, abs).split(path.sep).join("/"));
    }
  }
  return files.sort();
}

export function classify(raw) {
  if (raw == null || raw === "" || raw.startsWith("javascript:") || raw.startsWith("data:")) {
    return { kind: "invalid", raw: raw ?? "" };
  }
  if (raw.startsWith("mailto:")) return { kind: "mailto", raw };
  if (raw.startsWith("tel:")) return { kind: "tel", raw };
  if (/^https?:\/\//i.test(raw)) return { kind: "external", raw };
  return { kind: "local", raw };
}

export function resolveLocal(pageFile, raw) {
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

export function pageReferences(document) {
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

// 连接失败、超时和 HTTP 错误都要报出来。不按主机放行。
export function reportExternalFailure(page, url, error) {
  return `${page} -> ${url}: ${error.message}`;
}

export function visitReferences(root, hooks = {}) {
  const external = new Map();
  const { onImage, onInvalid, onTel, onLocal } = hooks;
  for (const name of listHtmlFiles(root)) {
    const document = parse(readFileSync(path.join(root, name), "utf8"));
    if (onImage) {
      for (const image of document.querySelectorAll("img")) onImage(name, image);
    }
    for (const raw of pageReferences(document)) {
      const kind = classify(raw);
      if (kind.kind === "invalid") {
        if (onInvalid) onInvalid(name, raw);
        else throw new Error(`${name} 含有无效链接: ${raw}`);
        continue;
      }
      if (kind.kind === "tel") {
        onTel?.(name, kind.raw);
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
      onLocal?.(name, kind.raw, local);
    }
  }
  return external;
}
