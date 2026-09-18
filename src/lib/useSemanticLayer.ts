'use client';

// Sprint 10B-2:关键词层在**客户端**过滤的站点(室友 / 活动)共用的第 1 层 hook。
//
// 这两个站的列表一次取回(≤ 200 / ≤ 100 条),搜索框是本地过滤;语义层走 GET /api/search。
//   - 先 semantic=0(不算 embedding、不消耗配额)拿 aiEnabled;auto / button 由**本地命中数**决定(< 5 自动)
//   - 每个(查询词 + 服务端筛选)最多自动请求一次语义层,结果缓存在 state 里:
//     本地筛选(日期 / 地区)来回切导致命中数在阈值两侧跳动时,只更新展示,不重发请求、不重复消耗配额(Codex 互审 #4)
//   - 请求带 exclude=<当前已展示的 id>,服务端排除后再取前 10,不会出现"前 10 条全是已展示的、真正的新结果被截掉"(#3)
//   - 展示前再过两道:去掉此刻已在关键词层展示的 id;套页面自己的本地筛选 accept(活动页的日期 / 地区,#1)
//   - 查询一变版本号 +1 并取消在途请求;卸载同理,迟到的响应不会再触发付费请求(#5)

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EMPTY_SEMANTIC, type SemanticState } from '@/components/SemanticResults';

/** 与服务端 lib/search/hybrid.ts 的 AUTO_TRIGGER_BELOW 同值 */
const AUTO_TRIGGER_BELOW = 5;
const MAX_EXCLUDE = 200;

interface Base<T> { aiEnabled: boolean; fetched: T[]; loading: boolean; requested: boolean; limited: boolean }
const EMPTY_BASE: Base<never> = { aiEnabled: false, fetched: [], loading: false, requested: false, limited: false };

export function useSemanticLayer<T extends { id: string }>(opts: {
  site: 'listings' | 'events';
  /** 搜索框当前值(未防抖);hook 内部防抖 300ms */
  q: string;
  /** 与该站列表接口同名的**服务端**筛选参数(不含 q / kw / semantic) */
  params: Record<string, string>;
  /** 本地关键词层当前展示的 id */
  keywordIds: readonly string[];
  /** 列表还在加载 / 视图不适用时传 false:不发请求、不渲染 */
  enabled: boolean;
  /** 页面自己的本地筛选(活动页的日期 / 地区):语义结果也要遵守 */
  accept?: (item: T) => boolean;
}): { state: SemanticState<T>; requestMore: () => void } {
  const [base, setBase] = useState<Base<T>>(EMPTY_BASE);
  const [debouncedQ, setDebouncedQ] = useState(opts.q.trim());
  const seq = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const shownRef = useRef<readonly string[]>(opts.keywordIds);
  shownRef.current = opts.keywordIds;

  useEffect(() => {
    const next = opts.q.trim();
    if (next === debouncedQ) return;
    const id = setTimeout(() => setDebouncedQ(next), 300);
    return () => clearTimeout(id);
  }, [opts.q, debouncedQ]);

  const paramsKey = JSON.stringify(opts.params);
  const auto = opts.keywordIds.length < AUTO_TRIGGER_BELOW;

  const buildUrl = useCallback((semantic: '0' | '1') => {
    const sp = new URLSearchParams(JSON.parse(paramsKey) as Record<string, string>);
    sp.set('site', opts.site);
    sp.set('q', debouncedQ);
    sp.set('kw', String(shownRef.current.length));
    sp.set('semantic', semantic);
    if (semantic === '1' && shownRef.current.length > 0) sp.set('exclude', shownRef.current.slice(0, MAX_EXCLUDE).join(','));
    return `/api/search?${sp}`;
  }, [paramsKey, opts.site, debouncedQ]);

  const requestSemantic = useCallback(async (my: number) => {
    if (my !== seq.current) return;
    const ac = new AbortController();
    abortRef.current?.abort();
    abortRef.current = ac;
    setBase(b => ({ ...b, loading: true, requested: true }));
    try {
      const res = await fetch(buildUrl('1'), { signal: ac.signal });
      const data = await res.json();
      if (my !== seq.current) return;
      setBase(b => ({ ...b, loading: false, fetched: data.semantic ?? [], limited: res.status === 429 || !!data.limited }));
    } catch {
      if (my !== seq.current) return;
      setBase(b => ({ ...b, loading: false, fetched: [], requested: false }));
    }
  }, [buildUrl]);

  // 查询词 / 服务端筛选变了 → 新版本:清空、取消在途、走 semantic=0 拿 aiEnabled。卸载时同样使版本失效并取消
  useEffect(() => {
    const my = ++seq.current;
    abortRef.current?.abort();
    setBase(EMPTY_BASE);
    if (!opts.enabled || !debouncedQ) return;
    const ac = new AbortController();
    abortRef.current = ac;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(buildUrl('0'), { signal: ac.signal });
        const data = await res.json();
        if (cancelled || my !== seq.current) return;
        setBase(b => ({ ...b, aiEnabled: !!data.aiEnabled }));
      } catch { /* 第 1 层失败 = 没有第 1 层,第 0 层不受影响 */ }
    })();
    // 查询变了 / 卸载:迟到的 semantic=0 响应不再 setState,也就不会再触发付费的 semantic=1
    return () => { cancelled = true; ac.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.enabled, opts.site, debouncedQ, paramsKey]);

  // 卸载时取消在途的 semantic=1
  useEffect(() => () => { abortRef.current?.abort(); }, []);

  // 本地命中 < 5 且这个查询还没请求过 → 自动请求一次。命中数之后再怎么跳动都不会重发(requested 已为 true)
  useEffect(() => {
    if (base.aiEnabled && auto && !base.requested && !base.loading) void requestSemantic(seq.current);
  }, [base.aiEnabled, base.requested, base.loading, auto, requestSemantic]);

  const requestMore = useCallback(() => { void requestSemantic(seq.current); }, [requestSemantic]);

  const shownKey = opts.keywordIds.join(',');
  const accept = opts.accept;
  const state = useMemo<SemanticState<T>>(() => {
    if (!base.aiEnabled) return EMPTY_SEMANTIC as SemanticState<T>;
    const shown = new Set(shownRef.current);
    const list = base.fetched.filter(it => !shown.has(it.id) && (!accept || accept(it)));
    return { aiEnabled: true, trigger: auto ? 'auto' : 'button', list, loading: base.loading, requested: base.requested, limited: base.limited, chatEnabled: false };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, auto, shownKey, accept]);

  return { state, requestMore };
}
