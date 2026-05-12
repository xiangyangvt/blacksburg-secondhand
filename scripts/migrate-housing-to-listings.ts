// ⚠️ 已废弃 —— Sprint 4 上线时只有 1 条 housing 数据，Sean 手动重发更简单
//
// 如果将来又有大量旧 housing item 需要批量迁移，参考这个思路：
//   - prisma.item.findMany({ where: { category: 'housing', status: { in: ['active','hidden'] } } })
//   - 对每条创建 Listing：
//       type: sell→'sublet', buy→'co_rent'
//       hasPlace: sell→true, buy→false
//       posterGender: 'unspecified' (用户后续补)
//       budgetMin/Max: 用原 price 填两个
//   - 用 id 前缀 'mig_<原id>' 防 collision
//   - 跑前先备份（E6 workflow）
//
// 真要恢复跑：把下面 placeholder 去掉，恢复原逻辑

console.log('migrate-housing-to-listings.ts 已废弃 —— 当前不再支持自动迁移');
console.log('如有需要请手动 sql 或重新启用此脚本');
process.exit(0);
