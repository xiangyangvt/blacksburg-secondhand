// Event 微信群分享文本生成器
//
// 设计:微信群只能渲染纯文本/emoji,没法用 Lucide icon。
// 所以 UI 上其它地方都用 Lucide,**只有 share text 里保留 emoji** — deliberate。
//
// 格式: `{emoji} {标题} · {状态摘要} · {url}`
// 状态摘要语义:
//   - fulfilled / canceled / expired: 显终态
//   - active + maxAttendees + responseCount: "想凑 N 人 · 已 M 响应"
//   - active + maxAttendees + 0 response: "想凑 N 人"
//   - active + 无 maxAttendees + responseCount > 0: "已 M 响应"
//   - active + 无 maxAttendees + 0 响应: 空(不带状态)

// 类目 emoji 字典 — 跟 EventCard 的 Lucide icon 一一对应
const CATEGORY_EMOJI: Record<string, string> = {
  life:        '🍽️',
  exercise:    '🏀',
  academic:    '📚',
  competition: '🏆',
  other:       '📍',
  // 旧 ID 兜底(防止 stale 数据)
  events:      '🍽️',
  sports:      '🏆',
  discussion:  '💬',
  news:        '💬',
};

/**
 * 检测标题前 2 字符里是否已经有 emoji — 如果有就不再前缀加。
 * 用简单 unicode 范围,不追求 100% 严格 — 漏报后果只是多个 emoji,无害。
 */
function titleStartsWithEmoji(title: string): boolean {
  if (!title) return false;
  // 取前 2 个 code point(不是 chars,避免 surrogate pair 误判)
  const head = Array.from(title).slice(0, 2).join('');
  // unicode emoji 主要范围 + Misc Symbols + Dingbats + 国旗(regional indicator)
  // 注:简单 regex,边角案例不追求完整覆盖
  return /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F1E6}-\u{1F1FF}]/u.test(head);
}

export function buildEventShareText(
  event: {
    id: string;
    title: string;
    category: string | null;
    status?: string;
    maxAttendees?: number | null;
    responseCount?: number;
  },
  origin: string,
): string {
  const cat = event.category ?? 'other';
  const emoji = CATEGORY_EMOJI[cat] ?? '📍';
  const title = event.title || '未命名活动';

  // 状态摘要
  const status = event.status ?? 'active';
  let statusText = '';
  if (status === 'fulfilled') {
    statusText = '已结清';
  } else if (status === 'canceled') {
    statusText = '已取消';
  } else if (status === 'expired') {
    statusText = '已过期';
  } else {
    // active
    const max = event.maxAttendees ?? null;
    const resp = event.responseCount ?? 0;
    if (max && max > 0) {
      statusText = resp > 0 ? `想凑 ${max} 人 · 已 ${resp} 响应` : `想凑 ${max} 人`;
    } else if (resp > 0) {
      statusText = `已 ${resp} 响应`;
    } else {
      statusText = ''; // 空 — 不带状态
    }
  }

  const url = `${origin}/localnews/event/${event.id}`;
  const titleWithEmoji = titleStartsWithEmoji(title) ? title : `${emoji} ${title}`;

  // 拼接,跳过 empty 段
  const parts = [titleWithEmoji];
  if (statusText) parts.push(statusText);
  parts.push(url);
  return parts.join(' · ');
}
