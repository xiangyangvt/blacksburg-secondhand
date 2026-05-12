'use client';

// 申请联系 modal：B 给 A 的 listing 发申请
// - 跨性别软拦截（前端 UI 警告 + submit 禁用，后端也挡）
// - 自动检测 B 有没有同 contactValue 的 active listing，让他选择是否附上

import { useState, useEffect } from 'react';
import { X, AlertTriangle, Send } from 'lucide-react';
import {
  CONTACT_TYPES,
  LISTING_AGE_RANGES,
  LISTING_TYPES,
  LISTING_GENDERS_UI,
} from '@/lib/utils';
import { getStoredUtmSource } from '@/lib/utm';
import type { Listing } from './ListingCard';

const LS_LAST_CODE      = 'hb_last_edit_code';
const LS_LAST_CONTACT_T = 'hb_my_contact_type';
const LS_LAST_CONTACT_V = 'hb_my_contact_value';

export function ListingApplyModal({
  listing,
  onClose,
  onSent,
}: {
  listing: Listing;
  onClose: () => void;
  onSent: () => void;
}) {
  const [applicantGender, setApplicantGender] = useState<string>('F');
  const [ageRange, setAgeRange] = useState<string>('');
  const [contactType, setContactType] = useState<string>('wechat');
  const [contactValue, setContactValue] = useState('');
  const [customLabel, setCustomLabel] = useState('');
  const [message, setMessage] = useState('');
  const [editCode, setEditCode] = useState('');

  // 检测 B 有没有自己的 listing 可附
  const [myListings, setMyListings] = useState<Array<{ id: string; title: string; type: string }>>([]);
  const [attachMyListing, setAttachMyListing] = useState(false);
  const [selectedAttachId, setSelectedAttachId] = useState<string>('');

  const [submitting, setSubmitting] = useState(false);

  // localStorage 预填
  useEffect(() => {
    try {
      const tp = localStorage.getItem(LS_LAST_CONTACT_T);
      const v  = localStorage.getItem(LS_LAST_CONTACT_V);
      const c  = localStorage.getItem(LS_LAST_CODE);
      if (tp === 'wechat' || tp === 'phone' || tp === 'email' || tp === 'other') setContactType(tp);
      if (v) setContactValue(v);
      if (c) setEditCode(c);
    } catch {}
  }, []);

  // 联系方式变化时查询同名 listing（debounced）
  useEffect(() => {
    const v = contactValue.trim();
    if (!v) {
      setMyListings([]);
      setAttachMyListing(false);
      return;
    }
    const timer = setTimeout(() => {
      fetch(`/api/listings/by-contact?value=${encodeURIComponent(v)}`)
        .then(r => r.ok ? r.json() : { items: [] })
        .then(d => {
          const list = (d.items ?? [])
            .filter((l: any) => l.id !== listing.id) // 排除被申请的这一条
            .map((l: any) => ({ id: l.id, title: l.title, type: l.type }));
          setMyListings(list);
          if (list.length > 0 && !selectedAttachId) {
            setSelectedAttachId(list[0].id);
          }
        })
        .catch(() => setMyListings([]));
    }, 600);
    return () => clearTimeout(timer);
  }, [contactValue, listing.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // 跨性别拦截判断
  const genderBlocked =
    (listing.lookingForGender === 'F-only' && applicantGender !== 'F')
    || (listing.lookingForGender === 'M-only' && applicantGender !== 'M');

  const submit = async () => {
    if (genderBlocked) return;
    if (!contactValue.trim()) return alert('联系方式不能为空');
    if (editCode.length < 6) return alert('识别码至少 6 位');
    if (!message.trim()) return alert('消息不能为空');

    const payload = {
      applicantGender,
      ageRange: ageRange || null,
      contactType,
      contactValue: contactValue.trim(),
      customContactLabel: contactType === 'other' ? (customLabel.trim() || null) : null,
      message: message.trim(),
      editCode,
      attachedListingId: attachMyListing && selectedAttachId ? selectedAttachId : null,
      utmSource: getStoredUtmSource(),
    };

    setSubmitting(true);
    try {
      const res = await fetch(`/api/listings/${listing.id}/applications`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.existingStatus) {
          alert(`你已申请过这条 listing（当前状态：${data.existingStatus}）`);
        } else {
          alert(data.error || '申请失败');
        }
        return;
      }
      try {
        localStorage.setItem(LS_LAST_CODE, editCode);
        localStorage.setItem(LS_LAST_CONTACT_T, contactType);
        localStorage.setItem(LS_LAST_CONTACT_V, contactValue.trim());
      } catch {}
      alert('✓ 申请已发送\n\n对方决定后你能在「我的发布 → 我发的申请」看到结果。');
      onSent();
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-start sm:items-center justify-center overflow-y-auto p-0 sm:p-4">
      <div className="bg-white w-full max-w-lg sm:rounded-lg min-h-screen sm:min-h-0 my-0 sm:my-4">

        <div className="sticky top-0 z-10 bg-white border-b border-stone-200 px-5 py-3 flex items-center justify-between rounded-t-lg">
          <h2 className="text-lg font-semibold text-stone-900">申请联系</h2>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-stone-100" aria-label="关闭"><X size={22} /></button>
        </div>

        <div className="p-5 space-y-4">
          {/* listing 简介 */}
          {(() => {
            const isRental = listing.type === 'sublet' || listing.type === 'summer';
            return (
              <div className="bg-stone-50 border border-stone-200 rounded-lg p-3">
                <div className="text-sm font-semibold text-stone-900 truncate">{listing.title}</div>
                <div className="text-xs text-stone-500 mt-1">
                  {/* 合租场景显示发布人性别/年龄；租赁场景隐藏 */}
                  {!isRental && (
                    <>
                      对方：{listing.posterGender === 'F' ? '女生' : listing.posterGender === 'M' ? '男生' : listing.posterGender === 'nb' ? '非二元' : '未透露'}
                      {listing.ageRange && ` · ${listing.ageRange}`}
                      {' · '}
                    </>
                  )}
                  {isRental ? '房东要求：' : '找：'}
                  <span className={`font-medium ${
                    listing.lookingForGender === 'any' ? 'text-stone-700' : 'text-brand'
                  }`}>
                    {listing.lookingForGender === 'F-only' ? (isRental ? '仅女生租客' : '仅女生')
                      : listing.lookingForGender === 'M-only' ? (isRental ? '仅男生租客' : '仅男生')
                      : '不限性别'}
                  </span>
                </div>
              </div>
            );
          })()}

          {/* 性别 */}
          <div>
            <Label required>你是</Label>
            <Pills
              value={applicantGender}
              onChange={setApplicantGender}
              options={LISTING_GENDERS_UI.map(g => ({ v: g.v, l: g.l }))}
            />
          </div>

          {genderBlocked && (
            <div className="bg-amber-50 border border-amber-200 rounded p-3 text-sm text-amber-800 flex items-start gap-2">
              <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
              <div>
                对方在找 <strong>{listing.lookingForGender === 'F-only' ? '仅女生' : '仅男生'}</strong>，
                按你选的性别申请会被拒。可以改性别选项，或换一条 listing 申请。
              </div>
            </div>
          )}

          {/* 年龄段 */}
          <div>
            <Label>年龄段（选填，给对方参考）</Label>
            <Pills value={ageRange} onChange={setAgeRange} options={[
              { v: '', l: '不填' },
              ...LISTING_AGE_RANGES.map(r => ({ v: r, l: r })),
            ]} />
          </div>

          {/* 联系方式 */}
          <div>
            <Label required>你的联系方式</Label>
            <div className="text-xs text-stone-500 mb-2">
              💡 仅在对方同意后才会展示给对方
            </div>
            <div className="flex gap-2">
              <select
                value={contactType}
                onChange={e => setContactType(e.target.value)}
                className="border border-stone-300 rounded px-2 py-2"
              >
                {CONTACT_TYPES.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.id === 'wechat' ? '微信' : c.id === 'phone' ? '手机' : c.id === 'email' ? '邮箱' : '其他'}
                  </option>
                ))}
              </select>
              <input
                value={contactValue}
                onChange={e => setContactValue(e.target.value)}
                placeholder={CONTACT_TYPES.find(c => c.id === contactType)?.placeholder ?? ''}
                className="flex-1 border border-stone-300 rounded px-3 py-2"
              />
              {contactType === 'other' && (
                <input
                  value={customLabel}
                  onChange={e => setCustomLabel(e.target.value)}
                  placeholder="标签"
                  className="w-24 border border-stone-300 rounded px-2 py-2"
                />
              )}
            </div>
          </div>

          {/* 识别码 */}
          <div>
            <Label required>识别码（≥6 位）</Label>
            <input
              type="password"
              value={editCode}
              onChange={e => setEditCode(e.target.value)}
              minLength={6}
              placeholder="用于管理你的申请；以后查状态、撤回都需要它"
              className="w-full border border-stone-300 rounded px-3 py-2"
            />
          </div>

          {/* 消息 */}
          <div>
            <Label required>给对方说点什么（500 字内）</Label>
            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              maxLength={500}
              rows={5}
              placeholder="例：你好！我也是研一 CS 妹子，作息和你像，爱做饭。希望能合住，方便约个视频聊聊？"
              className="w-full border border-stone-300 rounded px-3 py-2 leading-relaxed"
            />
            <div className="text-xs text-stone-400 mt-1 text-right">{message.length}/500</div>
          </div>

          {/* 附上 B 自己的 listing */}
          {myListings.length > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={attachMyListing}
                  onChange={e => setAttachMyListing(e.target.checked)}
                  className="mt-1 flex-shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-stone-900">
                    检测到你也发过 listing，要附上让对方了解你吗？
                  </div>
                  <div className="text-xs text-stone-500 mt-0.5">
                    同意后对方能点开你的 listing 看到完整自我介绍
                  </div>
                  {attachMyListing && myListings.length > 1 && (
                    <select
                      value={selectedAttachId}
                      onChange={e => setSelectedAttachId(e.target.value)}
                      className="mt-2 w-full border border-stone-300 rounded px-2 py-1.5 text-sm bg-white"
                    >
                      {myListings.map(l => {
                        const tp = LISTING_TYPES.find(t => t.id === l.type);
                        return (
                          <option key={l.id} value={l.id}>
                            [{tp?.label ?? l.type}] {l.title}
                          </option>
                        );
                      })}
                    </select>
                  )}
                  {attachMyListing && myListings.length === 1 && (
                    <div className="mt-1.5 text-xs text-stone-700">
                      📎 {myListings[0].title}
                    </div>
                  )}
                </div>
              </label>
            </div>
          )}
        </div>

        <div className="sticky bottom-0 bg-white border-t border-stone-200 px-5 py-3 flex justify-end gap-2 rounded-b-lg">
          <button onClick={onClose} className="px-4 py-2 border border-stone-300 rounded hover:bg-stone-100">
            取消
          </button>
          <button
            onClick={submit}
            disabled={submitting || genderBlocked}
            className="inline-flex items-center gap-1.5 px-5 py-2 bg-brand text-white rounded hover:bg-brand-dark disabled:opacity-50 font-medium"
          >
            <Send size={14} />
            {submitting ? '发送中…' : '发送申请'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Label({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <div className="text-sm font-medium text-stone-700 mb-1.5">
      {children}{required && <span className="text-brand"> *</span>}
    </div>
  );
}

function Pills({
  value, onChange, options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: Array<{ v: string; l: string }>;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map(o => (
        <button
          key={o.v}
          type="button"
          onClick={() => onChange(o.v)}
          className={`px-3 py-1.5 text-sm rounded-chip border transition-colors ${
            value === o.v
              ? 'bg-brand/10 border-brand text-brand font-medium'
              : 'bg-white text-stone-700 border-stone-300 hover:bg-stone-100'
          }`}
        >
          {o.l}
        </button>
      ))}
    </div>
  );
}
