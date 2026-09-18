'use client';

// Sprint 10B-2:关键词层在**客户端**过滤的站点(室友 / 活动)共用的第 1 层 hook。
//
// 这两个站的列表一次取回(≤ 200 / ≤ 100 条),搜索框是本地过滤;语义层走 GET /api/search,
// 用 kw=<本地命中数> 告诉服务端该 auto 还是 button。两段式与首页一致:
//   semantic=0(不算 embedding、不消耗配额)拿 aiEnabled / trigger → auto 才发 semantic=1
// 请求版本号:查询词 / 筛选一变就 +1,晚到的旧响应一律丢弃;新查询开始立即清空旧语义态。
// 语义结果回来后按"当前本地已展示的 id"再过滤一次(服务端不知道本地命中了哪些)。

import { useCallback, useEffect, useRef, useState } from 'react';
import { EMPTY_SEMANTIC, type SemanticState } from '@/components/SemanticResults';

/** 与服务端 lib/search/hybrid.ts 的 AUTO_TRIGGER_BELOW 同值;只用来决定要不要因为命中数跨过阈值而重新请求 */
const AUTO_TRIGGER_BELOW = 5;

export function useSemanticLayer<T extends { id: string }>(opts: {
  site: 'listings' | 'events';
  /** 搜索框当前值(未防抖);hook 内部防抖 300ms */
  q: string;
  /** 与该站列表接口同名的筛选参数(不含 q / kw / semantic) */
  params: Record<string, string>;
  /** 本地关键词层当前展示的 id */
  keywordIds: readonly string[];
  /** 列表还在加载 / 视图不适用时传 false:不发请求、不渲染 */
  enabled: boolean;
}): { state: SemanticState<T>; requestMore: () => void; debouncedQ: string } {
  const [state, setState] = useState<SemanticState<T>>(EMPTY_SEMANTIC as SemanticState<T>);
  const [debouncedQ, setDebouncedQ] = useState(opts.q.trim());
  const seq = useRef(0);
  const shown = useRef<Set<string>>(new Set());
  shown.current = new Set(opts.keywordIds);

  useEffect(() => {
    const next = opts.q.trim();
    if (next === debouncedQ) return;
    const id = setTimeout(() => setDebouncedQ(next), 300);
    return () => clearTimeout(id);
  }, [opts.q, debouncedQ]);

  const paramsKey = JSON.stringify(opts.params);
  const kw = opts.keywordIds.length;
  const auto = kw < AUTO_TRIGGER_BELOW;

  const buildUrl = useCallback((semantic: '0' | '1') => {
    const sp = new URLSearchParams(JSON.parse(paramsKey) as Record<string, string>);
    sp.set('site', opts.site);
    sp.set('q', debouncedQ);
    sp.set('kw', String(kw));
    sp.set('semantic', semantic);
    return `/api/search?${sp}`;
  }, [paramsKey, opts.site, debouncedQ, kw]);

  const requestSemantic = useCallback(async (my: number) => {
    if (my !== seq.current) return;
    setState(s => ({ ...s, loading: true, requested: true }));
    try {
      const res = await fetch(buildUrl('1'));
      const data = await res.json();
      if (my !== seq.current) return;
      const list: T[] = (data.semantic ?? []).filter((it: T) => !shown.current.has(it.id));
      setState(s => ({ ...s, loading: false, list, limited: res.status === 429 || !!data.limited }));
    } catch {
      if (my !== seq.current) return;
      setState(s => ({ ...s, loading: false, list: [], requested: false }));
    }
  }, [buildUrl]);

  // 查询词 / 筛选 / "命中数是否跨过 auto 阈值"变化 → 重新走两段式
  useEffect(() => {
    const my = ++seq.current;
    setState(EMPTY_SEMANTIC as SemanticState<T>);
    if (!opts.enabled || !debouncedQ) return;
    (async () => {
      try {
        const res = await fetch(buildUrl('0'));
        const data = await res.json();
        if (my !== seq.current) return;
        setState({ aiEnabled: !!data.aiEnabled, trigger: data.trigger ?? null, list: [], loading: false, requested: false, limited: false, chatEnabled: false });
        if (data.aiEnabled && data.trigger === 'auto') void requestSemantic(my);
      } catch { /* 第 1 层失败 = 没有第 1 层,第 0 层不受影响 */ }
    })();
    // buildUrl 随 kw 逐条变化;只在 auto 档位变化时才值得重发,所以依赖 auto 而不是 kw
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.enabled, opts.site, debouncedQ, paramsKey, auto]);

  // 本地列表变了(比如切了日期筛选)→ 已拿到的语义结果按新的已展示 id 再滤一遍
  useEffect(() => {
    setState(s => (s.list.some(it => shown.current.has(it.id)) ? { ...s, list: s.list.filter(it => !shown.current.has(it.id)) } : s));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.keywordIds.join(',')]);

  const requestMore = useCallback(() => { void requestSemantic(seq.current); }, [requestSemantic]);

  return { state, requestMore, debouncedQ };
}
