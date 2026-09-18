// Sprint 10D:/admin 的「AI 费用」小节(服务端组件,自己取数)。
// 单独成文件是为了不再往 1300 行的 admin/page.tsx 里加逻辑(ARCHITECTURE §9 雷区)。
// 数据源:LlmUsage 表(lib/llmUsage.ts)。日期按 UTC;费用是按高峰价估的上限,不是账单。

import { usageSummary, dailyBudgetUsd, dayKey, type UsageSummary } from '@/lib/llmUsage';
import { isSearchAiEnabled } from '@/lib/search/hybrid';

const EMPTY: UsageSummary = { costUsd: 0, calls: 0, chatCalls: 0, embedCalls: 0, unsettled: 0, rejected429: 0, rejected503: 0 };

function Stat({ label, value, hint, warn }: { label: string; value: string; hint?: string; warn?: boolean }) {
  return (
    <div className={`bg-white border rounded-lg p-3 ${warn ? 'border-amber-300 bg-amber-50' : 'border-stone-200'}`}>
      <div className="text-xs text-stone-500">{label}</div>
      <div className="text-xl font-semibold tabular-nums">{value}</div>
      {hint && <div className="text-[11px] text-stone-400 mt-0.5">{hint}</div>}
    </div>
  );
}

export async function AiCostSection() {
  const now = new Date();
  const today = dayKey(now);
  let day = EMPTY, month = EMPTY, failed = false;
  try {
    [day, month] = await Promise.all([usageSummary(today), usageSummary(today.slice(0, 7))]);
  } catch {
    failed = true; // 计费表读不到:此时对话接口也会 fail closed(503),面板如实说明
  }
  const budget = dailyBudgetUsd();
  const enabled = isSearchAiEnabled();
  const tripped = budget === 0 || day.costUsd >= budget;

  return (
    <section className="mb-8">
      <h2 className="text-lg font-semibold mb-1">🤖 AI 费用(语义搜索 + 对话)</h2>
      <p className="text-xs text-stone-500 mb-3">
        总开关 <strong>{enabled ? '开' : '关'}</strong>
        {' · '}单日预算 ${budget}{budget === 0 && '(= 对话已关闭)'}
        {' · '}日期按 UTC;费用按 DeepSeek 高峰价估算,是上限不是账单
      </p>
      {failed ? (
        <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-sm text-rose-800">
          读不到计费表(LlmUsage)。此状态下对话接口会返回 503(fail closed),语义搜索与关键词搜索不受影响。
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label={`今日费用(${today})`} value={`$${day.costUsd.toFixed(4)}`} hint={tripped ? '已触发预算熔断,对话关闭到 UTC 次日' : `预算剩余 $${Math.max(0, budget - day.costUsd).toFixed(4)}`} warn={tripped} />
          <Stat label="本月费用" value={`$${month.costUsd.toFixed(4)}`} hint={`${month.calls} 次调用`} />
          <Stat label="今日调用" value={String(day.calls)} hint={`对话 ${day.chatCalls} · embedding ${day.embedCalls}${day.unsettled ? ` · 未结算 ${day.unsettled}` : ''}`} warn={day.unsettled > 0} />
          <Stat label="今日被拒" value={`${day.rejected429} / ${day.rejected503}`} hint="429 配额 / 503 熔断或计费不可用(被刷时为下限)" warn={day.rejected503 > 0} />
        </div>
      )}
    </section>
  );
}
