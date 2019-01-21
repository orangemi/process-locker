
-- KEYS[1] target fileKey
-- ARGV[1] key time out

-- local fileKey = KEYS[1]
local timeout = ARGV[1]

local result = redis.call('GET', KEYS[1])

if not result then
  redis.call('PSETEX', KEYS[1], timeout, 'WAIT')
  return 'LOCKED'
else
  return result
end
