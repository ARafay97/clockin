-- Switches the punch code from time-rotating to static (printable): the
-- code now only changes when a manager explicitly rotates it, via
-- POST /api/admin/rotate-code, which increments this column.
alter table settings add column if not exists token_epoch integer not null default 1;

-- token_period_ms is no longer read anywhere in the app (the code doesn't
-- rotate on a timer any more) but is left in place rather than dropped, to
-- avoid a destructive schema change against a live database for a column
-- that costs nothing sitting unused.
