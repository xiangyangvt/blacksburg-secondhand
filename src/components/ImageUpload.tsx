'use client';

import { useState, useRef } from 'react';
import NextImage from 'next/image';
import { useT } from '@/i18n/I18nProvider';

const MAX_PHOTOS = 6;

export function ImageUpload({
  urls,
  onChange,
}: {
  urls: string[];
  onChange: (next: string[]) => void;
}) {
  const t = useT();
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // 拖拽中的源索引
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  // 拖拽悬停的目标索引（视觉反馈）
  const [dragOver, setDragOver] = useState<number | null>(null);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const slots = MAX_PHOTOS - urls.length;
    if (slots <= 0) {
      alert(t('upload.maxReached', { max: MAX_PHOTOS }));
      return;
    }
    const list = Array.from(files).slice(0, slots);

    setUploading(true);
    try {
      const next = [...urls];
      for (const file of list) {
        const compressed = await compressImage(file);
        const fd = new FormData();
        fd.append('file', compressed);
        const res = await fetch('/api/upload', { method: 'POST', body: fd });
        const data = await res.json();
        if (!res.ok) {
          alert(`${t('upload.errFailed')}: ${data.error || res.statusText}`);
          continue;
        }
        next.push(data.url);
      }
      onChange(next);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const remove = (i: number) => {
    onChange(urls.filter((_, idx) => idx !== i));
  };

  // 把 from 位置的元素挪到 to 位置（splice 风格）
  const reorder = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0) return;
    const next = [...urls];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onChange(next);
  };

  return (
    <div>
      <div className="flex gap-2 flex-wrap">
        {urls.map((url, i) => {
          const isDragging = dragFrom === i;
          const isOver = dragOver === i && dragFrom !== i;
          return (
            <div
              key={url}
              draggable
              onDragStart={() => setDragFrom(i)}
              onDragEnd={() => { setDragFrom(null); setDragOver(null); }}
              onDragOver={(e) => {
                e.preventDefault();          // 必须，否则 onDrop 不触发
                e.dataTransfer.dropEffect = 'move';
                if (dragOver !== i) setDragOver(i);
              }}
              onDragLeave={() => { if (dragOver === i) setDragOver(null); }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragFrom !== null && dragFrom !== i) reorder(dragFrom, i);
                setDragFrom(null);
                setDragOver(null);
              }}
              className={`relative group cursor-move select-none transition-all
                ${isDragging ? 'opacity-40 scale-95' : ''}
                ${isOver    ? 'ring-2 ring-brand ring-offset-1' : ''}`}
              title="拖拽改顺序 / Drag to reorder"
            >
              <NextImage
                src={url}
                alt=""
                width={80}
                height={80}
                sizes="80px"
                className="h-20 w-20 object-cover rounded border border-stone-300 pointer-events-none"
              />
              {/* 第一张：封面标签 */}
              {i === 0 && (
                <span className="absolute top-0 left-0 bg-brand text-white text-[10px] px-1.5 py-0.5 rounded-tl rounded-br font-medium">
                  {t('upload.cover')}
                </span>
              )}
              {/* 右上：删除 */}
              <button
                type="button"
                onClick={() => remove(i)}
                className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full w-5 h-5 text-xs leading-none opacity-0 group-hover:opacity-100 z-10"
                title={t('upload.delete')}
              >×</button>
              {/* 触屏兜底：上一张 / 下一张箭头 —— 手机端原生 DnD 支持很弱 */}
              <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 flex gap-0.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100">
                {i > 0 && (
                  <button
                    type="button"
                    onClick={() => reorder(i, i - 1)}
                    className="bg-stone-700 text-white rounded w-5 h-5 text-[10px] leading-none flex items-center justify-center hover:bg-stone-900"
                    title={t('upload.moveLeft')}
                    aria-label={t('upload.moveLeft')}
                  >‹</button>
                )}
                {i < urls.length - 1 && (
                  <button
                    type="button"
                    onClick={() => reorder(i, i + 1)}
                    className="bg-stone-700 text-white rounded w-5 h-5 text-[10px] leading-none flex items-center justify-center hover:bg-stone-900"
                    title={t('upload.moveRight')}
                    aria-label={t('upload.moveRight')}
                  >›</button>
                )}
              </div>
            </div>
          );
        })}
        {urls.length < MAX_PHOTOS && (
          <label className="h-20 w-20 border-2 border-dashed border-stone-300 rounded flex flex-col items-center justify-center cursor-pointer hover:border-brand text-stone-500 text-xs text-center leading-tight">
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={e => handleFiles(e.target.files)}
              className="hidden"
              disabled={uploading}
            />
            <span>{uploading ? t('upload.uploading') : t('upload.add')}</span>
            <span className="text-[10px] mt-0.5">{urls.length}/{MAX_PHOTOS}</span>
          </label>
        )}
      </div>
      <p className="text-xs text-stone-500 mt-1">
        {t('upload.hint', { max: MAX_PHOTOS })}
      </p>
    </div>
  );
}

// 浏览器端压缩图片
async function compressImage(file: File, maxDim = 1600, quality = 0.85): Promise<File> {
  if (!file.type.startsWith('image/')) return file;
  if (file.size < 500 * 1024) return file;
  const img = await loadImage(file);
  const { width, height } = scaleSize(img.width, img.height, maxDim);
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

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

function scaleSize(w: number, h: number, max: number) {
  if (w <= max && h <= max) return { width: w, height: h };
  const ratio = w > h ? max / w : max / h;
  return { width: Math.round(w * ratio), height: Math.round(h * ratio) };
}
