// 所有界面文案。新增语言只要再加一列。
// 键名按"section.purpose"组织，方便维护。

export type Locale = 'zh' | 'en';

export const LOCALES: Locale[] = ['zh', 'en'];

export const messages = {
  // 站点元信息
  'site.brand':            { zh: '黑堡二手买卖',                            en: 'Blacksburg Secondhand' },
  'site.tagline':          { zh: '本地华人/学生二手交易',                    en: 'Local marketplace · Blacksburg, VA' },

  // 顶栏（emoji 都已剥离，前端用 lucide 图标）
  'header.search':         { zh: '搜索标题、描述、联系方式…',                 en: 'Search title, description, contact…' },
  'header.post':           { zh: '我要发布',                                 en: 'Post Item' },
  'header.langZh':         { zh: '中',                                      en: '中' },
  'header.langEn':         { zh: 'EN',                                      en: 'EN' },
  'header.statsLine':      { zh: '本月已新发布 {m} 件 · 累计在售 {t} 件',        en: '{m} new this month · {t} active total' },

  // 列表 / 空态
  'list.loading':          { zh: '加载中…',                                  en: 'Loading…' },
  'list.empty':            { zh: '暂无符合条件的商品',                        en: 'No items match your filters' },
  'list.beFirst':          { zh: '做第一个发布的人 →',                        en: 'Be the first to post →' },
  'list.count':            { zh: '共 {n} 件',                                en: '{n} item(s)' },

  // 筛选侧栏
  'filter.category':       { zh: '分类',                                    en: 'Category' },
  'filter.type':           { zh: '类型',                                    en: 'Type' },
  'filter.price':          { zh: '价格 (USD)',                              en: 'Price (USD)' },
  'filter.date':           { zh: '日期',                                    en: 'Date' },
  'filter.sort':           { zh: '排序',                                    en: 'Sort' },
  'filter.all':            { zh: '全部',                                    en: 'All' },

  // 类型 sell/buy
  'type.sell':             { zh: '出售',                                    en: 'For sale' },
  'type.buy':              { zh: '求购',                                    en: 'Wanted' },

  // 日期范围
  'date.1d':               { zh: '近一日',                                  en: 'Last 24h' },
  'date.1w':               { zh: '近一周',                                  en: 'Last week' },
  'date.1m':               { zh: '近一月',                                  en: 'Last month' },
  'date.all':              { zh: '全部',                                    en: 'All time' },

  // 排序
  'sort.newest':           { zh: '最新',                                    en: 'Newest' },
  'sort.oldest':           { zh: '最旧',                                    en: 'Oldest' },
  'sort.priceAsc':         { zh: '价格低 → 高',                              en: 'Price low → high' },
  'sort.priceDesc':        { zh: '价格高 → 低',                              en: 'Price high → low' },

  // 商品分类
  'cat.home':              { zh: '家居家具',                                en: 'Home & Furniture' },
  'cat.electronics':       { zh: '电子产品',                                en: 'Electronics' },
  'cat.transport':         { zh: '交通工具',                                en: 'Transport' },
  'cat.books':             { zh: '书本教材',                                en: 'Books' },
  'cat.housing':           { zh: '房屋租赁',                                en: 'Housing' },
  'cat.other':             { zh: '其他',                                    en: 'Other' },

  // 房屋分类专用类型标签（替换"出售/求购"）
  'type.sublet':           { zh: '转租',                                    en: 'Sublease' },
  'type.rentwanted':       { zh: '求租',                                    en: 'Looking to rent' },
  'price.perMonth':        { zh: '/月',                                     en: '/mo' },

  // 联系方式类型
  'contact.wechat':        { zh: '微信',                                    en: 'WeChat' },
  'contact.phone':         { zh: '手机',                                    en: 'Phone' },
  'contact.email':         { zh: '邮箱',                                    en: 'Email' },
  'contact.other':         { zh: '其他',                                    en: 'Other' },

  // 商品卡片
  'card.copyContact':      { zh: '复制联系方式',                              en: 'Copy contact' },
  'card.copyTitle':        { zh: '复制物品信息',                              en: 'Copy item info' },
  'card.share':            { zh: '分享',                                    en: 'Share' },
  'card.shareItem':        { zh: '分享物品信息',                              en: 'Share item info' },
  'card.shareCopied':      { zh: '已复制',                                  en: 'Copied' },
  'card.tapHint':          { zh: '点击卡片展开详情',                          en: 'Tap card for details' },
  'card.fabPost':          { zh: '发布',                                    en: 'Post' },
  'card.edit':             { zh: '编辑',                                    en: 'Edit' },
  'card.markSold':         { zh: '删除',                                    en: 'Delete' },
  'card.report':           { zh: '举报',                                    en: 'Report' },
  'card.copied':           { zh: '已复制',                                  en: 'Copied' },
  'card.viewPhoto':        { zh: '查看图片 {i} / {n}',                      en: 'View photo {i} / {n}' },
  'card.photoCount':       { zh: '共 {n} 张',                                en: '{n} photos' },

  // Lightbox
  'lightbox.prev':         { zh: '上一张',                                  en: 'Previous' },
  'lightbox.next':         { zh: '下一张',                                  en: 'Next' },
  'lightbox.close':        { zh: '关闭',                                    en: 'Close' },

  // 价格 — 出售贴 null 价格 = 面议；求购贴 null 价格 = 留言告知
  'price.negotiable':      { zh: '面议',                                    en: 'Negotiable' },
  'price.byMessage':       { zh: '留言',                                    en: 'By message' },
  'post.byMessage':        { zh: '留言告知',                                 en: 'By message' },

  // 时间
  'time.justNow':          { zh: '刚刚',                                    en: 'just now' },
  'time.fresh':            { zh: '刚刚发布',                                en: 'Just posted' },
  'time.minutesAgo':       { zh: '{n} 分钟前',                              en: '{n} min ago' },
  'time.hoursAgo':         { zh: '{n} 小时前',                              en: '{n} h ago' },
  'time.daysAgo':          { zh: '{n} 天前',                                en: '{n} d ago' },
  'time.monthsAgo':        { zh: '{n} 个月前',                              en: '{n} mo ago' },
  'time.yearsAgo':         { zh: '{n} 年前',                                en: '{n} y ago' },

  // 询价区
  'inq.toggle':            { zh: '{n} 条留言',                              en: '{n} messages' },
  'inq.add':               { zh: '+ 我也想问问 / 议价',                       en: '+ Ask / Make an offer' },
  'inq.editMy':            { zh: '✏️改',                                    en: '✏️Edit' },
  'inq.deleteMy':          { zh: '🗑自删',                                  en: '🗑Delete' },
  'inq.deleteSeller':      { zh: '🛡卖家删',                                en: '🛡Seller delete' },
  'inq.placeholderMsg':    { zh: '留言（如：能 25 刀吗？）',                   en: 'Message (e.g., 25 OK?)' },
  'inq.send':              { zh: '发送',                                    en: 'Send' },
  'inq.sending':           { zh: '发送中…',                                 en: 'Sending…' },
  'inq.cancel':            { zh: '取消',                                    en: 'Cancel' },
  'inq.confirmContact':    { zh: '请输入你当时留下的联系方式（{label}: {value}）以确认是你本人：', en: 'Re-enter your contact ({label}: {value}) to confirm it\'s you:' },
  'inq.editPrompt':        { zh: '修改后的留言：',                           en: 'Updated message:' },
  'inq.errEmpty':          { zh: '联系方式和留言都不能为空',                   en: 'Contact and message required' },
  'inq.errSend':           { zh: '发送失败',                                en: 'Send failed' },
  'inq.errEdit':           { zh: '修改失败',                                en: 'Edit failed' },
  'inq.errDelete':         { zh: '删除失败',                                en: 'Delete failed' },

  // 卖家回复
  'reply.btn':             { zh: '📝 卖家回复',                              en: '📝 Seller reply' },
  'reply.label':           { zh: '卖家',                                    en: 'Seller' },
  'reply.placeholder':     { zh: '回复买家（如：这个价格不行，最低 $25）',       en: 'Reply to buyer (e.g., Lowest $25)' },
  'reply.codePlaceholder': { zh: '商品识别码',                                en: 'Item edit code' },
  'reply.send':            { zh: '发送回复',                                 en: 'Send reply' },
  'reply.cancel':          { zh: '取消',                                    en: 'Cancel' },
  'reply.edit':            { zh: '✏️改',                                    en: '✏️Edit' },
  'reply.delete':          { zh: '🗑撤回',                                  en: '🗑Withdraw' },
  'reply.confirmDelete':   { zh: '撤回这条回复？',                            en: 'Withdraw this reply?' },
  'reply.errSend':         { zh: '回复失败',                                en: 'Reply failed' },

  // 发布 / 编辑模态框
  'post.titleCreate':      { zh: '我要发布',                                en: 'Post New Item' },
  'post.titleEdit':        { zh: '编辑信息',                                en: 'Edit Item' },
  'post.fieldType':        { zh: '这是',                                    en: 'This is' },
  'post.typeSell':         { zh: '📦 出售',                                 en: '📦 For sale' },
  'post.typeBuy':          { zh: '🔍 求购',                                 en: '🔍 Wanted' },
  'post.fieldTitle':       { zh: '标题 *',                                  en: 'Title *' },
  'post.titlePhSell':      { zh: '例：IKEA MALM 书桌',                       en: 'e.g., IKEA MALM desk' },
  'post.titlePhBuy':       { zh: '例：求一辆能骑的二手自行车',                  en: 'e.g., Wanted: a working used bike' },
  'post.titlePhSublet':    { zh: '例：1B1B 校园附近 May–Aug 转租',              en: 'e.g., 1B1B near campus, May–Aug sublease' },
  'post.titlePhRentwanted':{ zh: '例：求一间 studio 6 月起租，预算 $1000',       en: 'e.g., Looking for a studio from June, budget $1000' },
  'post.descPhHousing':    { zh: '面积、户型、家具、停车位、可入住时间、是否带宠物、是否包水电网等', en: 'Sq ft, layout, furniture, parking, move-in date, pet, utilities…' },
  'post.fieldPrice':       { zh: '价格 (USD) *',                            en: 'Price (USD) *' },
  'post.negotiable':       { zh: '面议',                                    en: 'Negotiable' },
  'post.fieldCategory':    { zh: '分类 *',                                  en: 'Category *' },
  'post.customTagPh':      { zh: '自定义标签（如：乐器、宠物用品）',             en: 'Custom tag (e.g., Instrument, Pet)' },
  'post.fieldDesc':        { zh: '详细描述',                                en: 'Description' },
  'post.descPh':           { zh: '成色、尺寸、自取/可送、为什么卖等等',          en: 'Condition, size, pickup/delivery, why selling…' },
  'post.fieldPhotos':      { zh: '商品照片',                                en: 'Photos' },
  'post.fieldContact':     { zh: '联系方式 *',                               en: 'Contact *' },
  'post.customLabelPh':    { zh: '联系方式名称（如 Discord）',                 en: 'Contact label (e.g., Discord)' },
  'post.fieldEditCode':    { zh: '识别码 *（≥6 位）',                         en: 'Edit code * (≥6 chars)' },
  'post.editCodePh':       { zh: '例：mychair123',                          en: 'e.g., mychair123' },
  'post.editCodeHelp':     {
    zh: '💡 这不是密码——只是用来证明"这条信息是你发的"，以后修改/删除要用。不会和任何账号关联，也不会发邮件。浏览器会帮你本地记住，下次发新东西自动填上同一个。丢了无法找回，换设备或清浏览器缓存就要重新设。',
    en: '💡 This is not a password — just a tag that proves you posted this. You\'ll need it to edit/delete later. Not linked to any account, no email sent. Your browser remembers it locally and auto-fills next time. Lost = unrecoverable; new device or cleared cache means new code.',
  },
  'post.cancel':           { zh: '取消',                                    en: 'Cancel' },
  'post.saving':           { zh: '保存中…',                                 en: 'Saving…' },
  'post.submitCreate':     { zh: '发布',                                    en: 'Post' },
  'post.submitEdit':       { zh: '保存修改',                                 en: 'Save changes' },
  'post.errTitle':         { zh: '标题不能为空',                              en: 'Title is required' },
  'post.errPrice':         { zh: '请填价格，或勾选「面议」',                    en: 'Enter a price or check Negotiable' },
  'post.errContact':       { zh: '联系方式不能为空',                          en: 'Contact is required' },
  'post.errEditCode':      { zh: '识别码至少 6 位',                          en: 'Edit code must be ≥6 chars' },
  'post.errOpFailed':      { zh: '操作失败',                                en: 'Operation failed' },

  // 识别码弹框（编辑/删除前）
  'code.promptTitle':      { zh: '输入识别码以{action}',                     en: 'Enter edit code to {action}' },
  'code.actionEdit':       { zh: '编辑',                                    en: 'edit' },
  'code.actionDelete':     { zh: '删除',                                    en: 'delete' },
  'code.actionDelInq':     { zh: '删除该条留言',                             en: 'delete this inquiry' },
  'code.itemLabel':        { zh: '商品：',                                   en: 'Item: ' },
  'code.placeholder':      { zh: '发布时设置的识别码',                         en: 'Edit code you set when posting' },
  'code.help':             { zh: '浏览器自动填上了你以前用过的识别码。如果不对请手动输入。', en: 'Auto-filled from your previous codes. Edit if wrong.' },
  'code.cancel':           { zh: '取消',                                    en: 'Cancel' },
  'code.verifying':        { zh: '验证中…',                                 en: 'Verifying…' },
  'code.confirm':          { zh: '确定',                                    en: 'Confirm' },
  'code.errWrong':         { zh: '识别码错误',                              en: 'Wrong edit code' },
  'code.confirmDelete':    { zh: '确定删除这条信息？此操作不可恢复。',                en: 'Delete this post? This cannot be undone.' },

  // 图片上传
  'upload.add':            { zh: '+ 加图',                                  en: '+ Add' },
  'upload.uploading':      { zh: '上传中…',                                  en: 'Uploading…' },
  'upload.hint':           { zh: '最多 {max} 张，自动压缩到 1MB 以下。👈 第一张是封面图，可拖拽改顺序。', en: 'Up to {max} photos, auto-compressed to ≤1MB. 👈 First photo is the cover; drag to reorder.' },
  'upload.cover':          { zh: '封面',                                    en: 'Cover' },
  'upload.moveLeft':       { zh: '前移',                                    en: 'Move left' },
  'upload.moveRight':      { zh: '后移',                                    en: 'Move right' },
  'upload.errSize':        { zh: '图片不能超过 5MB',                          en: 'Image must be ≤5MB' },
  'upload.errType':        { zh: '只支持 JPG/PNG/WebP/GIF',                  en: 'Only JPG/PNG/WebP/GIF supported' },
  'upload.errFailed':      { zh: '上传失败',                                en: 'Upload failed' },
  'upload.maxReached':     { zh: '最多 {max} 张图',                          en: 'Max {max} photos' },
  'upload.delete':         { zh: '删除',                                    en: 'Delete' },

  // 举报
  'report.prompt':         { zh: '举报理由（可填可不填）：',                    en: 'Reason for report (optional):' },
  'report.thanks':         { zh: '已举报，谢谢。累计 3 次不同 IP 举报会自动隐藏。', en: 'Report submitted. 3 unique-IP reports auto-hides the post.' },
  'report.failed':         { zh: '举报失败',                                en: 'Report failed' },

  // 页脚
  'footer.opensource':     { zh: '本站开源 · MIT 协议 · 欢迎在 GitHub 提 issue / PR', en: 'Open source · MIT · Issues & PRs welcome on GitHub' },
  'footer.prohibited':     { zh: '⚠️ 禁止发布枪支、毒品、活物、违法物品。',         en: '⚠️ No firearms, drugs, live animals, or illegal items.' },

  // 我的发布（G4）
  'my.title':              { zh: '我的发布',                                en: 'My Posts' },
  'my.intro':              { zh: '输入你发布时用的联系方式查看所有商品。要看草稿请加输识别码。', en: 'Enter your contact to see your posts. Add your edit code to see drafts too.' },
  'my.contactLabel':       { zh: '联系方式（如微信号 zhang3）',                en: 'Contact (e.g. wechat zhang3)' },
  'my.editCodeLabel':      { zh: '识别码（看草稿才需要）',                     en: 'Edit code (only needed for drafts)' },
  'my.lookup':              { zh: '查找',                                    en: 'Look up' },
  'my.tabActive':          { zh: '上架中 ({n})',                              en: 'Active ({n})' },
  'my.tabDraft':           { zh: '草稿 ({n})',                                en: 'Drafts ({n})' },
  'my.publishBtn':         { zh: '发布',                                    en: 'Publish' },
  'my.publishing':         { zh: '发布中…',                                  en: 'Publishing…' },
  'my.deleteBtn':          { zh: '删除',                                    en: 'Delete' },
  'my.editBtn':            { zh: '编辑',                                    en: 'Edit' },
  'my.empty':              { zh: '这里还没有任何商品',                         en: 'Nothing here yet' },
  'my.draftEmpty':         { zh: '没有草稿。批量导入后的商品默认是草稿。',         en: 'No drafts. Items from batch import start as drafts.' },
  'my.errLookup':          { zh: '查找失败',                                  en: 'Lookup failed' },
  'my.headerLink':         { zh: '我的发布',                                  en: 'My Posts' },

  // 批量导入
  'batch.tabSingle':       { zh: '单条发布',                                en: 'Single' },
  'batch.tabBatch':        { zh: '📥 批量导入',                              en: '📥 Batch import' },
  'batch.step1Title':      { zh: '① 上传所有图片',                            en: '① Upload all photos' },
  'batch.step1Hint':       { zh: '一次性把所有商品的照片传上来，记住每张的编号（1, 2, 3...），文本里用编号引用即可', en: 'Upload all photos at once; reference them by number in your text' },
  'batch.step2Title':      { zh: '② 粘贴商品文本',                            en: '② Paste item text' },
  'batch.step2Hint':       { zh: '每条商品用 --- 分隔。可以用 AI 工具帮你按格式生成（按下方按钮复制提示词）', en: 'Use --- between items. You can use AI tools to generate this text (copy prompt below)' },
  'batch.aiPromptBtn':     { zh: '📋 复制给 AI 的提示词',                      en: '📋 Copy AI prompt' },
  'batch.aiPromptCopied':  { zh: '✓ 提示词已复制，粘到 ChatGPT/Claude 让它帮你生成', en: '✓ Prompt copied, paste into ChatGPT/Claude' },
  'batch.step3Title':      { zh: '③ 全局信息（所有商品共用）',                   en: '③ Global info (shared by all items)' },
  'batch.previewBtn':      { zh: '解析并预览 →',                              en: 'Parse & preview →' },
  'batch.previewTitle':    { zh: '预览解析结果',                                en: 'Preview' },
  'batch.previewBack':     { zh: '← 修改文本',                                en: '← Back to edit' },
  'batch.previewParsed':   { zh: '解析成功 {n} 条',                            en: '{n} parsed OK' },
  'batch.previewErrors':   { zh: '有 {n} 条解析失败',                          en: '{n} failed' },
  'batch.previewSubmit':   { zh: '✅ 全部入库为草稿（共 {n} 条）',                en: '✅ Import {n} as drafts' },
  'batch.previewSubmitting': { zh: '入库中…',                                  en: 'Importing…' },
  'batch.previewSuccess':  { zh: '✓ 已成功入库 {n} 条草稿，去「我的发布」一条条发布即可', en: '✓ {n} drafts created, go to My Posts to publish' },
  'batch.errEmpty':        { zh: '请先粘贴商品文本',                            en: 'Paste item text first' },
  'batch.errNoValid':      { zh: '没有可入库的有效条目（请先修复错误）',           en: 'No valid items (fix errors first)' },
  'batch.errAllErrors':    { zh: '所有条目都有错，请检查格式',                    en: 'All items have errors' },
  'batch.errMaxBatch':     { zh: '单次最多 30 条',                              en: 'Max 30 items per batch' },
  'batch.dropPhotos':      { zh: '拖拽图片到这里 / 点击选择',                    en: 'Drag photos here / click to select' },
  'batch.photoCount':      { zh: '已传 {n} 张',                                en: '{n} uploaded' },
  'batch.photoRefBadge':   { zh: '编号 #{n}',                                  en: 'Ref #{n}' },
  'batch.removePhoto':     { zh: '删除',                                       en: 'Delete' },

  // 单商品 detail 页
  'detail.back':           { zh: '← 回到首页',                                en: '← Back to home' },
  'detail.notFound':       { zh: '商品不存在或已下架',                          en: 'Item not found or unavailable' },
  'detail.notFoundHint':   { zh: '可能已被卖家删除，或者链接错误',                  en: 'It may have been removed by the seller or the link is wrong' },
  'detail.metaPrefix':     { zh: '黑堡二手买卖',                                en: 'Blacksburg Secondhand' },
  'site.shareSite':        { zh: '分享本站',                                  en: 'Share site' },
} as const;

export type MessageKey = keyof typeof messages;
