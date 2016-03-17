'use strict'
/* global describe, it, before, after */
const redis = require('thunk-redis')
const thunk = require('thunks')()
const Locker = require('../')
const assert = require('assert')

let redisClient = redis.createClient('localhost:6379')
let redisClient2 = redis.createClient('localhost:6379')

describe('main', function () {
  let locker
  let key = 'one-key'
  let key2 = 'one-key2'
  before(function *() {
    yield redisClient.del('locker:' + key)
    yield redisClient.del('locker:' + key2)
  })
  after(function *() {
    yield redisClient.del('locker:' + key)
    yield redisClient.del('locker:' + key2)
  })

  it('init locker', function *() {
    locker = Locker({
      processTimeout: 100
    })
    locker = Locker({
      redis: 'localhost:6379',
      subRedis: 'localhost:6379',
      redisPrefix: 'locker2',
      channel: 'newChannel',
      resultTimeout: 1000,
      lockTimeout: 200,
      processTimeout: 200
    })
    locker = Locker({
      redis: 'localhost:6379',
      subRedis: redisClient2,
      redisPrefix: 'locker2',
      channel: 'newChannel',
      resultTimeout: 1000,
      lockTimeout: 200,
      processTimeout: 200
    })
  })

  it('start to lock', function *() {
    let result = yield locker.request(key)
    assert.strictEqual(result.status, Locker.LOCKED)
  })
  it('wait lock', function (callback) {
    let result = { foo: 'bar' }
    let isReturned = false
    locker.request(key)(function (err, resp) {
      if (err) return callback(err)
      assert.strictEqual(resp.status, Locker.DONE)
      assert.strictEqual(resp.result.foo, result.foo)
      isReturned = true
    })

    thunk.delay(10)(function *() {
      assert.strictEqual(isReturned, false)
      yield locker.publish(key, result)
    })()

    thunk.delay(100)(function () {
      assert.strictEqual(isReturned, true)
      callback()
    })()
  })

  it('wait to timeout', function *() {
    yield locker.request(key2)
    try {
      yield locker.request(key2)
      console.error('should never run it!')
    } catch (e) {
      assert.strictEqual(e.message, 'process Timeout')
      yield locker.publish(key2, {})
    }
  })
})
