// /my 路由兼容旧链接 —— 内部直接渲染 MyPostsStandalone
// 新流程已经把"我的发布"做成主页 inline 面板（不跳页面）
// 这个页面保留是为了不让分享出去的 /my 链接 404

import { MyPostsStandalone } from '@/components/MyPostsPanel';

export default function MyPage() {
  return <MyPostsStandalone />;
}
