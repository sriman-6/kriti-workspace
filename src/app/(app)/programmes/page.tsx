import { requireUser } from '@/lib/auth/session';
import { getWorkspaceAccess } from '@/lib/services/workspace';
import { getMasterTracker } from '@/lib/services/tracker';
import { listIdeas } from '@/lib/services/collaboration';
import { canUseIdeas } from '@/lib/workspace';
import { MasterTracker } from '@/components/workspace/master-tracker';
export const metadata = { title: 'Master Tracker' };
export default async function ProgrammesPage() {
  const user = await requireUser();
  const [access, items, ideas] = await Promise.all([getWorkspaceAccess(user), getMasterTracker(user), listIdeas(user)]);
  return <MasterTracker items={items} canCreate={access.canCreateProgrammes} showIdeas={canUseIdeas(access.role)} ideas={ideas.map((idea) => ({ id: idea.id, title: idea.title, initiativeId: idea.initiativeId, updatedAt: idea.updatedAt.toISOString() }))} />;
}
