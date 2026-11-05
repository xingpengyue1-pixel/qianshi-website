# 潜势科技官网

潜势科技官网是一个纯静态站点，介绍面向央国企、公共机构与专业服务组织的一体化服务：新媒体运营、内容传播、经营转化、人才培养与组织咨询。

站点目前有四个页面。样式和交互脚本都写在各自的 HTML 里，图片是 SVG，没有构建步骤，也没有后端。改完页面可以直接预览。

联系页的咨询由表单服务「金数据」收集。页面按金数据的 iframe 方式嵌入 `https://b6p2zqjy.jsjform.com/f/yt8gjZ`（`embedded=true`，宽度 100%），并提供「在新窗口打开表单」。电话 186 1120 6321 留在页面上，作为备用联系方式。提交后的说明只写会收到并尽快联系，不写具体时限。页脚注明表单由金数据提供。

## 目录结构

```
.
├── index.html              首页
├── products.html           业务与服务
├── about.html              关于我们
├── contact.html            联系我们
├── images/                 标志与插图（SVG）
├── tests/site.test.mjs     静态检查
├── .htmlvalidate.json      HTML 校验规则
├── .github/workflows/ci.yml
├── package.json            仅测试使用，站点本身不依赖它
└── .nojekyll               让 GitHub Pages 按原样发布静态文件
```

上线需要的是四个 HTML 和 `images/`。`tests/`、`package.json` 和 CI 配置不必部署。

## 本地预览

在仓库根目录启动一个静态文件服务：

```bash
python3 -m http.server 8080
```

浏览器打开 <http://127.0.0.1:8080/>。四个页面分别是 `/`、`/products.html`、`/about.html`、`/contact.html`。

资源都是相对路径，直接用浏览器打开 `index.html` 也能看。用上面的本地服务更接近实际上线后的路径。

## 部署

这是纯静态文件，上传后即可访问，不需要安装依赖或执行构建。入口文件是 `index.html`。

- **任意静态托管**（Nginx、对象存储、CDN）：把四个 HTML 和 `images/` 放到站点根目录。Nginx 把 `root` 指到该目录，默认文档设为 `index.html`。
- **GitHub Pages**：在仓库 Settings → Pages 中选择从 `main` 分支的根目录发布。仓库根目录已有空文件 `.nojekyll`，Pages 会跳过 Jekyll，原样提供这些 HTML。
- 不要把 `node_modules/` 传上去。测试依赖只在开发和 CI 里使用。

本仓库的 GitHub Actions 只跑检查，不会自动部署。

## 测试

检查三项内容：

1. **HTML 校验**：用 [html-validate](https://html-validate.org/) 的 recommended 规则检查根目录每个 `.html`。
2. **死链**：页内链接、图片、样式表和图标必须指向仓库里存在的文件；带 `#锚点` 的链接必须命中目标页面上唯一的 `id`。`http(s)` 资源会实际请求一次（当前是 Google Fonts 样式表）。
3. **关键元素**：每个页面都要有语言、标题、描述、唯一的 `h1`、页头页脚、回首页的品牌链接和移动菜单；首页锚点、五段业务、关于页时间线要在。联系页要有电话 186 1120 6321、金数据 iframe，以及「在新窗口打开表单」。

规则有三条例外，写在 `.htmlvalidate.json` 里：

- `no-inline-style`：样式就写在各页面里，这条会报出大量与正确性无关的问题。
- `no-implicit-button-type`、`tel-non-breaking`：现有按钮和电话号码的写法会触发它们。引入测试时不改页面，所以不让 CI 因此失败。

需要 Node.js 20 或以上。

```bash
npm ci
npm test
```

只跑 HTML 校验：

```bash
npx html-validate *.html
```

外链检查需要能访问公网。离线时可以跳过：

```bash
SKIP_EXTERNAL_LINKS=1 npm test
```

推送到 `main` 或打开 Pull Request 时，[`.github/workflows/ci.yml`](.github/workflows/ci.yml) 会在 Ubuntu 上执行 `npm ci` 和 `npm test`。
