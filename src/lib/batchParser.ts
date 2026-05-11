// 批量导入的文本块解析器
// 输入格式（YAML 风，--- 分隔商品）：
//   标题: IKEA 床架
//   类别: 家居
//   价格: 80
//   描述: ...
//   联系: 微信 zhang3
//   图片: 1,3,5
//   ---
//   ...
//
// 设计目标：容错强，AI 工具输出格式漂移也能解析

import { CATEGORIES, CONTACT_TYPES, type CategoryId, type ContactType, type ItemType } from './utils';

export type ParsedItem = {
  type: ItemType;
  title: string;
  description: string;
  price: number | null;
  category: CategoryId;
  customTag: string | null;
  contactType: ContactType;
  contactValue: string;
  customContactLabel: string | null;
  /** 用户在文本里写的图片编号 (1-based)；预览时再 map 成 URL */
  photoIndices: number[];
};

export type ParseRecord =
  | { ok: true;  item: ParsedItem;   raw: string; lineStart: number; }
  | { ok: false; error: string;      raw: string; lineStart: number; };

export type ParseResult = {
  records: ParseRecord[];
  validCount: number;
  errorCount: number;
};

/** 中文类别名 → category id（容错：忽略大小写、去标点） */
const CATEGORY_ALIASES: Record<string, CategoryId> = {
  '家居': 'home',         'home': 'home',          'furniture': 'home',
  '家居家具': 'home',     '家具': 'home',
  '电子': 'electronics',  '电子产品': 'electronics', 'electronics': 'electronics',
  '数码': 'electronics',
  '交通': 'transport',    '交通工具': 'transport',  'transport': 'transport',
  '车': 'transport',      'bike': 'transport',     'car': 'transport',
  '书': 'books',          '书本': 'books',         '书本教材': 'books',
  '教材': 'books',        'books': 'books',        'textbook': 'books',
  '房': 'housing',        '房屋': 'housing',       '房屋租赁': 'housing',
  '租房': 'housing',      'housing': 'housing',    'rental': 'housing',
  '其他': 'other',        'other': 'other',        'misc': 'other',
};

/** 中文/英文联系方式 → contact id */
const CONTACT_ALIASES: Record<string, { type: ContactType; customLabel?: string }> = {
  '微信': { type: 'wechat' },    'wechat': { type: 'wechat' },     'wx': { type: 'wechat' },
  '手机': { type: 'phone' },     '电话': { type: 'phone' },        'phone': { type: 'phone' },
  '邮箱': { type: 'email' },     '邮件': { type: 'email' },        'email': { type: 'email' },
  'mail': { type: 'email' },
};

/** "出售"/"求购" → sell/buy；房屋分类还支持"转租"/"求租" */
const TYPE_ALIASES: Record<string, ItemType> = {
  '出售': 'sell', '卖': 'sell', 'sell': 'sell', 'sale': 'sell',
  '转租': 'sell', 'sublet': 'sell', 'sublease': 'sell',
  '求购': 'buy', '收': 'buy', 'buy': 'buy', 'wanted': 'buy',
  '求租': 'buy', '租': 'buy', 'rent': 'buy',
};

const NEGOTIABLE_VALUES = new Set([
  '面议', '议价', '可议', '电议', 'negotiable', 'obo', 'best offer',
  '留言', '留言告知', 'by message',
]);

const KEY_ALIASES: Record<string, string> = {
  '标题': 'title', 'title': 'title', '物品': 'title', 'item': 'title',
  '类别': 'category', '分类': 'category', 'category': 'category', '种类': 'category',
  '类型': 'type', 'type': 'type', '出售/求购': 'type',
  '价格': 'price', '售价': 'price', 'price': 'price', '价': 'price',
  '描述': 'description', '详情': 'description', '说明': 'description', 'description': 'description', 'desc': 'description',
  '联系': 'contact', '联系方式': 'contact', 'contact': 'contact',
  '图片': 'photos', '照片': 'photos', '图': 'photos', 'photos': 'photos', 'images': 'images',
  '标签': 'tag', 'tag': 'tag',
};

/** 单行 "key: value" 解析；返回 [key, value] 或 null */
function parseLine(line: string): [string, string] | null {
  // 容错：去掉行首 markdown 标记 ("-", "*", "•", "1.")
  const stripped = line.replace(/^[\s\-*•·]+/, '').replace(/^\d+\.\s+/, '');
  // 中文冒号也支持
  const m = stripped.match(/^([^:：]+)[:：]\s*(.*)$/);
  if (!m) return null;
  const rawKey = m[1].trim().toLowerCase();
  const value  = m[2].trim();
  const key    = KEY_ALIASES[rawKey] ?? rawKey;
  return [key, value];
}

/** 解析单条商品文本 */
function parseSingle(block: string, lineStart: number): ParseRecord {
  const lines = block.split('\n');
  const fields: Record<string, string> = {};
  for (const ln of lines) {
    const kv = parseLine(ln);
    if (kv) fields[kv[0]] = kv[1];
  }

  if (Object.keys(fields).length === 0) {
    return { ok: false, error: '空白条目', raw: block, lineStart };
  }

  const title = fields.title;
  if (!title) return { ok: false, error: '缺少标题', raw: block, lineStart };

  // 类别（容错查 alias）
  const catRaw = fields.category?.toLowerCase().trim() ?? '';
  const category = CATEGORY_ALIASES[catRaw] ?? (CATEGORIES.find(c => c.id === catRaw)?.id);
  if (!category) {
    return {
      ok: false,
      error: `类别不识别："${fields.category ?? '(缺失)'}"，应为：家居/电子/交通/书本/房屋/其他`,
      raw: block, lineStart,
    };
  }

  // 类型（默认 sell，房屋默认也是 sell=转租）
  const typeRaw = fields.type?.toLowerCase().trim() ?? '';
  const type: ItemType = TYPE_ALIASES[typeRaw] ?? 'sell';

  // 价格
  let price: number | null = null;
  const priceRaw = fields.price?.trim() ?? '';
  if (priceRaw === '') {
    return { ok: false, error: '缺少价格（写数字或"面议"）', raw: block, lineStart };
  }
  if (NEGOTIABLE_VALUES.has(priceRaw.toLowerCase())) {
    price = null;
  } else {
    const cleaned = priceRaw.replace(/[$￥¥,，\s]/g, '').replace('USD', '').replace('usd', '');
    const n = parseFloat(cleaned);
    if (isNaN(n) || n < 0) {
      return { ok: false, error: `价格不识别："${priceRaw}"`, raw: block, lineStart };
    }
    price = Math.round(n);
  }

  // 联系方式：可能是「微信 zhang3」「wechat: zhang3」「微信:zhang3」等
  const contactRaw = fields.contact?.trim() ?? '';
  if (!contactRaw) return { ok: false, error: '缺少联系方式', raw: block, lineStart };

  // 拆解：第一个 token 当 contactType，余下当 contactValue
  let contactType: ContactType = 'other';
  let contactValue = contactRaw;
  let customContactLabel: string | null = null;

  const firstSpace = contactRaw.search(/\s+/);
  if (firstSpace > 0) {
    const head = contactRaw.slice(0, firstSpace).toLowerCase();
    const tail = contactRaw.slice(firstSpace).trim();
    const alias = CONTACT_ALIASES[head];
    if (alias) {
      contactType = alias.type;
      contactValue = tail;
    } else {
      // 整段当成 other 类型 + customLabel = head
      customContactLabel = contactRaw.slice(0, firstSpace);
      contactValue = tail;
    }
  } else {
    // 没空格：整体当成 contactValue，type 用默认 other
    contactValue = contactRaw;
  }

  if (!contactValue) return { ok: false, error: '联系方式格式错（如"微信 zhang3"）', raw: block, lineStart };

  // 图片编号
  const photosRaw = fields.photos ?? fields.images ?? '';
  const photoIndices = photosRaw
    .split(/[,，\s]+/)
    .map(s => parseInt(s.trim(), 10))
    .filter(n => Number.isInteger(n) && n > 0);

  return {
    ok: true,
    item: {
      type,
      title: title.slice(0, 100),
      description: (fields.description ?? '').slice(0, 2000),
      price,
      category,
      customTag: fields.tag?.trim() || null,
      contactType,
      contactValue: contactValue.slice(0, 200),
      customContactLabel,
      photoIndices,
    },
    raw: block,
    lineStart,
  };
}

/** 主入口：把整段文本解析为商品列表 */
export function parseBatchText(text: string): ParseResult {
  // 按 --- 分隔（前后可以有空格、可以是多个连字符）
  const normalized = text.replace(/\r\n/g, '\n');
  const blocks: { content: string; lineStart: number }[] = [];

  let buffer: string[] = [];
  let blockStart = 1;
  const lines = normalized.split('\n');

  lines.forEach((line, idx) => {
    if (/^\s*-{3,}\s*$/.test(line)) {
      if (buffer.join('\n').trim()) {
        blocks.push({ content: buffer.join('\n'), lineStart: blockStart });
      }
      buffer = [];
      blockStart = idx + 2;
    } else {
      buffer.push(line);
    }
  });
  if (buffer.join('\n').trim()) {
    blocks.push({ content: buffer.join('\n'), lineStart: blockStart });
  }

  const records = blocks.map(b => parseSingle(b.content, b.lineStart));
  return {
    records,
    validCount: records.filter(r => r.ok).length,
    errorCount: records.filter(r => !r.ok).length,
  };
}

/** 把已解析的 photoIndices 映射回 URL 数组（去重 + 越界过滤） */
export function mapPhotoIndices(indices: number[], allUrls: string[]): string[] {
  const out: string[] = [];
  for (const i of indices) {
    const url = allUrls[i - 1]; // 1-based → 0-based
    if (url && !out.includes(url)) out.push(url);
    if (out.length >= 6) break;  // Item.photoUrls 上限
  }
  return out;
}
