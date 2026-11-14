/** Plain text and safe clickable HTTPS links. No user HTML is rendered. */
export function WorkText({ text }: { text: string }) {
  return (
    <>
      {text.split(/(https:\/\/[^\s<>]+)/g).map((part, index) => {
        if (!part.startsWith('https://')) return part;
        try {
          const url = new URL(part);
          if (url.protocol !== 'https:' || url.username || url.password)
            return part;
          return (
            <a
              key={index}
              href={url.href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline underline-offset-2"
            >
              {part}
            </a>
          );
        } catch {
          return part;
        }
      })}
    </>
  );
}
