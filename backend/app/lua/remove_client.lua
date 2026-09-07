-- Atomically drop a client from the room and subtract their score from the sum.
-- Guarded by the HGET, so a double-remove (disconnect racing the reaper) is a no-op.
-- KEYS[1] = room:{id}:agg
-- KEYS[2] = room:{id}:seen
-- ARGV    = client_id
-- Returns { sum, count }
local old = redis.call('HGET', KEYS[1], ARGV[1])

if old then
  redis.call('HINCRBY', KEYS[1], ':sum', -tonumber(old))
  redis.call('HDEL', KEYS[1], ARGV[1])
end

redis.call('ZREM', KEYS[2], ARGV[1])

local n = redis.call('HLEN', KEYS[1])
if n <= 1 then
  -- only the ':sum' field (or nothing) is left; drop the stub so the room reads clean
  redis.call('DEL', KEYS[1])
  return { 0, 0 }
end

return { tonumber(redis.call('HGET', KEYS[1], ':sum')), n - 1 }
