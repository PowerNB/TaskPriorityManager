/*
  Warnings:

  - You are about to alter the column `title` on the `BotTask` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(200)`.
  - The `status` column on the `BotTask` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - Changed the type of `category` on the `BotTask` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "Category" AS ENUM ('CAREER', 'PERSONAL');

-- CreateEnum
CREATE TYPE "Status" AS ENUM ('ACTIVE', 'FROZEN', 'ARCHIVED', 'DONE', 'DELETED');

-- AlterTable
ALTER TABLE "BotTask" ALTER COLUMN "title" SET DATA TYPE VARCHAR(200),
DROP COLUMN "category",
ADD COLUMN     "category" "Category" NOT NULL,
DROP COLUMN "status",
ADD COLUMN     "status" "Status" NOT NULL DEFAULT 'ACTIVE';

-- DropEnum
DROP TYPE "TaskCategory";

-- DropEnum
DROP TYPE "TaskStatus";
