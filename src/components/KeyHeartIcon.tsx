// 房子+心 复合图标(Sprint 6.7e:从钥匙改为房子,小尺寸更清晰)
// 室友心愿单专用 —— "心仪的居所"语义
// 文件名保留 KeyHeartIcon 是历史原因,内部已经是房子+心
//
// fill prop 控制心部是否填充:
//   - 未收藏:心部 outline
//   - 已收藏:心部填充 currentColor

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
      {/* 房子轮廓:斜屋顶 + 矩形 body(底部带轻微圆角) */}
      <path d="M3 11 L12 4 L21 11 V20 a1 1 0 0 1 -1 1 H4 a1 1 0 0 1 -1 -1 Z" />
      {/* 内嵌心(居所中心) */}
      <path
        d="M12 19 C 9 16 7 14 8 12 C 9 11 11 11 12 13 C 13 11 15 11 16 12 C 17 14 15 16 12 19 Z"
        fill={fill ? 'currentColor' : 'none'}
      />
    </svg>
  );
}
