'use client';

// /terms — 服务条款(Sprint 9B)。

import { LegalPage, type LegalContent } from '@/components/LegalPage';

const CONTACT_EMAIL = 'yangxiang5136@gmail.com';

const zh: LegalContent = {
  title: '服务条款',
  updated: '更新于 2026-09-17',
  intro: '使用本站即表示你同意以下规则。规则很短,请读完。',
  sections: [
    { heading: '这是什么', paragraphs: [
      '一个免费的本地信息板:二手买卖、室友与转租、本地活动。本站只负责展示信息,不参与交易,不担保任何帖子的真实性。交易与见面请自行判断风险。',
    ]},
    { heading: '你可以', paragraphs: [
      '免登录发布、编辑、删除自己的帖子;用联系方式和编辑密码管理它们;对不当内容点举报。',
    ]},
    { heading: '你不可以', paragraphs: [
      '发布枪支、毒品、活物、违法物品或服务;发布虚假、诈骗、侵权内容;冒用他人身份或联系方式。',
      '批量采集、自动化抓取本站的联系方式或内容;绕过限流;用本站信息骚扰、推销或转售。',
      '恶意举报、灌水、刷计数。',
    ]},
    { heading: '我们会怎么做', paragraphs: [
      '被多次举报的帖子会自动隐藏;违规的帖子与访客会被删除或封禁,不另行通知。',
      '本站按现状提供,可能随时下线或变更,不对因使用本站造成的损失负责。',
    ]},
    { heading: '隐私', paragraphs: [ '你的信息如何被收集与展示,见隐私政策。' ]},
    { heading: '联系', paragraphs: [ `规则相关的问题或申诉:${CONTACT_EMAIL}` ]},
  ],
};

const en: LegalContent = {
  title: 'Terms of Service',
  updated: 'Updated 2026-09-17',
  intro: 'By using this site you agree to the rules below. They are short; please read them.',
  sections: [
    { heading: 'What this is', paragraphs: [
      'A free local board: secondhand items, roommates and sublets, local events. The site only displays information. It is not a party to any transaction and does not vouch for any post. Judge risks yourself when trading or meeting.',
    ]},
    { heading: 'You may', paragraphs: [
      'Post, edit and delete your own posts without an account; manage them with your contact and edit password; report inappropriate content.',
    ]},
    { heading: 'You may not', paragraphs: [
      'Post firearms, drugs, live animals, illegal goods or services; post false, fraudulent or infringing content; impersonate others or use their contact.',
      'Bulk collect or automatically scrape contacts or content; circumvent rate limits; use site data to harass, market or resell.',
      'File abusive reports, spam, or inflate counters.',
    ]},
    { heading: 'What we do', paragraphs: [
      'Posts reported multiple times are hidden automatically; violating posts and visitors are removed or banned without notice.',
      'The site is provided as is, may go offline or change at any time, and we are not liable for losses from using it.',
    ]},
    { heading: 'Privacy', paragraphs: [ 'How your data is collected and shown is described in the Privacy Policy.' ]},
    { heading: 'Contact', paragraphs: [ `Questions or appeals: ${CONTACT_EMAIL}` ]},
  ],
};

export default function TermsPage() {
  return <LegalPage zh={zh} en={en} />;
}
