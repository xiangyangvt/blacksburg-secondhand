-- contactRevealCount 已被 cartCount (CartEntry 表 visitor 去重) 取代，删除字段
ALTER TABLE "Item" DROP COLUMN "contactRevealCount";
