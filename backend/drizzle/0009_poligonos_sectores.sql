ALTER TABLE "sector" ADD COLUMN "points" jsonb;--> statement-breakpoint
ALTER TABLE "sector" ADD CONSTRAINT "sector_points_valid" CHECK ("sector"."points" IS NULL
      OR (jsonb_typeof("sector"."points") = 'array'
          AND jsonb_array_length("sector"."points") BETWEEN 3 AND 64
          AND "sector"."x" IS NOT NULL));