// Sprint 7 Phase 3B §8.2 — Playwright E2E happy path
//
// 范围:UI + API 层 smoke,不真实发布(避免 DB 状态污染 + 复杂 visitor 隔离)
// - SSR 4 主路由 200 + 关键文字渲染
// - EventPostModal 打开 + 字段顺序按 spec §4.1
// - "想找几人" chip 化 (1/2/3/4/其他)
// - API smoke:/api/events 返 events+availableCategories;/api/auth/me 返 session

import { test, expect, type Page } from '@playwright/test';

// 打开黑堡发布弹窗并等它就绪。click() 返回时弹窗内容不保证已渲染完,
// 之后若用 allTextContents() 这类不自动等待的读取,会偶发读到空/半截 DOM(CI 上出现过)。
async function openEventPostModal(page: Page) {
  await page.goto('/localnews');
  // 等页面 loaded(events fetch)
  await page.waitForLoadState('networkidle');
  // FAB aria-label="发布活动"
  await page.getByRole('button', { name: '发布活动' }).first().click();
  await expect(page.locator('h2').filter({ hasText: '发布活动' })).toBeVisible();
  // 首尾两个字段都在 = 表单整体已渲染
  await expect(page.locator('label').filter({ hasText: '标题' }).first()).toBeVisible();
  await expect(page.locator('label').filter({ hasText: '密码' }).first()).toBeVisible();
}

test.describe('SSR 4 主路由', () => {
  test('/ (二手) 渲染', async ({ page }) => {
    const res = await page.goto('/');
    expect(res?.status()).toBe(200);
    // 站点 OG title 永远在
    await expect(page).toHaveTitle(/黑堡二手买卖/);
  });

  test('/roommates (室友) 渲染', async ({ page }) => {
    const res = await page.goto('/roommates');
    expect(res?.status()).toBe(200);
  });

  test('/localnews (黑堡本地) 渲染 + 看到主标签', async ({ page }) => {
    const res = await page.goto('/localnews');
    expect(res?.status()).toBe(200);
    // 类目 chip "全部" 是兜底文字,所有 events 都看得到
    await expect(page.getByText('全部', { exact: true }).first()).toBeVisible();
  });

  test('/my (我的) 渲染', async ({ page }) => {
    const res = await page.goto('/my');
    expect(res?.status()).toBe(200);
  });

  test('/localnews/event/notexist → 404', async ({ page }) => {
    const res = await page.goto('/localnews/event/notexist', { waitUntil: 'commit' });
    expect(res?.status()).toBe(404);
  });
});

test.describe('EventPostModal (黑堡发布弹窗)', () => {
  test('点 ➕ 打开 modal + 标题"发布活动"', async ({ page }) => {
    // 弹窗里"发布活动"标题(h2)可见即通过(断言在 helper 内)
    await openEventPostModal(page);
  });

  test('字段顺序符合 spec §4.1', async ({ page }) => {
    await openEventPostModal(page);

    // spec §4.1 顺序:标题 → 时间 → 想找几人 → 类目 → 联系方式 → 昵称 → 地点 → 描述 → 密码
    const expectedOrder = [
      '标题', '开始时间', '结束时间', '想找几人', '类别',
      '联系方式', '发布者昵称', '地点', '描述', '密码',
    ];
    // 抓所有 field labels(按 DOM 顺序)。allTextContents() 不自动等待,
    // 所以轮询到全部期望字段都出现,再比较顺序
    let labels: string[] = [];
    await expect.poll(async () => {
      labels = await page.locator('label').allTextContents();
      return expectedOrder.filter(exp => !labels.some(l => l.includes(exp)));
    }, { message: '弹窗内应包含全部期望字段' }).toEqual([]);
    // 过滤掉 contact "公开显示" 之类的 checkbox label,只看主字段
    const mainFields = labels.filter(l =>
      /标题|开始时间|结束时间|想找几人|类别|联系方式|发布者昵称|地点|描述|密码/.test(l)
    );
    let prevIndex = -1;
    for (const exp of expectedOrder) {
      const idx = mainFields.findIndex((l, i) => i > prevIndex && l.includes(exp));
      expect(idx, `字段「${exp}」未按预期顺序出现`).toBeGreaterThan(prevIndex);
      prevIndex = idx;
    }
  });

  test('"想找几人" chip 化:1 / 2 / 3 / 4 / 其他 都可点击', async ({ page }) => {
    await openEventPostModal(page);

    // 1/2/3/4 是想找几人专属(类目 chip 用文字 "生活/运动/..." 不冲突)
    for (const n of ['1', '2', '3', '4']) {
      await expect(page.getByRole('button', { name: n, exact: true })).toBeVisible();
    }
    // "其他" 共 2 个(想找几人 + 类目),按 spec §4.1 顺序"想找几人"先于"类目",
    // 所以 first() 是想找几人的"其他"
    const otherChip = page.getByRole('button', { name: '其他', exact: true }).first();
    await expect(otherChip).toBeVisible();
    await otherChip.click();
    // 自填 input 出现 — placeholder "人数"
    await expect(page.getByPlaceholder('人数')).toBeVisible();
  });
});

test.describe('API smoke', () => {
  test('GET /api/events 返 events + availableCategories', async ({ request }) => {
    const res = await request.get('/api/events?limit=5');
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data).toHaveProperty('events');
    expect(Array.isArray(data.events)).toBe(true);
    expect(data).toHaveProperty('availableCategories');
  });

  test('GET /api/search?site=items&q=x 返 keyword/semantic/aiEnabled/trigger(10B;CI 无 key → aiEnabled=false)', async ({ request }) => {
    const res = await request.get('/api/search?site=items&q=x');
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data.keyword)).toBe(true);
    expect(data.semantic).toEqual([]);
    expect(data.aiEnabled).toBe(false);
    expect(data.chatEnabled).toBe(false);
    expect(['auto', 'button']).toContain(data.trigger);
    expect(JSON.stringify(data)).not.toMatch(/contactValue":"[^"]|ipAddress|editCodeHash|embeddingJson/);
  });

  test('POST /api/search/chat:AI 关闭(CI 无 key)→ 404,不泄露任何内容(10C)', async ({ request }) => {
    const res = await request.post('/api/search/chat', { data: { site: 'items', message: '找个书桌', history: [] } });
    expect(res.status()).toBe(404);
  });

  test('GET /api/search 无 q → 400;未知 site → 400', async ({ request }) => {
    expect((await request.get('/api/search?site=items')).status()).toBe(400);
    expect((await request.get('/api/search?site=bogus&q=x')).status()).toBe(400);
  });

  test('GET /api/search site=listings / events(10B-2):同一响应形状,chatEnabled 恒 false,白名单', async ({ request }) => {
    for (const site of ['listings', 'events']) {
      const res = await request.get(`/api/search?site=${site}&q=x&kw=0`);
      expect(res.status(), site).toBe(200);
      const data = await res.json();
      expect(data.keyword).toEqual([]);
      expect(data.semantic).toEqual([]);
      expect(data.aiEnabled).toBe(false);
      expect(data.chatEnabled).toBe(false);
      expect(data.trigger).toBe('auto');
      expect(JSON.stringify(data)).not.toMatch(/ipAddress|editCodeHash|posterCodeHash|posterVisitorId|embeddingJson/);
    }
    const many = await (await request.get('/api/search?site=events&q=x&kw=9')).json();
    expect(many.trigger).toBe('button');
  });

  test('GET /api/events?category=discussion 永久返空(spec §3.4)', async ({ request }) => {
    const res = await request.get('/api/events?category=discussion');
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data.events).toEqual([]);
  });

  test('GET /api/auth/me 未登录返 { session: null }', async ({ request }) => {
    const res = await request.get('/api/auth/me');
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data.session).toBeNull();
  });

  test('POST by-contact 无密码 → 401', async ({ request }) => {
    const res = await request.post('/api/items/by-contact', {
      data: { value: 'test' },
    });
    expect(res.status()).toBe(401);
  });

  test('POST /api/admin/cleanup-reddit 无 cookie → 401', async ({ request }) => {
    const res = await request.post('/api/admin/cleanup-reddit');
    expect(res.status()).toBe(401);
  });
});
