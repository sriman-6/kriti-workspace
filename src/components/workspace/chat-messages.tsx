'use client';
import Link from 'next/link';
import { useLayoutEffect, useRef } from 'react';
import {
  Download,
  ListTodo,
  MessageSquare,
  MoreHorizontal,
  Pin,
  Smile,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { initials } from '@/lib/format';
import { CHAT_REACTIONS } from '@/lib/chat';
import type { ChatMessage } from '@/lib/services/chat';
import { ChatText } from './chat-text';

const time = (date: string) =>
  new Intl.DateTimeFormat('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata',
  }).format(new Date(date));
const day = (date: string) =>
  new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  }).format(new Date(date));

export function ChatMessages({
  messages,
  members,
  owner,
  archived,
  onThread,
  onAction,
  hasOlder,
  loadOlder,
  loadingOlder,
  scrollKey = '',
  empty = 'Start the conversation. Share an update or a useful link.',
  parent,
}: {
  messages: ChatMessage[];
  members: { id: string; fullName: string }[];
  owner: boolean;
  archived: boolean;
  onThread?: (message: ChatMessage) => void;
  onAction: (input: object) => Promise<void>;
  hasOlder: boolean;
  loadOlder: () => void;
  loadingOlder: boolean;
  scrollKey?: string;
  empty?: string;
  parent?: ChatMessage | null;
}) {
  const scroll = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const position = useRef<{ first?: string; height: number; top: number }>({
    height: 0,
    top: 0,
  });
  const reset = useRef(scrollKey);
  useLayoutEffect(() => {
    const node = scroll.current;
    if (!node) return;
    const first = messages[0]?.id;
    if (reset.current !== scrollKey || !position.current.height)
      node.scrollTop = node.scrollHeight;
    else if (
      position.current.first !== first &&
      messages.some((message) => message.id === position.current.first)
    )
      node.scrollTop =
        position.current.top + node.scrollHeight - position.current.height;
    else if (atBottom.current) node.scrollTop = node.scrollHeight;
    reset.current = scrollKey;
    position.current = {
      first,
      height: node.scrollHeight,
      top: node.scrollTop,
    };
  }, [messages, scrollKey, parent]);
  function row(message: ChatMessage, compact = false) {
    return (
      <article
        key={message.id}
        id={`message-${message.id}`}
        className={`group relative px-3 hover:bg-muted/40 focus-within:bg-muted/40 sm:px-5 ${compact ? 'py-1' : 'pb-1 pt-4'}`}
        aria-label={`${message.authorName}, ${time(message.createdAt)}`}
      >
        <div className="flex min-w-0 gap-3">
          <div className="w-8 shrink-0">
            {!compact ? (
              <span
                aria-hidden="true"
                className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-[11px] font-semibold text-primary"
              >
                {initials(message.authorName)}
              </span>
            ) : (
              <time
                dateTime={message.createdAt}
                className="block pt-1 text-[10px] text-muted-foreground opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
              >
                {time(message.createdAt)}
              </time>
            )}
          </div>
          <div className="min-w-0 flex-1">
            {!compact ? (
              <div className="mb-0.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 pr-20">
                <span className="text-sm font-semibold">
                  {message.authorName}
                </span>
                <time
                  dateTime={message.createdAt}
                  title={`${day(message.createdAt)}, ${time(message.createdAt)} IST`}
                  className="text-[11px] text-muted-foreground"
                >
                  {time(message.createdAt)}
                </time>
              </div>
            ) : null}
            {message.isPinned ? (
              <span className="mb-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                <Pin className="size-3" />
                Pinned decision
              </span>
            ) : null}
            {message.body ? (
              <div className="whitespace-pre-wrap break-words text-sm leading-relaxed [overflow-wrap:anywhere]">
                <ChatText text={message.body} members={members} />
              </div>
            ) : null}
            {message.files.length ? (
              <ul className="mt-2 flex flex-wrap gap-2">
                {message.files.map((file) => (
                  <li key={file.id} className="min-w-0 max-w-full">
                    <a
                      href={`/api/groups/files/${file.id}`}
                      className="flex max-w-full items-center gap-3 rounded-lg border bg-card px-3 py-2 hover:border-primary/50"
                      download
                    >
                      <Download className="size-4 shrink-0 text-muted-foreground" />
                      <span className="min-w-0">
                        <span className="block truncate text-xs font-medium">
                          {file.name}
                        </span>
                        <span className="block text-[10px] text-muted-foreground">
                          {file.size >= 1024 * 1024
                            ? `${(file.size / 1024 / 1024).toFixed(1)} MB`
                            : `${Math.max(1, Math.round(file.size / 1024))} KB`}
                        </span>
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}
            {message.reactions.length ? (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {message.reactions.map((reaction) => (
                  <button
                    key={reaction.emoji}
                    disabled={archived}
                    aria-pressed={reaction.mine}
                    aria-label={`${reaction.emoji}, ${reaction.count} reactions${reaction.mine ? ', including you. Remove reaction' : '. Add reaction'}`}
                    className={`rounded-full border px-2 py-0.5 text-xs ${reaction.mine ? 'border-primary/40 bg-primary/10' : 'bg-card hover:bg-muted'}`}
                    onClick={() =>
                      void onAction({
                        operation: 'react',
                        messageId: message.id,
                        emoji: reaction.emoji,
                        active: !reaction.mine,
                      })
                    }
                  >
                    {reaction.emoji} <span>{reaction.count}</span>
                  </button>
                ))}
              </div>
            ) : null}
            {onThread && message.replyCount ? (
              <button
                className="mt-1.5 flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                onClick={() => onThread(message)}
              >
                <MessageSquare className="size-3" />
                {message.replyCount}{' '}
                {message.replyCount === 1 ? 'reply' : 'replies'}
              </button>
            ) : null}
          </div>
        </div>
        <div className="absolute right-2 top-0 flex items-center rounded-md border bg-background shadow-sm sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
          {onThread ? (
            <Button
              variant="ghost"
              size="icon-sm"
              className="hidden sm:inline-flex"
              aria-label="Reply in thread"
              title="Reply in thread"
              onClick={() => onThread(message)}
            >
              <MessageSquare className="size-3.5" />
            </Button>
          ) : null}
          {!archived ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="hidden sm:inline-flex"
                  aria-label="React to message"
                  title="React"
                >
                  <Smile className="size-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>React</DropdownMenuLabel>
                {CHAT_REACTIONS.map((emoji) => (
                  <DropdownMenuItem
                    key={emoji}
                    onSelect={() =>
                      void onAction({
                        operation: 'react',
                        messageId: message.id,
                        emoji,
                        active: !message.reactions.some(
                          (reaction) =>
                            reaction.emoji === emoji && reaction.mine,
                        ),
                      })
                    }
                  >
                    {emoji}
                    <span>
                      {message.reactions.some(
                        (reaction) => reaction.emoji === emoji && reaction.mine,
                      )
                        ? 'Remove reaction'
                        : 'Add reaction'}
                    </span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="More message actions"
                title="More"
              >
                <MoreHorizontal className="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {onThread ? (
                <DropdownMenuItem
                  className="sm:hidden"
                  onSelect={() => onThread(message)}
                >
                  <MessageSquare className="size-4" />
                  Reply in thread
                </DropdownMenuItem>
              ) : null}
              {!archived ? (
                <>
                  <DropdownMenuLabel className="sm:hidden">
                    React
                  </DropdownMenuLabel>
                  {CHAT_REACTIONS.map((emoji) => (
                    <DropdownMenuItem
                      key={emoji}
                      className="sm:hidden"
                      onSelect={() =>
                        void onAction({
                          operation: 'react',
                          messageId: message.id,
                          emoji,
                          active: !message.reactions.some(
                            (reaction) =>
                              reaction.emoji === emoji && reaction.mine,
                          ),
                        })
                      }
                    >
                      {emoji}{' '}
                      {message.reactions.some(
                        (reaction) => reaction.emoji === emoji && reaction.mine,
                      )
                        ? 'Remove reaction'
                        : 'Add reaction'}
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator className="sm:hidden" />
                </>
              ) : null}
              <DropdownMenuItem asChild>
                <Link href={`/work/new?message=${message.id}`}>
                  <ListTodo className="size-4" />
                  Create work from message
                </Link>
              </DropdownMenuItem>
              {owner ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={() =>
                      void onAction({
                        operation: message.isPinned ? 'unpin' : 'pin',
                        target: message.id,
                      })
                    }
                  >
                    <Pin className="size-4" />
                    {message.isPinned ? 'Unpin decision' : 'Pin decision'}
                  </DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </article>
    );
  }
  return (
    <div
      ref={scroll}
      role="region"
      aria-label={parent ? 'Thread messages' : 'Group messages'}
      tabIndex={0}
      className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-5 [overflow-anchor:none]"
      onScroll={() => {
        const node = scroll.current!;
        atBottom.current =
          node.scrollHeight - node.scrollTop - node.clientHeight < 100;
        position.current = {
          first: messages[0]?.id,
          height: node.scrollHeight,
          top: node.scrollTop,
        };
      }}
    >
      {parent ? <div className="border-b pb-4">{row(parent)}</div> : null}
      {hasOlder ? (
        <div className="py-3 text-center">
          <Button
            variant="ghost"
            size="sm"
            disabled={loadingOlder}
            onClick={loadOlder}
          >
            {loadingOlder ? 'Loading…' : 'Load older messages'}
          </Button>
        </div>
      ) : null}
      {!messages.length ? (
        <p className="px-5 py-12 text-center text-sm text-muted-foreground">
          {empty}
        </p>
      ) : (
        messages.map((message, index) => {
          const previous = messages[index - 1];
          const newDay =
            !previous || day(previous.createdAt) !== day(message.createdAt);
          const compact =
            !newDay &&
            previous.authorId === message.authorId &&
            new Date(message.createdAt).getTime() -
              new Date(previous.createdAt).getTime() <
              5 * 60 * 1000;
          return (
            <div key={message.id}>
              {newDay ? (
                <div className="my-3 flex items-center gap-3 px-5">
                  <span className="h-px flex-1 bg-border" />
                  <span className="text-[10px] font-medium text-muted-foreground">
                    {day(message.createdAt)}
                  </span>
                  <span className="h-px flex-1 bg-border" />
                </div>
              ) : null}
              {row(message, compact)}
            </div>
          );
        })
      )}
    </div>
  );
}
