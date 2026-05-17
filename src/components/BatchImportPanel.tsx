'use client';

// 批量导入面板：嵌在 PostModal 的"批量导入" tab 里
// 三步流程：上传图（按 1,2,3 编号）→ 粘贴文本 → 预览 → 全部入库为草稿

import { useState, useRef } from 'react';
import NextImage from 'next/image';
import { CATEGORIES, CONTACT_TYPES, categoryLabel, formatPrice, contactTypeLabel } from '@/lib/utils';
import { parseBatchText, mapPhotoIndices, type ParseRecord } from '@/lib/batchParser';
import { getStoredUtmSource } from '@/lib/utm';
import { useT, useLocale } from '@/i18n/I18nProvider';
import { showError, showSuccess, showWarning } from '@/lib/toast';
import { validateContact, contactPlaceholder } from '@/lib/contactValidation';

const MAX_BATCH_PHOTOS = 60;
const LS_LAST_CODE      = 'hb_last_edit_code';
const LS_LAST_CONTACT_T = 'hb_my_contact_type';
const LS_LAST_CONTACT_V = 'hb_my_contact_value';

const AI_PROMPT_ZH = `我有以下二手物品要发到「黑堡二手买卖」网站。请按下面的格式输出，每条之间用 --- 分隔，不要加额外说明：

格式：
标题: （30 字内）
类别: 家居 / 电子 / 交通 / 书本 / 房屋 / 其他
价格: 数字 USD，或写 "面议"
描述: 简短说明（成色、尺寸、自取/可送等）
图片: 这条商品对应的图片编号，逗号分隔（按我上传顺序，从 1 开始）

我的物品清单：
[在这里粘贴你的物品列表和图片对应关系]`;

export function BatchImportPanel({
  onSuccess,
  onClose,
}: {
  onSuccess: () => void;
  onClose: () => void;
}) {
  const t = useT();
  const locale = useLocale();

  // 全局信息
  const [contactType,  setContactType]  = useState<'wechat' | 'phone' | 'email' | 'other'>(() => {
    if (typeof window === 'undefined') return 'wechat';
    const v = window.localStorage.getItem(LS_LAST_CONTACT_T);
    return v === 'wechat' || v === 'phone' || v === 'email' || v === 'other' ? v : 'wechat';
  });
  const [contactValue, setContactValue] = useState(() => {
    if (typeof window === 'undefined') return '';
    return window.localStorage.getItem(LS_LAST_CONTACT_V) ?? '';
  });
  const [customLabel,  setCustomLabel]  = useState('');
  const [editCode, setEditCode] = useState(() => {
    if (typeof window === 'undefined') return '';
    return window.localStorage.getItem(LS_LAST_CODE) ?? '';
  });

  // 图片：URL 数组，按上传顺序，编号 1-based
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 文本块
  const [text, setText] = useState('');

  // 预览 / 提交
  const [previewRecords, setPreviewRecords] = useState<ParseRecord[] | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [aiCopied, setAiCopied] = useState(false);

  const uploadFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const slots = MAX_BATCH_PHOTOS - photoUrls.length;
    if (slots <= 0) { showWarning(`最多 ${MAX_BATCH_PHOTOS} 张`); return; }
    const list = Array.from(files).slice(0, slots);

    setUploading(true);
    try {
      const next = [...photoUrls];
      for (const file of list) {
        const compressed = await compressImage(file);
        const fd = new FormData();
        fd.append('file', compressed);
        const res = await fetch('/api/upload', { method: 'POST', body: fd });
        const data = await res.json();
        if (!res.ok) { showError(`上传失败：${data.error || res.statusText}`); continue; }
        next.push(data.url);
      }
      setPhotoUrls(next);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const removePhoto = (i: number) => {
    if (!confirm(`确定删除第 ${i + 1} 张？删除后后续编号不变，会导致引用错位。`)) return;
    setPhotoUrls(urls => urls.filter((_, idx) => idx !== i));
  };

  const copyAiPrompt = async () => {
    try {
      await navigator.clipboard.writeText(AI_PROMPT_ZH);
      setAiCopied(true);
      setTimeout(() => setAiCopied(false), 2500);
    } catch {
      window.prompt('复制下面这段提示词：', AI_PROMPT_ZH);
    }
  };

  const onPreview = () => {
    if (!text.trim()) { showError(t('batch.errEmpty')); return; }
    const result = parseBatchText(text);
    setPreviewRecords(result.records);
  };

  const validRecords = (previewRecords ?? []).filter((r): r is Extract<ParseRecord, { ok: true }> => r.ok);
  const errorRecords = (previewRecords ?? []).filter((r): r is Extract<ParseRecord, { ok: false }> => !r.ok);

  const onSubmit = async () => {
    if (validRecords.length === 0) { showError(t('batch.errNoValid')); return; }
    if (validRecords.length > 30) { showError(t('batch.errMaxBatch')); return; }
    if (!contactValue.trim()) { showError(t('post.errContact')); return; }
    if (editCode.length < 6) { showError(t('post.errEditCode')); return; }

    // 把每条 parsed item 补上全局联系方式 + 图片 URL 映射
    const items = validRecords.map(r => ({
      type: r.item.type,
      title: r.item.title,
      description: r.item.description,
      price: r.item.price,
      category: r.item.category,
      customTag: r.item.customTag,
      // 联系方式：每条共用全局值（覆盖 parser 解出来的，因为 parser 出来的可能格式不一致）
      contactType,
      contactValue: contactValue.trim(),
      customContactLabel: contactType === 'other' ? (customLabel.trim() || null) : null,
      photoUrls: mapPhotoIndices(r.item.photoIndices, photoUrls),
    }));

    setSubmitting(true);
    try {
      const res = await fetch('/api/items/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ editCode, items, utmSource: getStoredUtmSource() }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.perItem) {
          showError('部分条目有错', {
            description: data.perItem.map((e: any) => `条目 ${e.index + 1}: ${e.error}`).join('\n'),
            duration: 8000,
          });
        } else {
          showError(data.error || '导入失败');
        }
        return;
      }

      // 同 PostModal 的 localStorage 持久化
      try {
        localStorage.setItem(LS_LAST_CODE, editCode);
        localStorage.setItem(LS_LAST_CONTACT_T, contactType);
        localStorage.setItem(LS_LAST_CONTACT_V, contactValue.trim());
      } catch {}

      showSuccess(t('batch.previewSuccess', { n: data.count }));
      onSuccess();
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  // ============ 预览页 ============
  if (previewRecords) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold">{t('batch.previewTitle')}</h3>
          <button
            onClick={() => setPreviewRecords(null)}
            className="text-sm text-stone-600 hover:text-brand"
          >
            {t('batch.previewBack')}
          </button>
        </div>

        <div className="flex gap-3 text-sm">
          <span className="px-3 py-1 rounded-full bg-emerald-100 text-emerald-800">
            {t('batch.previewParsed', { n: validRecords.length })}
          </span>
          {errorRecords.length > 0 && (
            <span className="px-3 py-1 rounded-full bg-red-100 text-red-800">
              {t('batch.previewErrors', { n: errorRecords.length })}
            </span>
          )}
        </div>

        {/* 有效条目 */}
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {validRecords.map((r, i) => {
            const it = r.item;
            const photos = mapPhotoIndices(it.photoIndices, photoUrls);
            return (
              <div key={i} className="bg-white border border-stone-200 rounded p-3 text-sm flex gap-3">
                {photos.length > 0 && (
                  <NextImage
                    src={photos[0]}
                    alt=""
                    width={56}
                    height={56}
                    sizes="56px"
                    className="h-14 w-14 object-cover rounded flex-shrink-0"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-stone-900 truncate">{it.title}</div>
                  <div className="text-xs text-stone-500 mt-0.5">
                    {categoryLabel(it.category, locale)} · {formatPrice(it.price, locale, it.type, it.category)} · {photos.length} 张图
                  </div>
                  {it.description && (
                    <div className="text-xs text-stone-600 truncate mt-0.5">{it.description}</div>
                  )}
                </div>
              </div>
            );
          })}
          {errorRecords.map((r, i) => (
            <div key={`err-${i}`} className="bg-red-50 border border-red-200 rounded p-3 text-sm">
              <div className="text-red-800 font-medium mb-1">行 {r.lineStart}: {r.error}</div>
              <pre className="text-xs text-stone-600 whitespace-pre-wrap line-clamp-3">{r.raw.trim()}</pre>
            </div>
          ))}
        </div>

        <button
          onClick={onSubmit}
          disabled={submitting || validRecords.length === 0}
          className="w-full py-3 bg-brand text-white rounded-lg font-medium hover:bg-brand-dark disabled:opacity-50"
        >
          {submitting ? t('batch.previewSubmitting') : t('batch.previewSubmit', { n: validRecords.length })}
        </button>
      </div>
    );
  }

  // ============ 编辑页（三步） ============
  return (
    <div className="space-y-5">
      {/* === Step 1: 上传图片 === */}
      <section>
        <h3 className="font-semibold text-stone-900 mb-1">{t('batch.step1Title')}</h3>
        <p className="text-xs text-stone-500 mb-2">{t('batch.step1Hint')}</p>

        <label
          className="block border-2 border-dashed border-stone-300 rounded-lg p-4 text-center cursor-pointer hover:border-brand"
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); uploadFiles(e.dataTransfer.files); }}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            disabled={uploading}
            onChange={e => uploadFiles(e.target.files)}
            className="hidden"
          />
          <div className="text-sm text-stone-600">
            {uploading ? '上传中…' : t('batch.dropPhotos')}
          </div>
          <div className="text-xs text-stone-400 mt-1">
            {t('batch.photoCount', { n: photoUrls.length })} / {MAX_BATCH_PHOTOS}
          </div>
        </label>

        {photoUrls.length > 0 && (
          <div className="grid grid-cols-6 sm:grid-cols-8 gap-2 mt-3">
            {photoUrls.map((url, i) => (
              <div key={i} className="relative group">
                <NextImage
                  src={url}
                  alt=""
                  width={72}
                  height={72}
                  sizes="72px"
                  className="h-16 w-16 object-cover rounded border border-stone-300"
                />
                <span className="absolute top-0.5 left-0.5 bg-brand text-white text-[10px] font-bold px-1 rounded">
                  #{i + 1}
                </span>
                <button
                  type="button"
                  onClick={() => removePhoto(i)}
                  className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full w-5 h-5 text-xs leading-none opacity-0 group-hover:opacity-100"
                  title={t('batch.removePhoto')}
                >×</button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* === Step 2: 粘贴文本 === */}
      <section>
        <h3 className="font-semibold text-stone-900 mb-1">{t('batch.step2Title')}</h3>
        <p className="text-xs text-stone-500 mb-2">{t('batch.step2Hint')}</p>

        <button
          type="button"
          onClick={copyAiPrompt}
          className="mb-2 px-3 py-1.5 rounded border border-amber-300 bg-amber-50 hover:bg-amber-100 text-xs text-stone-800"
        >
          {aiCopied ? t('batch.aiPromptCopied') : t('batch.aiPromptBtn')}
        </button>

        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          rows={10}
          className="w-full border border-stone-300 rounded px-3 py-2 font-mono text-sm leading-relaxed"
          placeholder={`标题: IKEA Malm 床架\n类别: 家居\n价格: 80\n描述: 9 成新，自取\n联系: 微信 zhang3\n图片: 1,2,3\n---\n标题: ...`}
        />
      </section>

      {/* === Step 3: 全局信息 === */}
      <section className="bg-stone-50 border border-stone-200 rounded p-4">
        <h3 className="font-semibold text-stone-900 mb-2">{t('batch.step3Title')}</h3>

        <label className="block text-xs text-stone-600 mb-1">联系方式（所有商品共用）</label>
        <div className="flex gap-2 mb-3">
          <select
            value={contactType}
            onChange={e => setContactType(e.target.value as any)}
            className="border border-stone-300 rounded px-2 py-2 text-sm"
          >
            {CONTACT_TYPES.map(c => (
              <option key={c.id} value={c.id}>{contactTypeLabel(c.id, null, locale)}</option>
            ))}
          </select>
          <input
            value={contactValue}
            onChange={e => setContactValue(e.target.value)}
            onBlur={() => {
              const r = validateContact(contactType, contactValue);
              if (!r.ok && r.warning) showWarning(r.warning);
            }}
            placeholder={contactPlaceholder(contactType)}
            className="flex-1 border border-stone-300 rounded px-3 py-2 text-sm"
          />
          {contactType === 'other' && (
            <input
              value={customLabel}
              onChange={e => setCustomLabel(e.target.value)}
              placeholder="如 Discord"
              className="w-24 border border-stone-300 rounded px-2 py-2 text-sm"
            />
          )}
        </div>

        <label className="block text-xs text-stone-600 mb-1">密码</label>
        <input
          value={editCode}
          onChange={e => setEditCode(e.target.value)}
          minLength={6}
          placeholder="例：mychair123"
          className="w-full border border-stone-300 rounded px-3 py-2 text-sm"
        />
        <p className="text-xs text-stone-500 mt-1">本次导入的所有商品共用一个密码</p>
      </section>

      <button
        onClick={onPreview}
        disabled={!text.trim() || uploading}
        className="w-full py-3 bg-brand text-white rounded-lg font-medium hover:bg-brand-dark disabled:opacity-50"
      >
        {t('batch.previewBtn')}
      </button>
    </div>
  );
}

// ============ 图片压缩（同 ImageUpload） ============
async function compressImage(file: File, maxDim = 1600, quality = 0.85): Promise<File> {
  if (!file.type.startsWith('image/')) return file;
  if (file.size < 500 * 1024) return file;
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new window.Image();
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = URL.createObjectURL(file);
  });
  const { width, height } = (() => {
    if (img.width <= maxDim && img.height <= maxDim) return { width: img.width, height: img.height };
    const ratio = img.width > img.height ? maxDim / img.width : maxDim / img.height;
    return { width: Math.round(img.width * ratio), height: Math.round(img.height * ratio) };
  })();
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return file;
  ctx.drawImage(img, 0, 0, width, height);
  const blob = await new Promise<Blob | null>(res =>
    canvas.toBlob(res, 'image/jpeg', quality)
  );
  if (!blob) return file;
  return new File([blob], file.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' });
}
