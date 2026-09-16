const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const read=(file)=>fs.readFileSync(path.join(root,file),'utf8');

const html=read('src/ops.html');
const css=read('src/v14-ops.css');
const js=read('src/v14-ops.js');

test('v14 operations workspace has explicit SaaS information architecture',()=>{
  assert.match(html,/Mosigo Operations/);
  assert.match(html,/data-view="overview"/);
  assert.match(html,/data-view="bookings"/);
  assert.match(html,/data-view="security"/);
  assert.match(html,/ops-booking-search/);
  assert.match(html,/ops-drawer/);
});

test('v14 uses real v13 ownership and v12 sharing APIs instead of mock admin data',()=>{
  assert.match(js,/\/api\/account/);
  assert.match(js,/resource=bookings/);
  assert.match(js,/\/api\/bookings\?bookingId=/);
  assert.match(js,/\/api\/booking-shares/);
  assert.doesNotMatch(js,/mockTeam|fakeRole|billingPlan|operatorAssignment/);
});

test('v14 visual polish includes responsive density, focus and reduced motion handling',()=>{
  assert.match(css,/--ops-sidebar:/);
  assert.match(css,/grid-template-columns:244px minmax\(0,1fr\)/);
  assert.match(css,/@media \(max-width:720px\)/);
  assert.match(css,/:focus-visible/);
  assert.match(css,/@media \(prefers-reduced-motion:reduce\)/);
  assert.match(css,/ops-table/);
  assert.match(css,/ops-drawer/);
});

test('v14 exposes accessible operational states',()=>{
  assert.match(html,/aria-live="polite"/);
  assert.match(html,/aria-current="page"/);
  assert.match(html,/aria-labelledby="ops-drawer-title"/);
  assert.match(js,/event\.key==='Escape'/);
  assert.match(js,/event\.key==='Tab'/);
});

test('v14 keeps release metadata independent until production verification',()=>{
  assert.doesNotMatch(html,/Current stable version/);
  assert.doesNotMatch(js,/VERSION/);
});
