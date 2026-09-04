-- Add explicit spread markup revenue tracking to orders
ALTER TABLE "orders"
ADD COLUMN "spreadMarkupRevenue" DECIMAL(36,8) NOT NULL DEFAULT 0;
