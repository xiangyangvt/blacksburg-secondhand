// 钥匙+心 复合图标(Sprint 6.7d)
// 室友心愿单专用 —— 跟二手"袋+心"形成对称(都是各自领域的"工具+心")
// 视觉:心形钥匙头(top-left)+ 斜杆 + 短齿
//
// fill prop 控制心部是否填充:
//   - 未收藏(inactive):心部 outline,跟 key 一致 stroke 风格
//   - 已收藏(active):心部填充 currentColor

export function KeyHeartIcon({
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
      {/* 心形钥匙头(top-left,tip 朝右下) */}
      <path
        d="M7.5 11.5 C 3 8 2 6 2 4.5 C 2 3 3 2 4.3 2 C 5.3 2 6.5 2.5 7.5 4 C 8.5 2.5 9.7 2 10.7 2 C 12 2 13 3 13 4.5 C 13 6 12 8 7.5 11.5 Z"
        fill={fill ? 'currentColor' : 'none'}
      />
      {/* 钥匙杆 */}
      <line x1="9" y1="10" x2="20" y2="21" />
      {/* 钥匙齿 */}
      <line x1="16.5" y1="17.5" x2="14.5" y2="19.5" />
    </svg>
  );
}
