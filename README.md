Process-Locker
==============
Base on redis, same resource should only be processed once. Requests about the resource will be pending until process is complete and then the result will be returned 
基于redis，同一个资源仅会被处理一次，如果一个资源正在处理，当前请求都会被挂起，待处理完成后返回结果。

## Usage:
```
Locker = require('process-locker')
thunk = require('thunks')()
var locker = Locker()
var key = 'resource-key'
locker(key)(function (err, resp) {
	if (resp.status === Locker.status.LOCKED) {
    // do the process
    // ...
    // call publish when job done
    var result = {}
    thunk(locker.publish(key, result))()
  } else if (resp.status === Locker.status.DONE) {
  	// job with result
  }
})
```

## API:
### Locker(options)
return a locker instance
options:
- **redisConfig** *Object* use [thunk-redis](https://github.com/thunks/thunk-redis) config. Default: `['localhost:6379']`
- **redisPrefix** *String* Default: `locker`
- **channel** *String* channel name for redis subscribe Default: `channel`
- **resultTimeout** *Number* milliseconds to cache the process result Default: `30 * 60 * 1000`
- **lockTimeout** *Number* milliseconds to lock the process result Default: `60 * 60 * 1000`
- **logger** *Function* log the error when occurs(mostly for redis) Default: null

### Locker.LOCKED
locker locked the key name and you have the only permission to process the resource. So you are the real processor.
### Locker.DONE
locker received the real processor signal and notice all the request.

### locker.request (key)
Request status for process named `key`. If status is `Locker.status.LOCKED`, means you become the real processor. Return a thunk function used with [thunks](https://github.com/thunks/thunks) like `callback(err, resp)`
- **key** *String* the name of the process.
- **resp** *Object*
	- **status** see [Locker.status](#Locker.status) for detail
	- **result** the result processed by the real processor

### locker.publish *(key, object)
return a generator function or used by `callback(err)`
- **key** *String* the name of the process.
- **object** *Json* the result used to notcie all process/request

## TODO:
[ ] add timeout for request waiting the real processer