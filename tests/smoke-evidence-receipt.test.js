'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {createRunContext,TTL_MS}=require('../scripts/smoke-retention-preflight.js');
const {makeReadOnlyReceipt,verifyReadOnlyReceipt}=require('../scripts/smoke-evidence-receipt.js');

const PROD='store_REALPROD123',LAB='store_TESTLAB456';
const START=Date.parse('2026-10-28T00:00:00.000Z');
const run=createRunContext({
  productionStoreId:PROD,testStoreId:LAB,now:START,
  entropy:()=>Buffer.from('0123456789abcdef','hex')
});
const pathname='mosigo-isolated-smoke/'+run.runId+'.json';
const content=JSON.stringify({
  ...run, evidenceRef:'isolated-vercel-build-e2e'
});
const options={
  productionStoreId:PROD,testStoreId:LAB,pathname,content,
  uploadedAt:new Date(START+120000).toISOString(),
  listedSize:Buffer.byteLength(content),
  sourceDeploymentId:'dpl_VERIFIEDLabRun123',
  now:START+3600000
};

test('receipt hashes exact remote bytes and pathname, never includes either literal',()=>{
  const receipt=makeReadOnlyReceipt(options);
  assert.deepEqual(Object.keys(receipt).sort(),
    ['version','purpose','sourceDeploymentId','markerContentSha256',
     'markerPathSha256','uploadedAt','expiresAt','sizeBytes',
     'safeToDelete','deletionAuthorized'].sort());
  assert.equal(receipt.version,1);
  assert.equal(receipt.sizeBytes,Buffer.byteLength(content));
  assert.equal(Date.parse(receipt.expiresAt)-START,TTL_MS);
  assert.match(receipt.markerContentSha256,/^[a-f0-9]{64}$/);
  assert.match(receipt.markerPathSha256,/^[a-f0-9]{64}$/);
  assert.equal(receipt.deletionAuthorized,false);
  assert.equal(receipt.safeToDelete,false);
  assert.doesNotMatch(JSON.stringify(receipt),/store_|smoke-2026|mosigo-isolated-smoke\/|testOwner|VERCEL_OIDC_TOKEN/);
  assert.deepEqual(verifyReadOnlyReceipt(receipt,options),{
    matched:true,reviewOnly:true,safeToDelete:false,candidateDeletions:0
  });
});

test('independent receipt must match bytes, identity, server clock and size',()=>{
  const receipt=makeReadOnlyReceipt(options);
  const corrupt=JSON.stringify({...JSON.parse(content),testOwner:'unknown'});
  const tooLate=new Date(START+360000).toISOString();
  for(const change of [
    {content:corrupt,listedSize:Buffer.byteLength(corrupt)},
    {pathname:'mosigo-isolated-smoke/smoke-20261028T010000Z-0123456789abcdef.json'},
    {uploadedAt:tooLate},
    {listedSize:Buffer.byteLength(content)+1},
    {testStoreId:PROD},
    {sourceDeploymentId:'invalid'},
    {now:START-360000},
    {content:'{not-json',listedSize:9},
    {content:'a'.repeat(4097),listedSize:4097}
  ]) {
    assert.throws(()=>makeReadOnlyReceipt({...options,...change}));
  }
  const alternate=JSON.stringify({...JSON.parse(content),evidenceRef:'untrusted'});
  assert.throws(()=>makeReadOnlyReceipt({...options,content:alternate,
    listedSize:Buffer.byteLength(alternate)}),/provenance/);
  assert.throws(()=>verifyReadOnlyReceipt(receipt,{
    ...options,content:content+' ',listedSize:Buffer.byteLength(content)+1
  }),/digest/);
});

test('untrusted receipt edits cannot create deletion authorization',()=>{
  const receipt=makeReadOnlyReceipt(options);
  for(const change of [
    {safeToDelete:true},{deletionAuthorized:true},{version:2},
    {markerContentSha256:'0'.repeat(64)},
    {markerPathSha256:'invalid'},
    {uploadedAt:new Date(START).toISOString()},
    {sourceDeploymentId:'dpl_FakeOther123'},
    {arbitrary:true}
  ]) {
    assert.throws(()=>verifyReadOnlyReceipt({...receipt,...change},options));
  }
  assert.equal(Object.isFrozen(receipt),true);
});

test('receipt logic is offline-only and never calls Blob read/write/delete SDKs',()=>{
  const source=fs.readFileSync(path.join(__dirname,'../scripts/smoke-evidence-receipt.js'),'utf8');
  assert.doesNotMatch(source,/@vercel\/blob|\bfetch\(|\bblob\.(?:list|get|put|del|copy)\s*\(|\bunlink\(/);
});
