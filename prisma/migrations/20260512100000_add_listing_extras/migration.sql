-- 室友 listing 扩展字段：模糊入住时间 + 现住几人 + 是否带家具
-- 跟 ListingPostModal 类型差异化重构配套

ALTER TABLE "Listing" ADD COLUMN "moveInFuzzy" TEXT;
ALTER TABLE "Listing" ADD COLUMN "currentResidents" INTEGER;
ALTER TABLE "Listing" ADD COLUMN "furnished" BOOLEAN;
