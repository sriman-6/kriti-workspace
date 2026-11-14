import { Label } from '@/components/ui/label';
export function MemberPicker({
  people,
  selected = [],
  label = 'Invite people',
}: {
  people: { id: string; fullName: string }[];
  selected?: string[];
  label?: string;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="mb-2 text-sm font-medium">{label}</legend>
      {people.length ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {people.map((person) => (
            <Label
              key={person.id}
              className="flex items-center gap-2 font-normal"
            >
              <input
                type="checkbox"
                name="memberIds"
                value={person.id}
                defaultChecked={selected.includes(person.id)}
                className="size-4 accent-primary"
              />
              {person.fullName}
            </Label>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          People from your programmes and assignments will appear here.
        </p>
      )}
    </fieldset>
  );
}
