'use strict'

const fs = require('fs')
const thunk = require('thunks')()
const debug = require('debug')('process-locker')
const thunkRedis = require('thunk-redis')
const luaAddSubScript = fs.readFileSync(__dirname + '/lua/add_sub.lua', {encoding: 'utf8'})
const luaDelPubScript = fs.readFileSync(__dirname + '/lua/del_pub.lua', {encoding: 'utf8'})

const STATUS = ['LOCKED', 'WAIT', 'DONE']

module.exports = Locker
STATUS.map(function (status) {
  Locker[status] = status
})

function noop () {}
function Locker (options) {
  options = options || {}

  let list = Object.create(null)
  let logger, redis, redisSub, redisPrefix, channel, resultTimeout, lockTimeout, processTimeout

  let redisConfig = options.redisConfig || ['localhost:6379']
  redisPrefix = options.redisPrefix || 'locker'
  channel = redisPrefix + ':' + (options.channel || 'channel')
  resultTimeout = options.resultTimeout || 30 * 60 * 1000
  lockTimeout = options.lockTimeout || 60 * 60 * 1000
  processTimeout = options.processTimeout || 10 * 60 * 1000
  logger = options.logger || noop

  redis = thunkRedis.createClient(redisConfig.hosts, redisConfig.options)
  redisSub = thunkRedis.createClient(redisConfig.hosts, redisConfig.options)

  initListener(redis)
  initListener(redisSub)
  let locker = {}
  locker.redis = redis

  function initListener (client) {
    return client
      .on('error', function (err) {
        err.class = 'thunk-redis'
        logger(err)
        if (err.code === 'ENETUNREACH') throw err
      })
      .on('close', function (err) {
        err = err || new Error('Redis client closed!')
        err.class = 'thunk-redis'
        logger(err)
        throw err
      })
  }

  redisSub.on('message', function (chl, json) {
    if (chl !== channel) return
    let key, value

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

    let callbackList = list[key] || []
    let callback
    let count = 0

    while ((callback = callbackList.shift())) {
      debug('process callback %s %d', key, count++)
      callback(null, {status: Locker.DONE, result: value})
    }
    delete list[key]
  }).subscribe(channel)()

  locker.request = function (key, _options) {
    _options = _options || {}
    return function (callback) {
      thunk(function *() {
        let callbackList = list[key] = list[key] || []
        let timer
        let _callback = callback
        callback = function () {
          if (timer) {
            clearTimeout(timer)
            timer = null
          }
          _callback.apply(null, arguments)
        }

        callbackList.push(callback)

        let result
        let redisKey = `${redisPrefix}:${key}`
        if (_options.get !== true) {
          result = yield redis.evalauto(luaAddSubScript, 1, redisKey, lockTimeout)
        } else {
          result = yield redis.get(redisKey)
        }
        debug('redis %s response %s', redisKey, result)

        timer = setTimeout(function () {
          let index = callbackList.indexOf(callback)
          if (index === -1) return
          callbackList.splice(index, 1)
          if (!callbackList.length) delete list[key]
          callback(new Error('process Timeout'))
        }, processTimeout)

        if (result === Locker.WAIT) {
          return
        }

        let index = callbackList.indexOf(callback)
        if (index === -1) return
        callbackList.splice(index, 1)
        if (!callbackList.length) delete list[key]

        if (result === Locker.LOCKED) {
          callback(null, {status: Locker.LOCKED})
        } else {
          callback(null, {status: Locker.DONE, result: JSON.parse(result)})
        }
      })()
    }
  }

  locker.publish = function *(key, value, timeout) {
    timeout = timeout || resultTimeout
    debug('publish %s', key)
    let redisKey = `${redisPrefix}:${key}`
    let result = yield redis.evalauto(luaDelPubScript, 2, redisKey, channel, JSON.stringify(value), timeout)
    debug('publish result %s', result)
    return result
  }

  return locker
}
