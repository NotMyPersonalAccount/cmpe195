-- Atomically evict clients whose last heartbeat predates the cutoff.
-- Without this, a laptop that closed without a clean disconnect keeps skewing
-- the average until the room's TTL expires.
-- KEYS[1] = room:{id}:agg
-- KEYS[2] = room:{id}:seen
-- ARGV    = cutoff_ms
-- Returns { sum, count, reaped }
local stale = redis.call('ZRANGEBYSCORE', KEYS[2], '-inf', ARGV[1])

for _, id in ipairs(stale) do
  local old = redis.call('HGET', KEYS[1], id)
  if old then
    redis.call('HINCRBY', KEYS[1], ':sum', -tonumber(old))
    redis.call('HDEL', KEYS[1], id)
  end
  redis.call('ZREM', KEYS[2], id)
end

local n = redis.call('HLEN', KEYS[1])
if n <= 1 then
  redis.call('DEL', KEYS[1])
  return { 0, 0, #stale }
end

return { tonumber(redis.call('HGET', KEYS[1], ':sum')), n - 1, #stale }
