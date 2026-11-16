'use client';
import { useRef, useState } from 'react';
import { AtSign, Bold, Code, Loader2, Paperclip, Send, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { CHAT_FILE_ACCEPT } from '@/lib/chat';
import { prepareChatFiles } from '@/lib/client/chat-upload';
import { describeWorkFile } from '@/lib/work-files';

export async function chatRequest(groupId: string, input: object) {
  const response = await fetch(`/api/groups/${groupId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || data?.ok !== true)
    throw new Error(
      data?.error ??
        'Unable to send. Check your connection or sign in again. Your draft is still here.',
    );
}

export function ChatComposer({
  groupId,
  parentId,
  members,
  onSent,
  archived,
}: {
  groupId: string;
  parentId?: string;
  members: { id: string; fullName: string }[];
  onSent: (id: string) => void;
  archived: boolean;
}) {
  const [body, setBody] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [formatting, setFormatting] = useState(false);
  const [mention, setMention] = useState<{
    start: number;
    end: number;
    query: string;
  } | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const prepared = useRef<{
    files: File[];
    ids: string[];
    expires: number;
  } | null>(null);
  const attempt = useRef<{ signature: string; id: string } | null>(null);
  const sending = useRef(false);
  const suggestions = mention
    ? members
        .filter((member) =>
          member.fullName.toLowerCase().includes(mention.query.toLowerCase()),
        )
        .slice(0, 6)
    : [];
  function updateMention(value: string, caret: number) {
    const match = /(?:^|\s)@([^@\n\[\]]{0,40})$/.exec(value.slice(0, caret));
    setMention(
      match
        ? { start: caret - match[1]!.length - 1, end: caret, query: match[1]! }
        : null,
    );
    setMentionIndex(0);
  }
  function insertMention(person: { id: string; fullName: string }) {
    if (!mention) return;
    const text = `@[${person.fullName.replace(/[\]\r\n]/g, '')}](${person.id}) `;
    const next = body.slice(0, mention.start) + text + body.slice(mention.end);
    if (next.length > 4000) return;
    setBody(next);
    setMention(null);
    requestAnimationFrame(() => {
      textarea.current?.focus();
      textarea.current?.setSelectionRange(
        mention.start + text.length,
        mention.start + text.length,
      );
    });
  }
  function insert(marker: string, placeholder: string) {
    const start = textarea.current?.selectionStart ?? body.length;
    const end = textarea.current?.selectionEnd ?? start;
    const text = body.slice(start, end) || placeholder;
    const next =
      body.slice(0, start) + marker + text + marker + body.slice(end);
    if (next.length > 4000) return;
    setBody(next);
    requestAnimationFrame(() => {
      textarea.current?.focus();
      textarea.current?.setSelectionRange(
        start + marker.length,
        start + marker.length + text.length,
      );
    });
  }
  async function send() {
    if (sending.current || (!body.trim() && !files.length)) return;
    sending.current = true;
    setBusy(true);
    setError('');
    setStatus('Sending…');
    try {
      let ids =
        prepared.current?.files === files &&
        prepared.current.expires > Date.now()
          ? prepared.current.ids
          : null;
      if (!ids) {
        ids = await prepareChatFiles(groupId, files, setStatus);
        prepared.current = { files, ids, expires: Date.now() + 45 * 60 * 1000 };
      }
      const signature = JSON.stringify([body.trim(), parentId, ids]);
      if (attempt.current?.signature !== signature)
        attempt.current = { signature, id: crypto.randomUUID() };
      await chatRequest(groupId, {
        operation: 'send',
        id: attempt.current.id,
        body,
        parentId,
        uploadIds: ids,
      });
      const sentId = attempt.current.id;
      setBody('');
      setFiles([]);
      setMention(null);
      prepared.current = null;
      attempt.current = null;
      setStatus('Sent');
      onSent(sentId);
      textarea.current?.focus();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Unable to send. Please try again.',
      );
      setStatus('');
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }
  if (archived)
    return (
      <p className="shrink-0 border-t px-5 py-5 text-sm text-muted-foreground">
        This group is archived. You can still read its conversations and files.
      </p>
    );
  return (
    <form
      className="shrink-0 bg-background px-3 pb-3 pt-2 sm:px-5"
      onSubmit={(event) => {
        event.preventDefault();
        void send();
      }}
    >
      <div className="relative rounded-xl border border-input bg-card focus-within:border-primary/60 focus-within:ring-1 focus-within:ring-primary/20">
        {suggestions.length ? (
          <div
            id={`mentions-${parentId ?? 'main'}`}
            role="listbox"
            aria-label="Group members"
            className="absolute bottom-full left-0 z-10 mb-2 w-full max-w-sm rounded-lg border bg-popover p-1 shadow-lg"
          >
            {suggestions.map((person, index) => (
              <button
                type="button"
                role="option"
                aria-selected={mentionIndex === index}
                id={`mention-${parentId ?? 'main'}-${index}`}
                key={person.id}
                className={`block w-full rounded px-3 py-2 text-left text-sm ${mentionIndex === index ? 'bg-accent' : 'hover:bg-accent'}`}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => insertMention(person)}
              >
                {person.fullName}
              </button>
            ))}
          </div>
        ) : null}
        <Textarea
          ref={textarea}
          id={`chat-composer-${parentId ?? 'main'}`}
          aria-label={parentId ? 'Reply to thread' : 'Message group'}
          aria-controls={
            suggestions.length ? `mentions-${parentId ?? 'main'}` : undefined
          }
          aria-activedescendant={
            suggestions.length
              ? `mention-${parentId ?? 'main'}-${mentionIndex}`
              : undefined
          }
          value={body}
          maxLength={4000}
          rows={2}
          disabled={busy}
          className="max-h-40 min-h-20 resize-y border-0 bg-transparent px-3 py-3 shadow-none focus-visible:ring-0"
          placeholder={
            parentId
              ? 'Reply in this thread…'
              : 'Share an update, decision or link…'
          }
          onChange={(event) => {
            setBody(event.target.value);
            setStatus('');
            updateMention(event.target.value, event.target.selectionStart);
          }}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return;
            if (
              suggestions.length &&
              ['ArrowDown', 'ArrowUp', 'Enter', 'Escape'].includes(event.key)
            ) {
              event.preventDefault();
              if (event.key === 'Escape') setMention(null);
              else if (event.key === 'Enter')
                insertMention(suggestions[mentionIndex]!);
              else
                setMentionIndex(
                  (index) =>
                    (index +
                      (event.key === 'ArrowDown'
                        ? 1
                        : suggestions.length - 1)) %
                    suggestions.length,
                );
            } else if (
              event.key === 'Enter' &&
              !event.shiftKey &&
              !event.altKey &&
              !event.ctrlKey &&
              !event.metaKey
            ) {
              event.preventDefault();
              void send();
            }
          }}
        />
        {files.length ? (
          <ul
            aria-label="Attached files"
            className="flex flex-wrap gap-2 px-3 pb-2"
          >
            {files.map((file, index) => (
              <li
                key={`${file.name}-${index}`}
                className="flex min-w-0 max-w-full items-center gap-2 rounded-md bg-muted px-2 py-1 text-xs"
              >
                <span className="truncate">{file.name}</span>
                <button
                  type="button"
                  disabled={busy}
                  aria-label={`Remove ${file.name}`}
                  className="rounded p-1 hover:bg-background"
                  onClick={() => {
                    setFiles(files.filter((_, i) => i !== index));
                    prepared.current = null;
                  }}
                >
                  <X className="size-3" />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <div className="flex items-center gap-1 px-2 pb-2">
          <input
            ref={fileInput}
            type="file"
            multiple
            accept={CHAT_FILE_ACCEPT}
            className="sr-only"
            tabIndex={-1}
            aria-label="Attach files"
            onChange={(event) => {
              const added = Array.from(event.target.files ?? []);
              event.target.value = '';
              try {
                if (files.length + added.length > 3)
                  throw new Error('Attach up to three files per message.');
                for (const file of added)
                  describeWorkFile(file.name, file.size);
                setFiles([...files, ...added]);
                prepared.current = null;
                setError('');
              } catch (cause) {
                setError(
                  cause instanceof Error
                    ? cause.message
                    : 'Choose supported files.',
                );
              }
            }}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Attach a file"
            title="Attach up to 3 files · 5 MB each"
            disabled={busy}
            onClick={() => fileInput.current?.click()}
          >
            <Paperclip className="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Mention a member"
            disabled={busy}
            onClick={() => {
              const start = textarea.current?.selectionStart ?? body.length;
              const text = (start && body[start - 1] !== ' ' ? ' ' : '') + '@';
              if (body.length + text.length > 4000) return;
              setBody(body.slice(0, start) + text + body.slice(start));
              setMention({
                start: start + text.length - 1,
                end: start + text.length,
                query: '',
              });
              setMentionIndex(0);
              textarea.current?.focus();
            }}
          >
            <AtSign className="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Formatting options"
            aria-expanded={formatting}
            disabled={busy}
            onClick={() => setFormatting(!formatting)}
          >
            <span className="text-sm underline">Aa</span>
          </Button>
          {formatting ? (
            <>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Bold text"
                disabled={busy}
                onClick={() => insert('**', 'bold text')}
              >
                <Bold className="size-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Code text"
                disabled={busy}
                onClick={() => insert('`', 'code')}
              >
                <Code className="size-4" />
              </Button>
            </>
          ) : null}
          <span
            role="status"
            className="ml-auto truncate px-2 text-xs text-muted-foreground"
          >
            {status}
          </span>
          <Button
            type="submit"
            size="icon-sm"
            disabled={busy || (!body.trim() && !files.length)}
            aria-label={
              error
                ? 'Retry sending message'
                : parentId
                  ? 'Send reply'
                  : 'Send message'
            }
          >
            {busy ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Send className="size-4" />
            )}
          </Button>
        </div>
      </div>
      {error ? (
        <p role="alert" className="mt-2 text-xs text-destructive">
          {error}{' '}
          <button
            type="submit"
            disabled={busy}
            className="font-medium underline"
          >
            Retry
          </button>
        </p>
      ) : (
        <p className="mt-1.5 hidden text-right text-[11px] text-muted-foreground sm:block">
          Enter to send · Shift + Enter for a new line
        </p>
      )}
    </form>
  );
}
