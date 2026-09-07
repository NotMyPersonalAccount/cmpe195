-- Atomically record a client's score and adjust the room's running sum.
-- KEYS[1] = room:{id}:agg   (hash: client_id -> score, plus reserved ':sum' field)
-- KEYS[2] = room:{id}:seen  (zset: client_id -> last-seen unix ms)
-- ARGV    = client_id, score, now_ms, ttl_s
-- Returns { sum, count }
local old = redis.call('HGET', KEYS[1], ARGV[1])
local new = tonumber(ARGV[2])

if old then
  redis.call('HINCRBY', KEYS[1], ':sum', new - tonumber(old))
else
  redis.call('HINCRBY', KEYS[1], ':sum', new)
end

redis.call('HSET', KEYS[1], ARGV[1], new)
redis.call('ZADD', KEYS[2], ARGV[3], ARGV[1])
redis.call('EXPIRE', KEYS[1], ARGV[4])
redis.call('EXPIRE', KEYS[2], ARGV[4])

return { tonumber(redis.call('HGET', KEYS[1], ':sum')), redis.call('HLEN', KEYS[1]) - 1 }
