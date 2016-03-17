Process-Locker
==============
Base on redis, one resource only be processed once. Requests about the resource will be pending until process is complete and then the result will be returned.
基于redis，同一个资源仅会被处理一次，如果一个资源正在处理，当前请求都会被挂起，待处理完成后返回结果。

## Usage:
```
var Locker = require('process-locker')
var locker = Locker()
var key = 'resource-key'
locker.request(key)(function (err, resp) {
  var result
	if (resp.status === Locker.LOCKED) {
    // do the process
    locker.publish(key, result)()
  } else if (resp.status === Locker.DONE) {
    result = resp.result
  }
  // process result
})
```

## API:
### Locker(options)
return a locker instance
options:
- **redis** *thunk-redis-client* or *string* use [thunk-redis](https://github.com/thunks/thunk-redis) client to lock and publish events. Default use: `localhost:6379`
- **subRedis** *thunk-redis-client* or *string* use [thunk-redis](https://github.com/thunks/thunk-redis) client to subscribe events. Default use: `localhost:6379`
- **redisPrefix** *String* Default: `locker`
- **channel** *String* channel name for redis subscribe Default: `channel`
- **resultTimeout** *Number* milliseconds to cache the process result Default: `30 * 60 * 1000`
- **lockTimeout** *Number* milliseconds to lock the process result Default: `60 * 60 * 1000`

### Locker.LOCKED
locker locked the key name and you have the only permission to process the resource. So you are the real processor.
### Locker.DONE
locker received the real processor signal and notice all requests.

### locker.request (key)
Request status for process named `key`. If status is `Locker.status.LOCKED`, means you become the real processor. Return a thunk function (use [thunks](https://github.com/thunks/thunks)) `callback(err, resp)`
- **key** *String* the name of the process.
- **resp** *Object*
	- **status** [Locker.LOCKED](#Locker.LOCKED) or [Locker.DONE](#Locker.DONE)
	- **result** *Object* the result published by the real processor

### locker.publish (key, result, timeout)
return a thunk function (use [thunks](https://github.com/thunks/thunks)) `callback(err)`
- **key** *String* name of the process.
- **result** *Object* result used to notice all requests
- **timeout** *Number* milliseconds to cache the process result that will publish for other request
