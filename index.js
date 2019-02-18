'use strict'

const fs = require('fs')
const path = require('path')
const debug = require('debug')('process-locker')
const thunkRedis = require('thunk-redis')
const luaAddSubScript = fs.readFileSync(path.join(__dirname, '/lua/add_sub.lua'), {encoding: 'utf8'})
const luaDelPubScript = fs.readFileSync(path.join(__dirname, '/lua/del_pub.lua'), {encoding: 'utf8'})

const STATUS = ['LOCKED', 'WAIT', 'DONE']

module.exports = Locker
STATUS.map(function (status) {
  Locker[status] = status
})

function noop () {}
function Locker (options) {
  options = options || {}

  var list = Object.create(null)
  var redis, subRedis, redisPrefix, channel, resultTimeout, lockTimeout

  redis = typeof options.redis === 'string' ? thunkRedis.createClient(options.redis) : options.redis || thunkRedis.createClient('localhost:6379')
  subRedis = typeof options.subRedis === 'string' ? thunkRedis.createClient(options.subRedis) : options.subRedis || thunkRedis.createClient('localhost:6379')
  redisPrefix = options.redisPrefix || 'locker'
  channel = redisPrefix + ':' + (options.channel || 'channel')
  resultTimeout = options.resultTimeout || 30 * 60 * 1000
  lockTimeout = options.lockTimeout || 60 * 60 * 1000

  var locker = {}
  locker.redis = redis
  locker.subRedis = subRedis

  subRedis.on('message', function (chl, json) {
    if (chl !== channel) return
    var key, value

    try {
      json = JSON.parse(json)
      if (!json || !json.key || !json.value) throw new Error('json type error')
      key = json.key.substr(redisPrefix.length + 1)
      value = JSON.parse(json.value)
    } catch (e) {
      debug('subscribe message error : %s', e)
      return
    }

    debug('process key : %s', key)
    list[key] = list[key] || []

    list[key].map(function (callback) {
      debug('process callback %s', key)
      process.nextTick(function () {
        callback(null, {status: Locker.DONE, result: value})
      })
    })
    delete list[key]
  }).subscribe(channel)()

  locker.request = function (key, _options) {
    _options = _options || {}
    return function (callback) {
      list[key] = list[key] || []
      var timer
      var _callback = callback || noop
      var called = false
      callback = function () {
        if (timer) clearTimeout(timer)
        if (called) return
        called = true
        _callback.apply(this, arguments)
      }

      list[key].push(callback)

      var nextFn
      var redisKey = `${redisPrefix}:${key}`
      if (_options.get !== true) {
        nextFn = redis.evalauto(luaAddSubScript, 1, redisKey, lockTimeout)
      } else {
        nextFn = redis.get(redisKey)
      }
      nextFn(function (err, result) {
        if (err) return callback(err)
        debug('redis %s response %s', redisKey, result)

        timer = setTimeout(function () {
          deleteCallback(key, callback)
          callback(new Error('lock timeout'))
        }, lockTimeout)

        if (result === Locker.WAIT) return

        deleteCallback(key, callback)
        if (result === Locker.LOCKED) {
          return callback(null, {status: Locker.LOCKED})
        } else {
          return callback(null, {status: Locker.DONE, result: JSON.parse(result)})
        }
      })
    }
  }

  locker.publish = function (key, result, timeout) {
    return function (callback) {
      callback = callback || noop
      timeout = timeout || resultTimeout
      debug('publish %s', key)
      var redisKey = `${redisPrefix}:${key}`
      redis.evalauto(luaDelPubScript, 1, redisKey, channel, JSON.stringify(result), timeout)(function (err, result) {
        if (err) return callback(err)
        debug('publish result %s', result)
        callback(null, result)
      })
    }
  }

  function deleteCallback (key, callback) {
    if (!list[key]) return
    var index = list[key].indexOf(callback)
    if (index === -1) return
    list[key].splice(index, 1)
    if (!list[key].length) delete list[key]
  }

  return locker
}
