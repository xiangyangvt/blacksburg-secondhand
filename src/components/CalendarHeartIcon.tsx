// 日历 + 心 复合图标(Sprint 7 Phase 1.10:本地活动心愿单)
// "想去的活动"语义 —— 日历表达「事件 / 时间」,心表达「想要 / 喜欢」
// 跟二手的袋子+心、室友的房子+心 同款语法(主体物 + 内嵌心)
//
// fill prop 控制心部是否填充:
//   - 未收藏:心部 outline
//   - 已收藏:心部填充 currentColor

export function CalendarHeartIcon({
  size = 20,
  fill = false,
  strokeWidth = 1.8,
  className = '',
}: {
  size?: number;
  fill?: boolean;
  strokeWidth?: number;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      width={size}
      height={size}
      className={className}
      aria-hidden
    >
      {/* 顶部两根 peg(日历挂耳) */}
      <path d="M8 3 V7" />
      <path d="M16 3 V7" />
      {/* 主体矩形 */}
      <rect x="3" y="5" width="18" height="16" rx="1.5" />
      {/* header 分隔线(模仿日期格栏) */}
      <path d="M3 10 H21" />
      {/* 内嵌心(居中下半区) */}
      <path
        d="M12 18 C 9.5 15.5 8 14.2 8 13 C 8 12.1 8.9 11.5 9.7 11.5 C 10.4 11.5 11.3 12 12 12.8 C 12.7 12 13.6 11.5 14.3 11.5 C 15.1 11.5 16 12.1 16 13 C 16 14.2 14.5 15.5 12 18 Z"
        fill={fill ? 'currentColor' : 'none'}
      />
    </svg>
  );
}
