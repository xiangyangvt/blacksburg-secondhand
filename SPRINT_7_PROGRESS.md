# Sprint 7 Phase 3B

最后更新: 2026-05-17 23:30 ET — 主体完成,仅剩自动归档 + 测试

## §3 数据模型

- [x] Event 表加 maxAttendees + status=fulfilled
- [x] EventContactSend 加 nickname + note
- [x] 砍 Reddit 数据 + 删 sources 文件 + 删 discussion 类目
- [x] 新建 MagicLinkToken + UserSession
- [x] schema.prisma + schema.production.prisma 同步 + migration

## §4 Event 通用化 UX

- [x] EventPostModal 极简化 + 类目自动猜
- [x] EventCard 渲染 (响应数 / 倒计时 / 状态 badge)
- [x] "发送联系方式" 响应 modal
- [x] 发起人面板扩展 (MyEventsPanel)
- [x] 响应者面板 (MyPostsPanel - 需协调 merge)
- [ ] 自动归档 (lazy 或 cron)
- [x] "复制到微信群" 按钮 + emoji 字典

## §5 信息流首屏

- [x] live sticky 区 + pulse 动效 + 折叠状态

## §6 动态 OG 卡片

- [x] /api/og/event/[id] 路由 (动态 / 降级)
- [x] generateMetadata for /localnews/event/[id]

## §7 Magic-link 登录

- [x] /api/auth/magic-link send + verify
- [x] Resend 集成 + 邮件模板 + .env.example
- [x] getSession 中间件 (src/lib/auth.ts)
- [x] 集成到三个发布表单顶部条
- [x] localStorage hb_user_profile 统一

## §8 测试

- [ ] 单元测试 (Vitest/Jest)
- [ ] E2E (Playwright)
