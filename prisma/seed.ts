// 示例数据：让你启动后立刻看到效果
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// Lorem Picsum：用 seed 字符串保证每次返回同一张图
// https://picsum.photos/seed/{seed}/{w}/{h}
const pic = (seed: string) => `https://picsum.photos/seed/${seed}/600/600`;

async function main() {
  // 清掉已有数据
  await prisma.report.deleteMany();
  await prisma.inquiry.deleteMany();
  await prisma.item.deleteMany();

  const code = await bcrypt.hash('demo123', 10);

  const item1 = await prisma.item.create({
    data: {
      type: 'sell',
      title: 'IKEA MALM 书桌（白）',
      description: '8 成新，自取。轻微划痕但不影响使用。\n搬家急出，可议价。',
      price: 35,
      category: 'home',
      contactType: 'wechat',
      contactValue: 'demo_seller_wx',
      photoUrls: JSON.stringify([pic('desk1'), pic('desk2'), pic('desk3'), pic('desk4')]),
      editCodeHash: code,
    },
  });

  const item2 = await prisma.item.create({
    data: {
      type: 'sell',
      title: 'iPad Air 4 64G 银色',
      description: '2022 年买的，平时只刷剧用，电池健康 92%。带原装充电器。',
      price: 280,
      category: 'electronics',
      contactType: 'wechat',
      contactValue: 'apple_lover_2024',
      photoUrls: JSON.stringify([pic('ipad1'), pic('ipad2'), pic('ipad3')]),
      editCodeHash: code,
    },
  });

  const item3 = await prisma.item.create({
    data: {
      type: 'sell',
      title: 'Trek 26寸通勤自行车',
      description: '在 VT 校园骑了一年。带锁、车灯、菜筐。',
      price: 80,
      category: 'transport',
      contactType: 'phone',
      contactValue: '+1 540-555-1234',
      photoUrls: JSON.stringify([pic('bike1'), pic('bike2')]),
      editCodeHash: code,
    },
  });

  await prisma.item.create({
    data: {
      type: 'sell',
      title: 'CS 5510 教材 + 习题册',
      description: 'Algorithms 4th Edition by Sedgewick。无笔记。',
      price: 25,
      category: 'books',
      contactType: 'email',
      contactValue: 'student@vt.edu',
      photoUrls: JSON.stringify([pic('book1')]),
      editCodeHash: code,
    },
  });

  await prisma.item.create({
    data: {
      type: 'buy',
      title: '求购：电饭煲（中号）',
      description: '刚搬来，求一个 5–6 杯的电饭煲，象印或虎牌优先。',
      price: null,
      category: 'home',
      contactType: 'wechat',
      contactValue: 'newcomer_2026',
      photoUrls: JSON.stringify([]),  // 求购贴可以不带图
      editCodeHash: code,
    },
  });

  await prisma.item.create({
    data: {
      type: 'sell',
      title: '电吉他 Squier Strat',
      description: '入门电吉他，带音箱和调音器。',
      price: 120,
      category: 'other',
      customTag: '乐器',
      contactType: 'wechat',
      contactValue: 'guitar_hero_vt',
      photoUrls: JSON.stringify([pic('guitar1'), pic('guitar2'), pic('guitar3'), pic('guitar4'), pic('guitar5'), pic('guitar6')]),
      editCodeHash: code,
    },
  });

  // 房屋转租示例
  await prisma.item.create({
    data: {
      type: 'sell',
      title: '1B1B Foxridge 公寓 May–Aug 转租',
      description: '步行 15 分钟到 VT 校园，带家具，包水电网。\n月租含管理费，无押金转手。\n公寓楼有健身房、洗衣房、停车位。',
      price: 950,
      category: 'housing',
      contactType: 'wechat',
      contactValue: 'sublet_foxridge',
      photoUrls: JSON.stringify([pic('apt1'), pic('apt2'), pic('apt3'), pic('apt4')]),
      editCodeHash: code,
    },
  });

  // 房屋求租示例
  await prisma.item.create({
    data: {
      type: 'buy',
      title: '求租 studio / 1B1B，6 月起',
      description: '新生 8 月入学，提前来熟悉环境。\n预算 $1000 以内，校园附近优先，能短租 2-3 个月最好。\n安静、爱干净、不带宠物。',
      price: 1000,
      category: 'housing',
      contactType: 'wechat',
      contactValue: 'newgrad_2026fall',
      photoUrls: JSON.stringify([]),
      editCodeHash: code,
    },
  });

  // 给 item1 加几条询价做演示
  await prisma.inquiry.create({
    data: {
      itemId: item1.id,
      contactType: 'wechat',
      contactValue: 'buyer_a_2024',
      message: '$25 行不？我自取。',
    },
  });
  await prisma.inquiry.create({
    data: {
      itemId: item1.id,
      contactType: 'wechat',
      contactValue: 'buyer_b_2024',
      message: '还在吗？我能 $30 拿走。',
    },
  });
  await prisma.inquiry.create({
    data: {
      itemId: item2.id,
      contactType: 'phone',
      contactValue: '+1 540-555-9999',
      message: 'iPad 还在吗？能见面验机吗？',
    },
  });

  console.log('✅ Seed 完成。所有示例商品的识别码都是 demo123');
  console.log(`   创建了 8 件商品（含 2 个房屋）+ 3 条询价`);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
