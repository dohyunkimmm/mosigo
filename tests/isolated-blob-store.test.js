'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { authorizeIsolatedWrite, checkIsolatedStore } =
  require('../scripts/check-isolated-blob-store.js');

const PROD='store_PROD321', ISOLATED='store_TEST654', TOKEN='fake-short-lived-test-token';
const env = {
  MOSIGO_ISOLATED_WRITE_ONCE:'yes',
  MOSIGO_ISOLATED_ACCEPT_RETAINED_MARKER:'yes',
  MOSIGO_SMOKE_PRODUCTION_STORE_ID:PROD,
  MOSIGO_SMOKE_CONFIRMED_PRODUCTION_STORE_ID:PROD,
  MOSIGO_SMOKE_TEST_STORE_ID:ISOLATED,
  MOSIGO_SMOKE_CONFIRMED_TEST_STORE_ID:ISOLATED,
  VERCEL_OIDC_TOKEN:TOKEN
};

test('manual probe fails closed on target ambiguity, production use or ambient tokens',()=>{
  assert.deepEqual(authorizeIsolatedWrite(env), {
    productionStoreId: PROD, testStoreId: ISOLATED, oidcToken:TOKEN
  });
  assert.deepEqual(authorizeIsolatedWrite({...env,BLOB_STORE_ID:ISOLATED}), {
    productionStoreId: PROD, testStoreId: ISOLATED, oidcToken:TOKEN
  });
  for(const delta of [
    {MOSIGO_ISOLATED_WRITE_ONCE:''},
    {MOSIGO_ISOLATED_ACCEPT_RETAINED_MARKER:''},
    {MOSIGO_SMOKE_PRODUCTION_STORE_ID:ISOLATED},
    {MOSIGO_SMOKE_CONFIRMED_PRODUCTION_STORE_ID:ISOLATED},
    {MOSIGO_SMOKE_CONFIRMED_PRODUCTION_STORE_ID:''},
    {MOSIGO_SMOKE_TEST_STORE_ID:PROD},
    {MOSIGO_SMOKE_TEST_STORE_ID:'store_invalid-unsafe'},
    {MOSIGO_SMOKE_CONFIRMED_TEST_STORE_ID:PROD},
    {VERCEL_OIDC_TOKEN:''},
    {BLOB_READ_WRITE_TOKEN:'secret-should-never-be-used'},
    {CI:'true'}, {GITHUB_ACTIONS:'true'}, {VERCEL:'1'},
    {VERCEL_ENV:'production'}, {VERCEL_URL:'example.vercel.app'},
    {BLOB_STORE_ID:'store_OTHER789'},
    {BLOB_STORE_ID:PROD},
    {MOSIGO_BLOB_STORE_ID:'store_OTHER789'}
  ]) assert.throws(()=>authorizeIsolatedWrite({...env,...delta}));
});

test('probe writes one non-overwriting private marker and verifies read and list',async()=>{
  const context=authorizeIsolatedWrite(env),calls=[];
  let pathname='', saved='';
  const blob={
    async put(name, data, options) {
      calls.push({method:'put',options});
      pathname=name; saved=data;
      assert.match(name,/^mosigo-isolated-smoke\/smoke-[0-9]{8}T[0-9]{6}Z-[a-f0-9]{16}\.json$/);
      assert.equal(options.access,'private');
      assert.equal(options.allowOverwrite,false);
      assert.equal(options.addRandomSuffix,false);
      assert.deepEqual(JSON.parse(data).testOwner,'mosigo-isolated-smoke');
      return {etag:'fake-etag'};
    },
    async get(name, options) {
      calls.push({method:'get',options});
      assert.equal(name,pathname);
      return { statusCode:200, stream:new ReadableStream({
        start(controller){controller.enqueue(new TextEncoder().encode(saved));controller.close();}
      })};
    },
    async list(options){
      calls.push({method:'list',options});
      assert.equal(options.prefix,pathname);
      assert.equal(options.limit,2);
      return {blobs:[{pathname}],hasMore:false};
    }
  };
  const summary=await checkIsolatedStore({
    context,blob,now:Date.parse('2026-10-28T02:00:00.000Z'),
    entropy:()=>Buffer.from('0123456789abcdef','hex')
  });
  assert.deepEqual(summary,{
    isolated:true,verifiedWriteReadList:true,markerCount:1,
    retentionDaysMetadataOnly:7,deletionEnabled:false,productionWrites:0
  });
  assert.deepEqual(calls.map(x=>x.method),['put','get','list']);
  assert.ok(calls.every(x=>x.options.storeId===ISOLATED&&x.options.oidcToken===TOKEN));
  assert.ok(calls.every(x=>x.options.storeId!==PROD));
  const r=JSON.stringify(summary);
  assert.doesNotMatch(r,/store_|fake-short-lived|\.json|https?:/);
});

test('probe refuses ambiguous readback and never tries to erase a marker',async()=>{
  const context=authorizeIsolatedWrite(env),ops=[];
  const client={
    async put(){ops.push('put');},
    async get(){ops.push('get');return {statusCode:404,stream:null};},
    async list(){ops.push('list');throw new Error('must not list after read error');},
    async del(){ops.push('del');}
  };
  await assert.rejects(()=>checkIsolatedStore({context,blob:client}),/readback/);
  assert.deepEqual(ops,['put','get']);
  const src=fs.readFileSync(path.join(__dirname,'../scripts/check-isolated-blob-store.js'),'utf8');
  assert.doesNotMatch(src,/\bblob\.(?:del|copy)\s*\(/);
});

test('probe never writes if its destination or credential is invalid',async()=>{
  let writes=0;
  const blob={put:async()=>{writes++;},get:async()=>{},list:async()=>{}};
  await assert.rejects(()=>checkIsolatedStore({
    context:{productionStoreId:PROD,testStoreId:PROD,oidcToken:TOKEN},blob
  }),/distinct/);
  await assert.rejects(()=>checkIsolatedStore({
    context:{productionStoreId:PROD,testStoreId:ISOLATED,oidcToken:''},blob
  }),/required/);
  assert.equal(writes,0);
});


test('manual write probe is never invoked by CI or production smoke workflows',()=>{
  for(const name of ['quality.yml','production-smoke.yml','browser-experience.yml','release.yml']){
    const content=fs.readFileSync(path.join(__dirname,'../.github/workflows',name),'utf8');
    assert.doesNotMatch(content,/check-isolated-blob-store|MOSIGO_ISOLATED_WRITE_ONCE/);
  }
  const packageJson=fs.readFileSync(path.join(__dirname,'../package.json'),'utf8');
  assert.doesNotMatch(packageJson,/"(?:quality|test|smoke:production)"[^\n]*check-isolated/);
});
