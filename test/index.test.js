'use strict'
/* global describe, it, before, after */
const thunk = require('thunks')()
const Locker = require('../')
const assert = require('assert')

let locker = Locker({
  redisConfig: {
    hosts: ['127.0.0.1:6379']
  }
})

describe('main', function () {
  let key = 'one-key'
  before(function *() {
    yield locker.redis.del('locker:' + key)
  })
  after(function *() {
    yield locker.redis.del('locker:' + key)
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
})
