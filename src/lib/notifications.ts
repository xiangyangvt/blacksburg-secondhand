'use client';

// 通知 badge —— 用户在"我的发布"面板里查过自己后，缓存了 contactValue + editCode
// mount 时后台调一次 by-contact 拉自己最新数据，对比 lastSeenAt 算未读
//
// "未读"定义：
//   - 二手平台：自己 active item 上有 createdAt > lastSeenAt 的 inquiry
//   - 室友平台：自己 active listing 上有 createdAt > lastSeenAt 的 application
//     + 自己发出的 application 在 lastSeenAt 之后 updatedAt 变化（被同意/婉拒）

import { useEffect, useState } from 'react';

const LS_LAST_SEEN_ITEM    = 'hb_last_seen_my_items';
const LS_LAST_SEEN_LISTING = 'hb_last_seen_my_listings';
const LS_CONTACT_V         = 'hb_my_contact_value';
const LS_EDIT_CODE         = 'hb_last_edit_code';
const EVT_SEEN_CHANGED     = 'hb-seen-changed';

export type Platform = 'item' | 'listing';

export function getLastSeenAt(platform: Platform): number {
  if (typeof window === 'undefined') return 0;
  try {
    const key = platform === 'item' ? LS_LAST_SEEN_ITEM : LS_LAST_SEEN_LISTING;
    return parseInt(localStorage.getItem(key) ?? '0', 10) || 0;
  } catch { return 0; }
}

export function markSeen(platform: Platform): void {
  if (typeof window === 'undefined') return;
  try {
    const key = platform === 'item' ? LS_LAST_SEEN_ITEM : LS_LAST_SEEN_LISTING;
    localStorage.setItem(key, String(Date.now()));
    window.dispatchEvent(new CustomEvent(EVT_SEEN_CHANGED));
  } catch {}
}

async function fetchUnread(platform: Platform): Promise<number> {
  if (typeof window === 'undefined') return 0;
  const contactValue = localStorage.getItem(LS_CONTACT_V);
  const editCode = localStorage.getItem(LS_EDIT_CODE) ?? '';
  if (!contactValue) return 0; // 用户从没 lookup 过，没法监测

  const lastSeen = getLastSeenAt(platform);

  try {
    if (platform === 'item') {
      const r = await fetch('/api/items/by-contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: contactValue, editCode }),
      });
      if (!r.ok) return 0;
      const data = await r.json();
      let count = 0;
      for (const it of (data.items ?? [])) {
        for (const inq of (it.inquiries ?? [])) {
          if (new Date(inq.createdAt).getTime() > lastSeen) count++;
        }
      }
      return count;
    } else {
      const [listRes, sentRes] = await Promise.all([
        fetch('/api/listings/by-contact', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ value: contactValue, editCode, withApplications: true }),
        }),
        fetch('/api/applications/by-contact', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ value: contactValue, editCode }),
        }),
      ]);
      let count = 0;
      if (listRes.ok) {
        const data = await listRes.json();
        for (const l of (data.items ?? [])) {
          for (const app of (l.applications ?? [])) {
            if (new Date(app.createdAt).getTime() > lastSeen) count++;
          }
        }
      }
      if (sentRes.ok) {
        const data = await sentRes.json();
        for (const app of (data.items ?? [])) {
          // 我发的申请有状态变化（approved/rejected/cancelled）算未读
          if (app.status !== 'pending' && new Date(app.updatedAt).getTime() > lastSeen) count++;
        }
      }
      return count;
    }
  } catch { return 0; }
}

/** React hook：返回该平台未读数；mount 后台拉一次；其它 markSeen 触发后重新拉 */
export function useUnreadCount(platform: Platform): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let alive = true;
    const update = async () => {
      const n = await fetchUnread(platform);
      if (alive) setCount(n);
    };
    update();
    const onSeen = () => update();
    window.addEventListener(EVT_SEEN_CHANGED, onSeen);
    return () => {
      alive = false;
      window.removeEventListener(EVT_SEEN_CHANGED, onSeen);
    };
  }, [platform]);
  return count;
}
