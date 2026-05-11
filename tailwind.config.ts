import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      // ===== 字体 =====
      // body: 变量字体（Inter Latin + Noto Sans SC 中文）通过 globals.css 接 next/font 注入 CSS 变量
      // 这里把 sans 指向 CSS 变量，所有 Tailwind 字体类自动用上
      fontFamily: {
        sans: ['var(--font-sans)', '-apple-system', 'BlinkMacSystemFont', '"PingFang SC"', '"Hiragino Sans GB"', '"Microsoft YaHei"', 'sans-serif'],
      },

      // ===== 颜色 =====
      colors: {
        // 品牌色 —— 设计 V2 后只在主 CTA / 价格 / Logo 出现（≤5% 覆盖）
        brand: {
          DEFAULT: '#7B1113',
          dark: '#5a0c0e',
        },
        accent: '#CF4420',

        // 类目色系：6 个 hue，柔和不刺眼；用于 chip + 卡片小圆点 + 边带
        // 选 Tailwind 500/600 区间，对应 Material 3 "tertiary" tonal range
        cat: {
          home:        '#10B981', // emerald-500 —— 家居家具（生活感 / 自然）
          electronics: '#3B82F6', // blue-500    —— 电子产品（科技 / 冷调）
          transport:   '#F59E0B', // amber-500   —— 交通工具（出行 / 活力）
          books:       '#8B5CF6', // violet-500  —— 书本教材（学院 / 文化）
          housing:     '#EC4899', // pink-500    —— 房屋租赁（温暖 / 居家）
          other:       '#64748B', // slate-500   —— 其他（中性兜底）
        },

        // 新鲜度色：从"刚发布"到"陈旧"四档
        fresh: {
          new:   '#10B981', // emerald-500，24h 内绿点
          today: '#6B7280', // gray-500，今天
          old:   '#9CA3AF', // gray-400，一周内
          stale: '#D1D5DB', // gray-300，1 月+，视觉降权
        },
      },

      // ===== 阴影：Material 3 风的弱投影 + tint =====
      // 默认 shadow 太刺，自定义柔和的
      boxShadow: {
        'card':       '0 1px 2px 0 rgb(0 0 0 / 0.04), 0 1px 3px 0 rgb(0 0 0 / 0.06)',
        'card-hover': '0 2px 4px -1px rgb(0 0 0 / 0.06), 0 4px 8px -2px rgb(0 0 0 / 0.08)',
        'sheet':      '0 -2px 8px -1px rgb(0 0 0 / 0.08)', // 底部 sheet
        'overlay':    '0 8px 24px -4px rgb(0 0 0 / 0.12), 0 4px 8px -2px rgb(0 0 0 / 0.08)', // popup / dropdown
      },

      // ===== 圆角：Material 3 偏好大圆角 =====
      borderRadius: {
        'card': '14px',  // 卡片
        'chip': '999px', // 胶囊（filter chip / type chip）
      },

      // ===== 动效 timing =====
      transitionTimingFunction: {
        'spring': 'cubic-bezier(0.34, 1.56, 0.64, 1)', // 轻弹（按下抬起）
        'smooth': 'cubic-bezier(0.4, 0, 0.2, 1)',      // Material standard
      },
      transitionDuration: {
        '250': '250ms',
      },
    },
  },
  plugins: [],
};

export default config;
