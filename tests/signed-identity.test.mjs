import {test} from 'node:test'
import assert from 'node:assert/strict'
import {createHmac, createHash} from 'node:crypto'
import {signedRequestIdentity, callbackConfigFromEnv, claimJob} from '../dist/worker/index.js'
const secret = 'test-only-'.repeat(5)
test('signed callback authenticates each request with a fresh request-bound token', async () => {
 const config = callbackConfigFromEnv({KETQAT_API_BASE_URL:'https://control.example',KETQAT_JOB_ID:'job-1',KETQAT_JOB_ATTEMPT:'2',KETQAT_WORKER_AUTH_MODE:'signed-request',KETQAT_WORKER_CALLBACK_SECRET:secret})
 let called = false
 await claimJob({...config, fetchImpl:async (url,init)=>{
  called=true
  assert.equal(url,'https://control.example/api/execution/jobs/job-1/claim')
  assert.equal(init.redirect,'error')
  const token=init.headers.get('authorization').slice(7)
  const [h,p,s]=token.split('.')
  assert.equal(s,createHmac('sha256',secret).update(`${h}.${p}`).digest('base64url'))
  const claims=JSON.parse(Buffer.from(p,'base64url').toString())
  assert.equal(claims.exp-claims.iat,60)
  assert.equal(claims.attempt,2)
  assert.equal(claims.path,new URL(url).pathname)
  assert.equal(claims.sha256,createHash('sha256').update(init.body).digest('hex'))
  return Response.json({ok:true})
 }})
 assert.equal(called,true)
})
test('missing secret, unknown mode, and insecure hosted callback fail closed',()=>{
 assert.throws(()=>signedRequestIdentity('short'))
 const env={KETQAT_API_BASE_URL:'https://control.example',KETQAT_JOB_ID:'job-1',KETQAT_WORKER_AUTH_MODE:'signed-request'}
 assert.throws(()=>callbackConfigFromEnv(env))
 assert.throws(()=>callbackConfigFromEnv({...env,KETQAT_WORKER_AUTH_MODE:'typo'}))
 assert.throws(()=>callbackConfigFromEnv({...env,KETQAT_API_BASE_URL:'http://control.example',KETQAT_WORKER_CALLBACK_SECRET:secret}))
})
