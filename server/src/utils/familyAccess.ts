import { prisma } from '../config/db.js';

/**
 * Returns true if the user is a member of the given family.
 *
 * Use this to guard write paths that receive a familyId from the request body
 * or a socket payload — i.e. anywhere the `requireFamilyMember` route middleware
 * (which only reads req.params.familyId) does not apply.
 */
export async function isFamilyMember(
  userId: string,
  familyId: string,
): Promise<boolean> {
  const member = await prisma.familyMember.findUnique({
    where: { familyId_userId: { familyId, userId } },
    select: { id: true },
  });
  return member !== null;
}
