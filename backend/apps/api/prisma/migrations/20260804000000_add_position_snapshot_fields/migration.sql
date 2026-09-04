-- Add historical accounting snapshot fields to positions
ALTER TABLE "positions"
ADD COLUMN "leverageAtOpen" INTEGER,
ADD COLUMN "marginReservedUSD" DECIMAL(36,8);
