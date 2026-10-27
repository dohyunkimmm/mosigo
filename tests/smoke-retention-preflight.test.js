'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { OWNER, TTL_MS, assertIsolatedStore, createRunContext, planRetention } =
  require('../scripts/smoke-retention-preflight.js');

const PROD='store_PROD123', TEST='store_ISOLATED456';
const started=Date.parse('2026-10-01T12:00:00.000Z');
const metadata=()=>createRunContext({
  productionStoreId:PROD, testStoreId:TEST, now:started,
  entropy:()=>Buffer.from('0123456789abcdef','hex')
});

test('test run identity includes owner, bounded TTL, and distinct store', () => {
  const run=metadata();
  assert.match(run.runId, /^smoke-20261001T120000Z-[a-f0-9]{16}$/);
  assert.equal(run.testOwner, OWNER);
  assert.equal(run.storeId,TEST);
  assert.equal(Date.parse(run.expiresAt)-Date.parse(run.createdAt),TTL_MS);
  assert.throws(()=>assertIsolatedStore(PROD,PROD),/distinct/);
  assert.throws(()=>createRunContext({productionStoreId:PROD,testStoreId:PROD}),/distinct/);
  assert.throws(()=>createRunContext({productionStoreId:PROD,testStoreId:'mosigo/booking'}),/valid/);
});

test('offline retention plan never authorizes deletion and excludes uncertain records', () => {
  const run=metadata(), now=started+TTL_MS+1000;
  const records=[
    {...run,evidenceRef:'review-pending'},
    {...run,runId:'smoke-guessed',evidenceRef:'untrusted'},
    {...run,testOwner:'unknown',evidenceRef:'review-pending'},
    {...run,createdAt:'broken',evidenceRef:'review-pending'}
  ];
  const result=planRetention({productionStoreId:PROD,testStoreId:TEST,records,now});
  assert.deepEqual(result,{
    readOnly:true,safeToDelete:false,candidateDeletions:0,inspected:4,
    active:0,expiredNeedsIndependentProvenance:1,unattributed:3
  });
  const output=JSON.stringify(result);
  assert.doesNotMatch(output,/store_|smoke-2026|review-pending|mosigo\//);
});

test('future expiry remains active and invalid TTL cannot become a review candidate',()=>{
  const run=metadata();
  const records=[
    {...run,evidenceRef:'review-pending'},
    {...run,expiresAt:new Date(started+TTL_MS+1).toISOString(),evidenceRef:'review-pending'}
  ];
  const result=planRetention({productionStoreId:PROD,testStoreId:TEST,records,now:started+1000});
  assert.equal(result.active,1);
  assert.equal(result.unattributed,1);
  assert.equal(result.candidateDeletions,0);
});

test('any production or cross-store record rejects the whole plan',()=>{
  const run={...metadata(),evidenceRef:'review-pending'};
  for(const wrong of [PROD,'store_OTHER789']){
    assert.throws(()=>planRetention({
      productionStoreId:PROD,testStoreId:TEST,
      records:[run,{...run,storeId:wrong}],now:started+TTL_MS+1
    }),/record encountered/);
  }
  assert.throws(()=>planRetention({productionStoreId:PROD,testStoreId:TEST,records:new Array(10001)}),/Bounded/);
});

test('preflight module has no Blob client, network or destructive file methods',()=>{
  const source=fs.readFileSync(path.join(__dirname,'../scripts/smoke-retention-preflight.js'),'utf8');
  assert.doesNotMatch(source, /@vercel\/blob|\bfetch\(|https?:\/\/|\b(?:get|put|del|copy)\s*\(|\bunlink\s*\(|rmSync/);
});
