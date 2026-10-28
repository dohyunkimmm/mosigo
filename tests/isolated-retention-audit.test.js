'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  PREFIX, authorizeIsolatedAudit, auditIsolatedRetention
} = require('../scripts/audit-isolated-retention.js');

const PROD = 'store_PRODTEST123', TEST = 'store_ISOLATEDTEST456';
const TOKEN = 'do-not-print-scoped-token';
const env = {
  MOSIGO_ISOLATED_AUDIT_READ_ONLY: 'yes',
  MOSIGO_SMOKE_PRODUCTION_STORE_ID: PROD,
  MOSIGO_SMOKE_CONFIRMED_PRODUCTION_STORE_ID: PROD,
  MOSIGO_SMOKE_TEST_STORE_ID: TEST,
  MOSIGO_SMOKE_CONFIRMED_TEST_STORE_ID: TEST,
  VERCEL_OIDC_TOKEN: TOKEN
};
const context = authorizeIsolatedAudit(env);
const NOW = Date.parse('2026-10-28T09:00:00Z');

function marker(date, entropy = '0123456789abcdef', extras = {}) {
  const createdAt = new Date(date).toISOString();
  const compact = createdAt.replace(/[-:.]/g, '').slice(0, 15) + 'Z';
  const runId = 'smoke-' + compact + '-' + entropy;
  return {
    pathname: PREFIX + runId + '.json',
    record: {
      runId, testOwner: 'mosigo-isolated-smoke', storeId: TEST,
      createdAt, expiresAt: new Date(date + 7 * 86400000).toISOString(),
      evidenceRef: 'local-write-read-self-check', ...extras
    }
  };
}
function streamFor(value) {
  const bytes = new TextEncoder().encode(typeof value === 'string' ? value : JSON.stringify(value));
  return new ReadableStream({
    start(controller) { controller.enqueue(bytes); controller.close(); }
  });
}
function mockedBlob(pages, values, calls) {
  return {
    async list(options) {
      calls.push({ method: 'list', ...options });
      const page = options.cursor === 'page-2' ? 1 : 0;
      const result = pages[page];
      // SDK's uploadedAt comes from the store, not the marker JSON. Test mocks
      // supply an independent list timestamp; explicit overrides model drift.
      return {...result, blobs: result.blobs?.map(item => ({
        ...item,
        uploadedAt: item.uploadedAt === undefined
          ? values[item.pathname]?.createdAt
          : item.uploadedAt
      }))};
    },
    async get(pathname, options) {
      calls.push({ method: 'get', pathname, ...options });
      return {statusCode: 200, stream: streamFor(values[pathname])};
    },
    async put() { throw new Error('Unsafe put called'); },
    async del() { throw new Error('Unsafe del called'); }
  };
}

test('authorization rejects production targets, CI and ambient Blob tokens', () => {
  assert.deepEqual(context, { productionStoreId: PROD, testStoreId: TEST, oidcToken: TOKEN });
  assert.deepEqual(authorizeIsolatedAudit({...env,BLOB_STORE_ID:TEST}),context);
  for (const delta of [
    { MOSIGO_ISOLATED_AUDIT_READ_ONLY: '' },
    { MOSIGO_SMOKE_PRODUCTION_STORE_ID: TEST },
    { MOSIGO_SMOKE_CONFIRMED_PRODUCTION_STORE_ID: 'store_WRONG' },
    { MOSIGO_SMOKE_TEST_STORE_ID: PROD },
    { MOSIGO_SMOKE_CONFIRMED_TEST_STORE_ID: 'store_WRONG' },
    { MOSIGO_BLOB_STORE_ID: TEST },
    { BLOB_STORE_ID: PROD },
    { BLOB_READ_WRITE_TOKEN: 'secret' },
    { VERCEL_OIDC_TOKEN: '' },
    { CI: 'true' }, { GITHUB_ACTIONS: 'true' },
    { VERCEL: '1' }, { VERCEL_ENV: 'preview' },
    { VERCEL_URL: 'example.vercel.app' }
  ]) assert.throws(() => authorizeIsolatedAudit({...env,...delta}));
});

test('two bounded pages classify active, expired review, and unattributed markers', async () => {
  const old = marker(Date.parse('2026-10-01T12:00:00Z'));
  const fresh = marker(Date.parse('2026-10-27T12:00:00Z'), 'fedcba9876543210');
  const unknownPath = PREFIX + 'unknown.json';
  const calls = [];
  const report = await auditIsolatedRetention({
    context, now: NOW, pageSize: 3, maxPages: 2,
    blob: mockedBlob([
      {blobs:[{pathname:old.pathname,size:400}],hasMore:true,cursor:'page-2'},
      {blobs:[{pathname:fresh.pathname,size:400},{pathname:unknownPath,size:9}],hasMore:false}
    ], {[old.pathname]:old.record,[fresh.pathname]:fresh.record}, calls)
  });
  assert.deepEqual(report, {
    readOnly:true, safeToDelete:false, candidateDeletions:0,
    inspected:3, active:1, expiredNeedsIndependentProvenance:1,
    unattributed:1, complete:true, pages:2, maximumObjects:6
  });
  assert.deepEqual(calls.map(c=>c.method),['list','get','list','get']);
  assert.ok(calls.every(c=>c.storeId===TEST&&c.oidcToken===TOKEN));
  assert.ok(calls.filter(c=>c.method==='list').every(c=>c.prefix===PREFIX&&c.mode==='expanded'));
  assert.ok(calls.filter(c=>c.method==='get').every(c=>c.access==='private'&&c.useCache===false));
  assert.doesNotMatch(JSON.stringify(report),/store_|smoke-|\.json|do-not-print|mosigo\//);
});

test('partial pagination is explicitly incomplete and still cannot delete', async () => {
  const one = marker(Date.parse('2026-10-27T12:00:00Z'));
  const report = await auditIsolatedRetention({
    context, now:NOW, pageSize:1, maxPages:1,
    blob:mockedBlob([{blobs:[{pathname:one.pathname,size:400}],hasMore:true,cursor:'page-2'}],
      {[one.pathname]:one.record},[])
  });
  assert.equal(report.complete,false);
  assert.equal(report.active,1);
  assert.equal(report.candidateDeletions,0);
  assert.equal(report.safeToDelete,false);
});

test('path-to-run mismatch and corrupt marker content stay unattributed', async () => {
  const one = marker(Date.parse('2026-10-27T12:00:00Z'));
  const two = marker(Date.parse('2026-10-27T13:00:00Z'), 'fedcba9876543210');
  const report = await auditIsolatedRetention({
    context, now:NOW,
    blob:mockedBlob([{blobs:[
      {pathname:one.pathname,size:400},{pathname:two.pathname,size:20}
    ],hasMore:false}],{
      [one.pathname]:{...one.record,runId:'smoke-20261027T999999Z-0123456789abcdef'},
      [two.pathname]:'{invalid'
    },[])
  });
  assert.equal(report.inspected,2);
  assert.equal(report.unattributed,2);
});

test('mismatched record store, duplicate paths and escaped scopes fail closed',async()=>{
  const one=marker(Date.parse('2026-10-27T12:00:00Z'));
  await assert.rejects(()=>auditIsolatedRetention({
    context,now:NOW,blob:mockedBlob([
      {blobs:[{pathname:one.pathname,size:300}],hasMore:false}
    ],{[one.pathname]:{...one.record,storeId:PROD}},[])
  }),/Production Blob record encountered/);
  for(const records of [
    [{pathname:one.pathname,size:300},{pathname:one.pathname,size:300}],
    [{pathname:'mosigo/bookings/real-user.json',size:300}]
  ]) {
    await assert.rejects(()=>auditIsolatedRetention({
      context,now:NOW,blob:mockedBlob([{blobs:records,hasMore:false}],
        {[one.pathname]:one.record},[])
    }),/scope or repeated/);
  }
});

test('size limits, pagination ambiguity and malformed responses are rejected', async()=>{
  const one=marker(Date.parse('2026-10-27T12:00:00Z'));
  await assert.rejects(()=>auditIsolatedRetention({
    context,now:NOW,blob:mockedBlob([
      {blobs:[{pathname:one.pathname,size:4097}],hasMore:false}
    ],{},[])
  }),/size invalid/);
  await assert.rejects(()=>auditIsolatedRetention({
    context,now:NOW,pageSize:1,maxPages:2,blob:mockedBlob([
      {blobs:[],hasMore:true}
    ],{},[])
  }),/cursor/);
  await assert.rejects(()=>auditIsolatedRetention({
    context,now:NOW,pageSize:51,blob:{list(){},get(){}}
  }),/Bounded/);
  await assert.rejects(()=>auditIsolatedRetention({
    context:{...context,testStoreId:PROD},blob:{list(){},get(){}}
  }),/distinct/);
  // Listing metadata may understate remote bytes; stream read is bounded too.
  const tooLarge = {
    async list(){return {blobs:[{pathname:one.pathname,size:400,uploadedAt:one.record.createdAt}],hasMore:false};},
    async get(){return {stream:streamFor('x'.repeat(4097))};}
  };
  await assert.rejects(()=>auditIsolatedRetention({
    context, now:NOW, blob:tooLarge
  }),/size bound exceeded/);
});

test('manual read-only audit never writes and is absent from CI jobs', () => {
  const src = fs.readFileSync(path.join(__dirname,'../scripts/audit-isolated-retention.js'),'utf8');
  assert.doesNotMatch(src,/\bblob\.(?:put|del|copy)\s*\(/);
  assert.doesNotMatch(src,/https?:\/\/|console\.log\(/);
  for(const name of ['quality.yml','browser-experience.yml','production-smoke.yml','release.yml']) {
    const workflow=fs.readFileSync(path.join(__dirname,'../.github/workflows',name),'utf8');
    assert.doesNotMatch(workflow,/audit-isolated-retention|MOSIGO_ISOLATED_AUDIT_READ_ONLY/);
  }
});


test('remote lab E2E marker is recognized for retention counts but never for deletion',async()=>{
  const live=marker(Date.parse('2026-10-28T00:00:00Z'),'fedcba9876543210',{
    evidenceRef:'isolated-vercel-build-e2e'
  });
  const invalid=marker(Date.parse('2026-10-27T00:00:00Z'),'0123456789abcdef',{
    evidenceRef:'untrusted-self-declaration'
  });
  const calls=[];
  const report=await auditIsolatedRetention({
    context,now:NOW,pageSize:3,maxPages:1,
    blob:mockedBlob([{blobs:[
      {pathname:live.pathname,size:300},{pathname:invalid.pathname,size:300}
    ],hasMore:false}],{
      [live.pathname]:live.record,[invalid.pathname]:invalid.record
    },calls)
  });
  assert.equal(report.active,1);
  assert.equal(report.unattributed,1);
  assert.equal(report.safeToDelete,false);
  assert.equal(report.candidateDeletions,0);
  assert.equal(report.complete,true);
  assert.deepEqual(calls.map(x=>x.method),['list','get','get']);
  assert.ok(calls.every(x=>x.storeId===TEST&&x.oidcToken===TOKEN));
});


test('missing or drifted server upload timestamps are always unattributed, not delete candidates', async()=>{
  const run=marker(Date.parse('2026-10-27T12:00:00Z'));
  for (const uploadedAt of [null, '', 'invalid', '2026-10-27T11:45:00Z',
    '2026-10-27T12:06:00Z', '2026-10-30T12:00:00Z']) {
    const calls=[];
    const audit=await auditIsolatedRetention({
      context,now:NOW,
      blob:mockedBlob([{blobs:[
        {pathname:run.pathname,size:320,uploadedAt}
      ],hasMore:false}],{[run.pathname]:run.record},calls)
    });
    assert.equal(audit.inspected,1);
    assert.equal(audit.unattributed,1);
    assert.equal(audit.active,0);
    assert.equal(audit.safeToDelete,false);
    assert.equal(audit.candidateDeletions,0);
    // Invalid/future server metadata fails before get. Valid-but-drifted
    // server time can only be rejected after reading the marker's createdAt.
    const plausibleServerTime = ['2026-10-27T11:45:00Z',
      '2026-10-27T12:06:00Z'].includes(uploadedAt);
    assert.deepEqual(calls.map(call=>call.method),
      plausibleServerTime ? ['list','get'] : ['list']);
  }
});

test('server-verified upload time within five minutes permits an active marker review only',async()=>{
  const run=marker(Date.parse('2026-10-27T12:00:00Z'));
  const calls=[];
  const audit=await auditIsolatedRetention({
    context,now:NOW,blob:mockedBlob([{blobs:[
      {pathname:run.pathname,size:320,
        uploadedAt:new Date(Date.parse(run.record.createdAt)+240000)}
    ],hasMore:false}],{[run.pathname]:run.record},calls)
  });
  assert.equal(audit.active,1);
  assert.equal(audit.unattributed,0);
  assert.equal(audit.safeToDelete,false);
  assert.equal(audit.candidateDeletions,0);
  assert.deepEqual(calls.map(x=>x.method),['list','get']);
});
