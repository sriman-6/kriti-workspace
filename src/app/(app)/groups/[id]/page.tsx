import { notFound } from 'next/navigation';
import { z } from 'zod';
import { requireUser } from '@/lib/auth/session';
import { getChat, getChatMessage, listChatGroups } from '@/lib/services/chat';
import { listContacts } from '@/lib/services/collaboration';
import { NotFoundError } from '@/lib/errors';
import { ChatWorkspace } from '@/components/workspace/chat-workspace';

export const metadata = { title: 'Discussion' };
export default async function GroupPage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ thread?: string }>;
}) {
  const user = await requireUser();
  const [{ id }, query] = await Promise.all([params, searchParams]);
  if (!z.uuid().safeParse(id).success || (query.thread && !z.uuid().safeParse(query.thread).success)) notFound();
  let props;
  try {
    const [initial, initialGroups] = await Promise.all([getChat(user, id), listChatGroups(user)]);
    const contacts = initial.group.ownerId === user.id ? await listContacts(user) : [];
    let initialThread = null;
    if (query.thread) {
      const message = await getChatMessage(user, query.thread);
      if (message.groupId !== id || message.parentId) notFound();
      initialThread = (await getChat(user, id, { thread: query.thread })).parent;
    }
    props = { initial, initialGroups, contacts, userId: user.id, initialThread };
  } catch (error) { if (error instanceof NotFoundError) notFound(); throw error; }
  return <ChatWorkspace key={id} {...props} />;
}
