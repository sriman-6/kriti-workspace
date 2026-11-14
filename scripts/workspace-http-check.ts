import './bootstrap';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { SignJWT } from 'jose';
import { LOCAL_DB_DIR } from './bootstrap';

// Pure HTTP: never opens a database alongside the running application.
const base = process.env.SMOKE_URL ?? 'http://localhost:3002';
const fixture = JSON.parse(
  fs.readFileSync(path.join(LOCAL_DB_DIR, 'http-fixture.json'), 'utf8'),
) as Record<string, string>;
const key = new TextEncoder().encode(
  process.env.SESSION_SECRET ??
    'kriti-development-secret-not-for-production-use',
);
function decode(value: string) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}
async function cookie(user: string) {
  return `kriti_session=${await new SignJWT({ sub: fixture[user] }).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('1h').sign(key)}`;
}
async function get(route: string, user: string) {
  const response = await fetch(base + route, {
    headers: { cookie: await cookie(user) },
    redirect: 'manual',
  });
  return { response, html: (await response.text()).replace(/<!--.*?-->/g, '') };
}
function form(html: string, field: string) {
  const forms = [...html.matchAll(/<form\b[\s\S]*?<\/form>/g)].map(
    (match) => match[0],
  );
  const selected = forms.find((markup) => markup.includes(`name="${field}"`));
  assert(selected, `Form with ${field} is server-rendered.`);
  const data = new FormData();
  for (const input of selected.matchAll(/<input\b[^>]*>/g)) {
    const attributes = Object.fromEntries(
      [...input[0].matchAll(/([\w:$-]+)="([^"]*)"/g)].map((match) => [
        match[1],
        decode(match[2]!),
      ]),
    );
    if (attributes.type === 'hidden' && attributes.name)
      data.append(attributes.name, attributes.value ?? '');
  }
  assert(
    [...data.keys()].some((name) => name.startsWith('$ACTION_')),
    'Server action reference is present.',
  );
  return data;
}
async function post(route: string, user: string, data: FormData) {
  return fetch(base + route, {
    method: 'POST',
    headers: { cookie: await cookie(user), origin: base },
    body: data,
    redirect: 'manual',
  });
}
async function main() {
  const create = await get('/work/new', 'head');
  assert.equal(create.response.status, 200);
  const data = form(create.html, 'title');
  for (const [name, value] of Object.entries({
    title: 'HTTP verified assignment',
    description: 'Create, upload, revise and accept.',
    programmeId: fixture.programmeId!,
    ownerId: fixture.intern!,
    reviewerId: fixture.lead!,
    dueOn: '2026-12-01',
    priority: 'normal',
  }))
    data.set(name, value);
  const created = await post('/work/new', 'head', data);
  assert.equal(
    created.status,
    303,
    `Task creation failed: ${await created.text()}`,
  );
  const location = created.headers.get('location')!;
  assert.match(location, /\/work\/[a-f0-9-]+/);
  let page = await get(location, 'intern');
  assert(page.html.includes('HTTP verified assignment'));
  const upload = form(page.html, 'summary');
  upload.set('summary', 'First delivery with attached PDF.');
  upload.set('links', '');
  upload.append(
    'files',
    new File(['%PDF-1.4\nHTTP upload check'], 'http-check.pdf', {
      type: 'application/pdf',
    }),
  );
  const submitted = await post(location, 'intern', upload);
  assert(submitted.status < 400);
  await submitted.text();
  page = await get(location, 'lead');
  assert(page.html.includes('Version 1'));
  const download = page.html.match(/href="(\/api\/work\/files\/[a-f0-9-]+)"/);
  assert(download, 'Download link rendered.');
  const file = await fetch(base + download[1], {
    headers: { cookie: await cookie('lead') },
  });
  assert.equal(file.status, 200);
  assert.equal(await file.text(), '%PDF-1.4\nHTTP upload check');
  const forbidden = await fetch(base + download[1], {
    headers: { cookie: await cookie('outsider') },
  });
  assert.equal(forbidden.status, 404);
  const review = form(page.html, 'decision');
  review.set('decision', 'changes_requested');
  review.set('feedback', 'Include next steps.');
  const returned = await post(location, 'lead', review);
  assert(returned.status < 400);
  await returned.text();
  page = await get(location, 'intern');
  assert(page.html.includes('Include next steps.'));
  const revised = form(page.html, 'summary');
  revised.set('summary', 'Next steps added.');
  revised.set('links', 'https://docs.google.com/document/d/http-check/edit');
  const resubmitted = await post(location, 'intern', revised);
  assert(resubmitted.status < 400);
  await resubmitted.text();
  page = await get(location, 'lead');
  assert(page.html.includes('Version 2'));
  const accept = form(page.html, 'decision');
  accept.set('decision', 'accepted');
  accept.set('feedback', 'Accepted after revision.');
  const accepted = await post(location, 'lead', accept);
  assert(accepted.status < 400);
  await accepted.text();
  page = await get(location, 'intern');
  assert(page.html.includes('Completed'));
  assert(page.html.includes('Accepted after revision.'));
  assert(page.html.includes('Include next steps.'));
  for (const retired of [
    '/svc',
    '/students',
    '/gradebook',
    '/attendance',
    '/api/export/report',
  ]) {
    const result = await get(retired, 'head');
    assert.equal(
      result.response.status,
      404,
      `Retired route still exists: ${retired}`,
    );
  }
  const outsiderList = await get('/work', 'outsider');
  assert(!outsiderList.html.includes('HTTP verified assignment'));
  const library = await get('/library', 'intern');
  assert(library.html.includes('http-check.pdf'));
  assert(!(await get('/library', 'outsider')).html.includes('http-check.pdf'));

  const groupList = await get('/groups', 'head');
  const newGroup = form(groupList.html, 'name');
  newGroup.set('name', 'HTTP work group');
  newGroup.set('description', 'Private delivery discussion');
  newGroup.append('memberIds', fixture.intern!);
  const groupCreated = await post('/groups', 'head', newGroup);
  assert.equal(groupCreated.status, 303);
  const groupLocation = groupCreated.headers.get('location')!;
  let groupPage = await get(groupLocation, 'intern');
  const message = form(groupPage.html, 'body');
  message.set('body', 'HTTP group update: delivery accepted.');
  const sent = await post(groupLocation, 'intern', message);
  assert(sent.status < 400);
  await sent.text();
  groupPage = await get(groupLocation, 'head');
  assert(groupPage.html.includes('HTTP group update: delivery accepted.'));
  assert(
    !(await get(groupLocation, 'outsider')).html.includes(
      'HTTP group update: delivery accepted.',
    ),
  );

  const ideaList = await get('/ideas', 'head');
  const newIdea = form(ideaList.html, 'title');
  newIdea.set('title', 'HTTP initiative idea');
  newIdea.set('body', 'Private rough notes for a new initiative.');
  const ideaCreated = await post('/ideas', 'head', newIdea);
  assert.equal(ideaCreated.status, 303);
  const ideaLocation = ideaCreated.headers.get('location')!;
  assert(
    !(await get(ideaLocation, 'intern')).html.includes(
      'Private rough notes for a new initiative.',
    ),
  );
  let ideaPage = await get(ideaLocation, 'head');
  const shareIdea = form(ideaPage.html, 'title');
  shareIdea.set('title', 'HTTP initiative idea');
  shareIdea.set('body', 'Private rough notes for a new initiative.');
  shareIdea.append('memberIds', fixture.intern!);
  const shared = await post(ideaLocation, 'head', shareIdea);
  assert(shared.status < 400);
  await shared.text();
  assert(
    (await get(ideaLocation, 'intern')).html.includes(
      'Private rough notes for a new initiative.',
    ),
  );
  ideaPage = await get(ideaLocation, 'head');
  const activate = form(ideaPage.html, 'leadId');
  activate.set('leadId', fixture.lead!);
  const activated = await post(ideaLocation, 'head', activate);
  assert.equal(activated.status, 303);
  assert(
    (await get('/programmes', 'lead')).html.includes('HTTP initiative idea'),
  );

  const meetingList = await get('/meetings', 'head');
  const newMeeting = form(meetingList.html, 'start');
  for (const [name, value] of Object.entries({
    title: 'HTTP progress meeting',
    agenda: 'Review delivery and agree follow-up.',
    start: '2030-01-15T10:00',
    end: '2030-01-15T11:00',
    timezone: 'Asia/Kolkata',
    location: 'KRITI office',
    joinUrl: 'https://meet.google.com/example',
  }))
    newMeeting.set(name, value);
  newMeeting.append('memberIds', fixture.intern!);
  const meetingCreated = await post('/meetings', 'head', newMeeting);
  assert.equal(meetingCreated.status, 303);
  const meetingLocation = meetingCreated.headers.get('location')!;
  let meetingPage = await get(meetingLocation, 'intern');
  assert(meetingPage.html.includes('HTTP progress meeting'));
  const response = form(meetingPage.html, 'response');
  response.set('response', 'accepted');
  const responded = await post(meetingLocation, 'intern', response);
  assert(responded.status < 400);
  await responded.text();
  const meetingId = meetingLocation.split('/').pop();
  const calendar = await fetch(`${base}/api/meetings/${meetingId}/calendar`, {
    headers: { cookie: await cookie('intern') },
  });
  assert.equal(calendar.status, 200);
  assert((await calendar.text()).includes('BEGIN:VCALENDAR'));
  assert.equal(
    (
      await fetch(`${base}/api/meetings/${meetingId}/calendar`, {
        headers: { cookie: await cookie('outsider') },
      })
    ).status,
    404,
  );
  meetingPage = await get(meetingLocation, 'head');
  const outcome = form(meetingPage.html, 'minutes');
  outcome.set('status', 'completed');
  outcome.set('minutes', 'Agreed the next deliverable and its owner.');
  const completedMeeting = await post(meetingLocation, 'head', outcome);
  assert(completedMeeting.status < 400);
  await completedMeeting.text();
  assert(
    (await get(meetingLocation, 'intern')).html.includes(
      'Agreed the next deliverable and its owner.',
    ),
  );
  // A regular member can create work without a delegator, and explicitly share it.
  const ownPage = await get('/work/new', 'intern');
  assert.equal(ownPage.response.status, 200);
  const ownData = form(ownPage.html, 'title');
  for (const [name, value] of Object.entries({
    title: 'HTTP self-created work', description: 'Member-owned work with selected visibility.',
    ownerId: fixture.intern!, reviewerId: '', programmeId: '', dueOn: '2026-12-10', priority: 'normal',
  })) ownData.set(name, value);
  ownData.append('viewerIds', fixture.lead!);
  ownData.append('viewerIds', fixture.head!);
  const ownCreated = await post('/work/new', 'intern', ownData);
  assert.equal(ownCreated.status, 303, await ownCreated.text());
  const ownLocation = ownCreated.headers.get('location')!;
  assert((await get(ownLocation, 'lead')).html.includes('HTTP self-created work'));
  assert(!(await get(ownLocation, 'outsider')).html.includes('HTTP self-created work'));
  let ownDetail = await get(ownLocation, 'intern');
  const ownSubmit = form(ownDetail.html, 'summary');
  ownSubmit.set('summary', 'Work completed, with an attached PDF for people following it.');
  ownSubmit.set('links', '');
  ownSubmit.append('files', new File(['%PDF-1.4\nself-created work'], 'self-created.pdf', { type: 'application/pdf' }));
  const ownCompleted = await post(ownLocation, 'intern', ownSubmit);
  assert(ownCompleted.status < 400);
  await ownCompleted.text();
  const sharedWork = await get(ownLocation, 'lead');
  assert(sharedWork.html.includes('Completed by owner'));
  assert(!sharedWork.html.includes('name="decision"'));
  assert(!sharedWork.html.includes('name="summary"'));
  const ownDownload = sharedWork.html.match(/href="(\/api\/work\/files\/[a-f0-9-]+)"/)!;
  assert.equal((await fetch(base + ownDownload[1], { headers: { cookie: await cookie('lead') } })).status, 200);
  ownDetail = await get(ownLocation, 'intern');
  const revoke = form(ownDetail.html, 'viewerIds');
  revoke.delete('viewerIds');
  const revoked = await post(ownLocation, 'intern', revoke);
  assert(revoked.status < 400);
  await revoked.text();
  assert(!(await get(ownLocation, 'lead')).html.includes('HTTP self-created work'));
  assert.equal((await fetch(base + ownDownload[1], { headers: { cookie: await cookie('lead') } })).status, 404);
  assert(!(await get('/library', 'lead')).html.includes('self-created.pdf'));
  assert((await get(ownLocation, 'head')).html.includes('HTTP self-created work'));

  assert(!(await get('/programmes', 'intern')).html.includes('Create a programme'));
  const programmeForm = form((await get('/programmes', 'head')).html, 'code');
  programmeForm.set('name', 'Forbidden intern programme');
  programmeForm.set('code', 'FORBIDDEN-INTERN');
  programmeForm.set('description', 'Must never be created.');
  const forbiddenProgramme = await post('/programmes', 'intern', programmeForm);
  assert((await forbiddenProgramme.text()).includes('does not allow programme creation'));
  assert(!(await get('/programmes', 'head')).html.includes('Forbidden intern programme'));
  for (const actor of ['lead', 'manager', 'support']) {
    const onboarding = await get('/people', actor);
    assert(onboarding.html.includes('Add a member'));
    assert(!onboarding.html.includes('<option value="head"'));
    const member = form(onboarding.html, 'fullName');
    member.set('fullName', `HTTP new member from ${actor}`);
    member.set('email', `http-member-${actor}@gmail.com`);
    member.set('role', 'student');
    member.set('externalEmailApproval', 'yes');
    const registered = await post('/people', actor, member);
    assert(registered.status < 400);
    const registeredBody = await registered.text();
    assert(registeredBody.includes('Workspace responsibility saved.'));
    assert((await get('/people', 'head')).html.includes(`HTTP new member from ${actor}`));
    const forged = form((await get('/people', actor)).html, 'fullName');
    forged.set('fullName', 'Forbidden Head grant');
    forged.set('email', `forged-head-${actor}@bits-pilani.ac.in`);
    forged.set('role', 'head');
    const rejected = await post('/people', actor, forged);
    assert((await rejected.text()).includes('Ask the Head'));
    assert(!(await get('/people', 'head')).html.includes('Forbidden Head grant'));
  }
  assert(!(await get('/people', 'intern')).html.includes('name="fullName"'));
  console.log('PASS: Program Head, Manager and Administrative Support onboarding through real forms; external approval captured; senior-role forgery denied.');
  console.log('PASS: self-created work → selected viewers → completion without review → viewer/file access revoked; Head oversight retained; intern programme creation denied through the real action.');
  console.log(
    'PASS: task assignment → PDF upload → private download → revision request → Google link resubmission → acceptance.',
  );
  console.log(
    'PASS: previous versions and feedback retained; outsider access denied; retired course routes are unavailable.',
  );
  console.log(
    'PASS: private groups, messages, private/shared ideas, initiative activation, meeting invitations, RSVP, calendar export and minutes through actual Server Action forms.',
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
