-- Phase 3A.1: 类别 rename
-- events → life / sports → competition / news → discussion
-- 新增 exercise / academic 由后续数据填入

UPDATE "Event" SET "category" = 'life'        WHERE "category" = 'events';
UPDATE "Event" SET "category" = 'competition' WHERE "category" = 'sports';
UPDATE "Event" SET "category" = 'discussion'  WHERE "category" = 'news';
