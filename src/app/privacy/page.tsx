'use client';

// /privacy — 隐私政策(Sprint 9B)。内容要点见 SPRINT_9_PRIVACY.md §9B。

import { LegalPage, type LegalContent } from '@/components/LegalPage';

const CONTACT_EMAIL = 'yangxiang5136@gmail.com';
const REPO = 'https://github.com/xiangyangvt/blacksburg-secondhand';

const zh: LegalContent = {
  title: '隐私政策',
  updated: '更新于 2026-09-17',
  intro: '这是一个由个人维护、面向黑堡(Blacksburg, VA)本地华人与学生的免费社区站。本页说明我们收集什么、谁能看到、怎么删除。',
  sections: [
    { heading: '我们收集什么', paragraphs: [
      '你主动填写的内容:帖子标题、描述、图片、价格、联系方式(微信号 / 手机 / 邮箱等)、昵称。',
      '编辑密码:只保存加盐哈希,我们看不到原文,也无法找回。',
      '访问日志:IP 地址、浏览器标识、访问路径与来源。仅用于反滥用(限流、举报自动隐藏)与聚合统计,不与个人绑定展示。',
      '一个匿名访客标识(cookie hb_vid):用于去重计数、留言身份与联系方式交换,不含任何个人信息。',
      '如果你用邮箱登录:邮箱地址与登录会话。',
    ]},
    { heading: '谁能看到你的联系方式', paragraphs: [
      '二手平台:卖家联系方式对本站访客逐条可见(展开卡片后显示),每个访客每小时可查看的条数有限制,以防批量采集。留言人的联系方式只有展开留言并点查看的访客能看到,同样受限制。',
      '室友平台:申请者与发布者的联系方式在双方同意后才互相可见。',
      '本地活动:发布者可以选择联系方式是否公开;不公开时,只有响应者与发布者互相公开后才可见。',
      '我们不向任何第三方出售或提供你的联系方式。',
    ]},
    { heading: '禁止的行为', paragraphs: [
      '禁止批量采集、自动化抓取本站的联系方式或帖子内容;禁止用本站信息骚扰他人。违者封禁,并保留追究的权利。',
    ]},
    { heading: '删除与更正', paragraphs: [
      '在「我的」里输入发布时的联系方式和编辑密码,可以随时删除或修改自己的帖子和留言。',
      `忘了密码、或想删除与你相关的其他数据,发邮件到 ${CONTACT_EMAIL},说明要删除的内容与你的联系方式,我们核对后处理。`,
    ]},
    { heading: '数据保留', paragraphs: [
      '删除的帖子会立即从站点消失。数据库每周备份一次,备份保留 90 天后自动销毁,所以已删除的数据最长可能在备份中再存留 90 天。',
      '访问日志与反滥用计数按需清理,通常不超过 60 天。',
    ]},
    { heading: '开源', paragraphs: [
      `本站代码在 GitHub 开源:${REPO} 。你可以查看我们到底存了什么、怎么处理。`,
    ]},
    { heading: '联系', paragraphs: [ `任何隐私相关的问题:${CONTACT_EMAIL}` ]},
  ],
};

const en: LegalContent = {
  title: 'Privacy Policy',
  updated: 'Updated 2026-09-17',
  intro: 'This is a free, personally maintained community site for Chinese residents and students in Blacksburg, VA. This page explains what we collect, who can see it, and how to delete it.',
  sections: [
    { heading: 'What we collect', paragraphs: [
      'What you enter: post title, description, photos, price, contact (WeChat / phone / email), nickname.',
      'Edit password: stored only as a salted hash. We cannot see or recover it.',
      'Access logs: IP address, browser identifier, path and referrer. Used only for abuse prevention (rate limits, report-based hiding) and aggregate stats; never shown tied to a person.',
      'An anonymous visitor id cookie (hb_vid) for de-duplicated counts, comment identity and contact exchange. It contains no personal data.',
      'If you sign in by email: your email address and a login session.',
    ]},
    { heading: 'Who can see your contact', paragraphs: [
      'Marketplace: a seller\'s contact is visible to site visitors one item at a time (after expanding a card), with a per-visitor hourly cap to prevent bulk harvesting. A commenter\'s contact is visible only to visitors who expand the thread and tap reveal, under the same cap.',
      'Roommates: applicant and poster contacts are revealed to each other only after mutual consent.',
      'Local events: posters choose whether their contact is public. If not, it is shared only after poster and responder both opt in.',
      'We never sell or hand your contact to third parties.',
    ]},
    { heading: 'Prohibited', paragraphs: [
      'Bulk collection or automated scraping of contacts or posts, and using site data to harass anyone, are prohibited. Offenders are banned and we reserve the right to pursue further action.',
    ]},
    { heading: 'Delete or correct', paragraphs: [
      'Enter the contact and edit password you used when posting under "My" to delete or edit your posts and comments at any time.',
      `Forgot the password, or want other data about you removed? Email ${CONTACT_EMAIL} with what to delete and your contact; we verify and handle it.`,
    ]},
    { heading: 'Retention', paragraphs: [
      'Deleted posts disappear from the site immediately. The database is backed up weekly and backups are destroyed after 90 days, so deleted data may persist in backups for up to 90 days.',
      'Access logs and abuse counters are cleaned as needed, normally within 60 days.',
    ]},
    { heading: 'Open source', paragraphs: [ `The site\'s code is public on GitHub: ${REPO} . You can see exactly what we store and how it is handled.` ]},
    { heading: 'Contact', paragraphs: [ `Privacy questions: ${CONTACT_EMAIL}` ]},
  ],
};

export default function PrivacyPage() {
  return <LegalPage zh={zh} en={en} />;
}
