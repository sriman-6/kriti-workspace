import { redirect } from 'next/navigation';

import { signOut } from '@/app/(public)/actions';
import { AppShell } from '@/components/layout/app-shell';
import { getCurrentUser } from '@/lib/auth/session';
import { getWorkspaceAccess } from '@/lib/services/workspace';

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>): Promise<React.JSX.Element> {
  const user = await getCurrentUser();
  if (!user) redirect('/');

  const access = await getWorkspaceAccess(user);

  return (
    <AppShell
      user={{
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        campus: user.campus,
        workspaceRole: access.role,
      }}
      signOutAction={signOut}
    >
      {children}
    </AppShell>
  );
}
