'use client';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function ChatPanel({
  open,
  onOpenChange,
  title,
  children,
  side = 'right',
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: React.ReactNode;
  side?: 'left' | 'right';
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/25" />
        <Dialog.Content
          aria-describedby={undefined}
          className={`fixed inset-y-0 z-50 flex w-full max-w-md flex-col border-border bg-background shadow-xl outline-none ${side === 'left' ? 'left-0 border-r' : 'right-0 border-l'}`}
        >
          <div className="flex h-16 shrink-0 items-center justify-between gap-3 border-b px-5">
            <Dialog.Title className="text-base font-semibold">
              {title}
            </Dialog.Title>
            <Dialog.Close asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Close ${title.toLowerCase()}`}
              >
                <X className="size-4" />
              </Button>
            </Dialog.Close>
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
