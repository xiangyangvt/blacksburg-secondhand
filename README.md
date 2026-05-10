# 黑堡二手买卖 · Blacksburg Secondhand

> 给黑堡（Blacksburg, VA）本地华人/学生社区做的开源二手交易网站。
> An open-source local secondhand marketplace for the Blacksburg, VA community.

**线上地址**：（部署后填写）
**开源协议**：MIT
**反馈**：欢迎在 [Issues](../../issues) 提 bug 或建议，欢迎 [Pull Request](../../pulls)

---

## 中文说明

### 特点
- **完全免登录**：发布时设一个"识别码"，以后用它修改/删除自己发的内容
- **扁平化展示**：所有商品信息（图片、价格、联系方式）一屏全展开，不用点开详情
- **一键复制**：联系方式和"标题+价格"都有复制按钮，方便粘到微信里
- **社区议价**：每个商品下可以折叠展开询价，用自己的联系方式作身份
- **代码层 i18n 基础设施**：messages.ts 中英文案齐全；目前默认中文，未来如果加英文社区只要恢复一个切换按钮即可
- **响应式**：手机/电脑同一个网址；手机上有右下角浮动「+」按钮
- **PWA 支持**：手机浏览器里点"添加到主屏幕"可像 App 一样使用
- **图片浏览**：缩略图点开大图，左右翻页（支持键盘 ← →）
- **开源透明**：所有代码在 GitHub 上，社区可以提 issue 改进

### 本地开发

```bash
# 1. 复制环境变量模板（Cloudinary 不填也能跑）
cp .env.example .env

# 2. 安装依赖
npm install

# 3. 初始化 SQLite 数据库
npm run db:migrate

# 4. （可选）插入示例数据
npm run db:seed

# 5. 启动开发服务器
npm run dev
```

打开 http://localhost:3000 即可看到。

### 图片存储

- **不配置**（默认）：上传图片落到 `public/uploads/`，仅供本地测试
- **配置 Cloudinary**：在 `.env` 填 `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET`，重启 dev server 后所有上传自动走 Cloudinary CDN
- 浏览器访问 `/api/upload` 可看到当前用的是哪种

### 数据库

- **本地**：默认 SQLite（`prisma/schema.prisma`）
- **生产**：PostgreSQL（`prisma/schema.production.prisma`）
- Railway 部署时使用 `npm run build:prod`，自动切换到 Postgres schema

### 使用说明
**发布物品**：点右下角浮动按钮 ➕，填写信息，**记住识别码**（≥6 位，丢了无法找回）。
**修改/删除**：点商品上的「编辑」或「已售出」，输入识别码。
**议价**：点商品下方的「N 条询价」展开，留言用自己的联系方式作身份。

### 部署
本项目部署在 Railway，配置文件见 `Dockerfile`（Phase 4 添加）。

---

## English

A simple, mobile-first, login-free secondhand marketplace built for the
Chinese-speaking community in Blacksburg, Virginia (Virginia Tech area).

### Features
- **No accounts** — sellers set an "edit code" per post to make changes later.
- **Flat layout** — all info visible without clicking into a detail page.
- **One-tap copy** — copy seller contact or "Title — $Price" to paste in WeChat.
- **Buyer inquiries** — collapsible thread under each item, identified by contact info.
- **Open source** — issues and PRs welcome.

### Local Development

```bash
npm install
npm run db:migrate
npm run db:seed   # optional: load demo data
npm run dev
```

Open http://localhost:3000.

### Tech Stack
Next.js 14 · TypeScript · Prisma · SQLite (dev) / PostgreSQL (prod) · Tailwind CSS · Cloudinary (images, in production).

### License
MIT — see [LICENSE](LICENSE).

---

## 禁止内容 / Prohibited
枪支、弹药、毒品、活体动物、违法物品、虚假信息、广告灌水。
违者举报后将被隐藏。Site admin 保留删除任何内容的权利。
