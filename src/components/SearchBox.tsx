'use client';

// 搜索框(Sprint 6.6 调整):始终展开,桌面 / 移动同款,只是宽度不同
// 之前的 icon-collapse 模式被 Sean 砍了 —— 移动也不挤,直接展开更直接
//
// Sprint 11E:统一问询栏。传了 `ask` 的站点(v1 只有二手站),这一个栏同时是搜索、问 AI、问站长的入口:
//   - 打字 → 关键词搜索照常(免费,不调模型)
//   - 回车 / 点右侧按钮 → onAsk(把当前输入当一句话交给对话)
// 视觉(Sean 2026-09-18:借「AI 助手」的炫彩识别,但要轻量、静态,不带走注意力):
//   - 未聚焦:和原来一样朴素,只有图标是静态渐变星芒
//   - 聚焦:边框变一圈多色渐变环 + 一层很淡的柔光 —— 颜色只在用户注意力已经落到这里时才出现
//   - 没有持续动效:颜色不流动不呼吸,只有 200ms 的淡入淡出;纯 CSS,零 JS
// 不传 `ask` 的站点与改动前像素级一致。

import { Search, Sparkles, ArrowUp } from 'lucide-react';

const GRAD_ID = 'hb-ask-grad';
// 一条首尾相接的多色环:靛 → 蓝 → 青 → 绿 → 琥珀 → 玫红 → 紫 → 靛。用 conic 让颜色沿着胶囊一圈走,
// 任何位置相邻两色都接得上,没有线性渐变在两端突然断掉的接缝——这是「线条平滑」的主要来源
const RING = 'conic-gradient(from 200deg at 50% 50%, #6366f1, #3b82f6, #06b6d4, #10b981, #f59e0b, #f43f5e, #d946ef, #6366f1)';
const BUTTON = 'linear-gradient(135deg, #6366f1 0%, #06b6d4 45%, #f59e0b 80%, #ec4899 100%)';

export function SearchBox({
  value,
  onChange,
  placeholder,
  ask,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  /** 统一问询:showButton = 对话可用(AI 开且未熔断)时才显示右侧按钮;回车始终触发 onAsk,由调用方决定做什么 */
  ask?: { onAsk: () => void; showButton: boolean; buttonLabel: string };
}) {
  // Sprint 7.2 跨页面对齐:Sean 反馈 mobile 上 / 跟 /roommates 搜索框宽度差异
  // 即使两个页面 header 结构代码一模一样,flex-1 在动态 layout 中可能因为相邻
  // 元素 mount/measure 时机不同导致最终像素宽不一致(Chrome / Safari 都有这种情况)
  // 治根:mobile 端也加硬性 max-width,sm+ 用固定 w —— 两个页面都强制 cap 到同一像素宽
  if (!ask) {
    return (
      <div className="flex-1 min-w-0 max-w-[160px] sm:max-w-none sm:flex-none sm:w-[220px] relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 pointer-events-none" />
        <input
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full bg-stone-100 border border-transparent rounded-chip pl-9 pr-3 py-2 text-sm focus:outline-none focus:bg-white focus:border-stone-300 transition-colors"
        />
      </div>
    );
  }

  const canAsk = ask.showButton && value.trim().length > 0;
  return (
    // 渐变环的做法(Sean 2026-09-18 二轮:线条更平滑舒服、边框色彩更多):
    //   - 外层 1.5px padding 是「边框槽」;槽里垫两层同一条多色渐变——一层清晰的环,一层模糊的柔光(静态,不流动)
    //   - 两层用 opacity 过渡(背景渐变本身不能过渡):未聚焦 0,悬停露一点,聚焦全显。200ms 淡入淡出,没有持续动效
    //   - 输入框自己不透明,盖住中间,只露出一圈。尺寸与无 ask 版本只差 0.5px
    // 手机上一句话在 160px 里打不下:聚焦时临时铺满顶栏(绝对定位盖住两侧),失焦还原
    <form
      onSubmit={(e) => { e.preventDefault(); if (value.trim()) ask.onAsk(); }}
      className="group flex-1 min-w-0 max-w-[160px] sm:max-w-none sm:flex-none sm:w-[260px] relative rounded-full p-[1.5px] max-sm:focus-within:absolute max-sm:focus-within:inset-x-3 max-sm:focus-within:max-w-none max-sm:focus-within:z-10"
      role="search"
    >
      <span aria-hidden className="pointer-events-none absolute -inset-0.5 rounded-full blur-md opacity-0 group-focus-within:opacity-40 transition-opacity duration-200 ease-out" style={{ background: RING }} />
      <span aria-hidden className="pointer-events-none absolute inset-0 rounded-full opacity-0 group-hover:opacity-50 group-focus-within:opacity-100 transition-opacity duration-200 ease-out" style={{ background: RING }} />
      <svg width="0" height="0" className="absolute" aria-hidden>
        <defs>
          <linearGradient id={GRAD_ID} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#6366f1" />
            <stop offset="35%" stopColor="#06b6d4" />
            <stop offset="65%" stopColor="#f59e0b" />
            <stop offset="100%" stopColor="#ec4899" />
          </linearGradient>
        </defs>
      </svg>
      <Sparkles size={15} stroke={`url(#${GRAD_ID})`} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none z-[1]" />
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        enterKeyHint={ask.showButton ? 'send' : 'search'}
        // 回车显式处理(不只靠表单的隐式提交:部分环境合成的回车不触发)。中文输入法选词的回车不算
        onKeyDown={(e) => {
          if (e.key !== 'Enter' || e.nativeEvent.isComposing || e.keyCode === 229) return;
          e.preventDefault();
          if (value.trim()) ask.onAsk();
        }}
        maxLength={300}
        // 聚焦时 16px:iOS 小于 16px 的输入框聚焦会自动放大页面
        className={`relative block w-full bg-stone-100 rounded-full pl-9 ${canAsk ? 'pr-10' : 'pr-3'} py-2 text-sm max-sm:focus:text-base focus:outline-none focus:bg-white transition-colors duration-200`}
      />
      {canAsk && (
        <button
          type="submit"
          // 不抢输入框焦点:手机上失焦会让栏缩回 160px,按钮位置一变这次点击就落空
          onMouseDown={(e) => e.preventDefault()}
          aria-label={ask.buttonLabel}
          title={ask.buttonLabel}
          data-testid="ask-button"
          className="absolute right-1.5 top-1/2 -translate-y-1/2 z-[1] inline-flex items-center justify-center w-7 h-7 rounded-full text-white shadow-sm"
          style={{ background: BUTTON }}
        >
          <ArrowUp size={15} strokeWidth={2.5} />
        </button>
      )}
    </form>
  );
}
