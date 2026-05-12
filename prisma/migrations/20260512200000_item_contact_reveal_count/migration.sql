-- 二手 Item 加联系方式查看次数统计
ALTER TABLE "Item" ADD COLUMN "contactRevealCount" INTEGER NOT NULL DEFAULT 0;
