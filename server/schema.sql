CREATE TABLE IF NOT EXISTS match_cache (
 key text PRIMARY KEY, snapshot jsonb, next_refresh_at bigint NOT NULL DEFAULT 0,
 lease_token text, lease_until bigint NOT NULL DEFAULT 0, failures integer NOT NULL DEFAULT 0,
 last_error text, final_reconciled boolean NOT NULL DEFAULT false
);
CREATE TABLE IF NOT EXISTS answer_cache (key text PRIMARY KEY, answer jsonb NOT NULL, expires_at bigint NOT NULL);
CREATE INDEX IF NOT EXISTS answer_expiry ON answer_cache(expires_at);
CREATE TABLE IF NOT EXISTS usage_counters (key text PRIMARY KEY, count bigint NOT NULL DEFAULT 0, expires_at bigint NOT NULL);
CREATE TABLE IF NOT EXISTS ai_gate (id boolean PRIMARY KEY DEFAULT true CHECK(id), lease_token text, lease_until bigint NOT NULL DEFAULT 0, cooldown_until bigint NOT NULL DEFAULT 0);
INSERT INTO ai_gate(id) VALUES(true) ON CONFLICT DO NOTHING;
-- All quota checks and reservations share one short row lock, including across function instances.
CREATE OR REPLACE FUNCTION reserve_ai(p_session text,p_token text,p_tokens integer,p_daily integer,p_rpm integer,p_tpm integer,p_now bigint)
RETURNS TABLE(allowed boolean,retry_after_seconds integer) LANGUAGE plpgsql AS $$
DECLARE
 gate ai_gate%ROWTYPE;
 day_key text := to_char(to_timestamp(p_now/1000.0) AT TIME ZONE 'America/Los_Angeles','YYYY-MM-DD');
 request_key text := p_now::text;
 gd text := 'global-day:'||day_key;
 gm text := 'global-request:'||request_key;
 gt text := 'global-tokens:'||request_key;
 sd text := 'session-day:'||p_session||':'||day_key;
 sm text := 'session-request:'||p_session||':'||request_key;
BEGIN
 IF p_tokens<=0 OR p_daily<=0 OR p_rpm<=0 OR p_tpm<=0 OR p_tokens>p_tpm THEN
  RETURN QUERY SELECT false,60; RETURN;
 END IF;
 SELECT * INTO gate FROM ai_gate WHERE id=true FOR UPDATE;
 IF gate.lease_until>p_now OR gate.cooldown_until>p_now THEN
  RETURN QUERY SELECT false,GREATEST(1,ceil((GREATEST(gate.lease_until,gate.cooldown_until)-p_now)/1000.0)::integer); RETURN;
 END IF;
 IF COALESCE((SELECT count FROM usage_counters WHERE key=gd),0)>=p_daily OR COALESCE((SELECT count FROM usage_counters WHERE key=sd),0)>=10 THEN
  RETURN QUERY SELECT false,3600; RETURN;
 END IF;
 IF COALESCE((SELECT sum(count) FROM usage_counters WHERE key LIKE 'global-request:%' AND expires_at>p_now),0)>=p_rpm OR COALESCE((SELECT sum(count) FROM usage_counters WHERE key LIKE 'global-tokens:%' AND expires_at>p_now),0)+p_tokens>p_tpm OR COALESCE((SELECT sum(count) FROM usage_counters WHERE key LIKE 'session-request:'||p_session||':%' AND expires_at>p_now),0)>=3 THEN
  RETURN QUERY SELECT false,60; RETURN;
 END IF;
 INSERT INTO usage_counters(key,count,expires_at) VALUES
  (gd,1,p_now+172800000),(gm,1,p_now+60000),(gt,p_tokens,p_now+60000),(sd,1,p_now+172800000),(sm,1,p_now+60000)
 ON CONFLICT(key) DO UPDATE SET count=usage_counters.count+EXCLUDED.count;
 UPDATE ai_gate SET lease_token=p_token,lease_until=p_now+45000 WHERE id=true;
 DELETE FROM usage_counters WHERE expires_at<p_now;
 DELETE FROM answer_cache WHERE expires_at<p_now;
 RETURN QUERY SELECT true,0;
END;
$$;
