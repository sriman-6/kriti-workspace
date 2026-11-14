import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { MemberPicker } from './member-picker';
export function MeetingFields({
  people,
  selected = [],
  defaults,
}: {
  people: { id: string; fullName: string }[];
  selected?: string[];
  defaults?: {
    title: string;
    agenda: string;
    start: string;
    end: string;
    timezone: string;
    location: string;
    joinUrl: string | null;
  };
}) {
  return (
    <>
      <div className="space-y-1.5">
        <Label htmlFor="meeting-title">Meeting</Label>
        <Input
          id="meeting-title"
          name="title"
          required
          minLength={3}
          maxLength={160}
          defaultValue={defaults?.title}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="agenda">Agenda</Label>
        <Textarea
          id="agenda"
          name="agenda"
          rows={3}
          maxLength={8000}
          defaultValue={defaults?.agenda}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="meeting-start">Starts</Label>
          <Input
            id="meeting-start"
            name="start"
            type="datetime-local"
            required
            defaultValue={defaults?.start}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="meeting-end">Ends</Label>
          <Input
            id="meeting-end"
            name="end"
            type="datetime-local"
            required
            defaultValue={defaults?.end}
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="timezone">Timezone</Label>
        <select
          id="timezone"
          name="timezone"
          className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
          defaultValue={defaults?.timezone ?? 'Asia/Kolkata'}
        >
          <option value="Asia/Kolkata">India · IST (UTC+5:30)</option>
          <option value="Asia/Dubai">Dubai · GST (UTC+4)</option>
        </select>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="location">Room / location</Label>
          <Input
            id="location"
            name="location"
            maxLength={300}
            defaultValue={defaults?.location}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="joinUrl">Meeting link</Label>
          <Input
            id="joinUrl"
            name="joinUrl"
            type="url"
            placeholder="https://…"
            defaultValue={defaults?.joinUrl ?? ''}
          />
        </div>
      </div>
      <MemberPicker people={people} selected={selected} />
    </>
  );
}
