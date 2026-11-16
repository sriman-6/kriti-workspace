import { Fragment } from 'react';
import { WorkText } from './work-text';

/** Limited formatting and safe links. Never renders user-supplied HTML. */
export function ChatText({
  text,
  members,
}: {
  text: string;
  members: { id: string; fullName: string }[];
}) {
  return (
    <>
      {text
        .split(
          /(@\[[^\]\r\n]{1,160}\]\([a-f0-9-]{36}\)|\*\*[^*\n]+\*\*|`[^`\n]+`)/gi,
        )
        .map((part, index) => {
          const mention = /^@\[([^\]]+)\]\(([a-f0-9-]{36})\)$/i.exec(part);
          if (mention) {
            const name =
              members.find((member) => member.id === mention[2])?.fullName ??
              mention[1];
            return (
              <span
                key={index}
                className="rounded bg-primary/10 px-0.5 font-medium text-primary"
              >
                @{name}
              </span>
            );
          }
          if (part.startsWith('**') && part.endsWith('**'))
            return (
              <strong key={index}>
                <WorkText text={part.slice(2, -2)} />
              </strong>
            );
          if (part.startsWith('`') && part.endsWith('`'))
            return (
              <code
                key={index}
                className="rounded bg-muted px-1 py-0.5 text-[0.9em]"
              >
                {part.slice(1, -1)}
              </code>
            );
          return (
            <Fragment key={index}>
              <WorkText text={part} />
            </Fragment>
          );
        })}
    </>
  );
}
