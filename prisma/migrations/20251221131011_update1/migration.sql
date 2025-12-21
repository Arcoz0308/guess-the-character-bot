/*
  Warnings:

  - The primary key for the `SendedMessage` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the `Message` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `channelId` to the `SendedMessage` table without a default value. This is not possible if the table is not empty.
  - Added the required column `originalMessageChannelId` to the `SendedMessage` table without a default value. This is not possible if the table is not empty.
  - Added the required column `originalMessageId` to the `SendedMessage` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "SendedMessage" DROP CONSTRAINT "SendedMessage_pkey",
ADD COLUMN     "bot" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "channelId" TEXT NOT NULL,
ADD COLUMN     "originalMessageChannelId" TEXT NOT NULL,
ADD COLUMN     "originalMessageId" TEXT NOT NULL,
ADD CONSTRAINT "SendedMessage_pkey" PRIMARY KEY ("id", "guildId");

-- DropTable
DROP TABLE "Message";

-- CreateTable
CREATE TABLE "OriginalMessage" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "guildId" TEXT NOT NULL,

    CONSTRAINT "OriginalMessage_pkey" PRIMARY KEY ("id","channelId")
);

-- AddForeignKey
ALTER TABLE "OriginalMessage" ADD CONSTRAINT "OriginalMessage_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SendedMessage" ADD CONSTRAINT "SendedMessage_originalMessageId_originalMessageChannelId_fkey" FOREIGN KEY ("originalMessageId", "originalMessageChannelId") REFERENCES "OriginalMessage"("id", "channelId") ON DELETE RESTRICT ON UPDATE CASCADE;
