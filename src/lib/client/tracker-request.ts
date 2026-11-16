export async function trackerRequest(
  id: string,
  input: object,
): Promise<{ ok: true; sheetId?: string }> {
  const response = await fetch(`/api/trackers/${id}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || data?.ok !== true)
    throw new Error(
      data?.error ??
        'Unable to save. Check your connection or sign in again. Your draft is still here.',
    );
  return data;
}
