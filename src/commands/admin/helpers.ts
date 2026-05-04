import { prisma } from "#/prisma/prisma";
import { UserRole } from "../../../generated/prisma/enums";

export async function isBotAdmin(userId: string) {
  const user = await prisma.user.findUnique({
    where: {
      id: userId,
    },
    select: {
      roles: true,
    },
  });

  return user?.roles.includes(UserRole.ADMIN) ?? false;
}
