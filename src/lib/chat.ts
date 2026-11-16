// Shared, deliberately small message syntax. User HTML is never interpreted.
export const CHAT_REACTIONS = ['👍', '✅', '❤️', '🎉', '👀'] as const;
export const CHAT_FILE_ACCEPT =
  '.pdf,.doc,.docx,.xls,.xlsx,.pptx,.csv,.txt,.png,.jpg,.jpeg';
export function mentionIds(body: string) {
  return [
    ...new Set(
      [...body.matchAll(/@\[[^\]\r\n]{1,160}\]\(([a-f0-9-]{36})\)/gi)].map(
        (match) => match[1]!.toLowerCase(),
      ),
    ),
  ];
}
export function plainMessage(body: string) {
  return body
    .replace(/@\[([^\]\r\n]{1,160})\]\([a-f0-9-]{36}\)/gi, '@$1')
    .replace(/\*\*([^*\n]+)\*\*/g, '$1')
    .replace(/`([^`\n]+)`/g, '$1');
}
