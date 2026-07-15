-- Migration number: 0007   2026-07-13T00:00:00.000Z
-- Add per-link Slack click notification settings.
--   notify      — send a Slack message every time the link is clicked
--   notify_ping — prepend an @-mention of SLACK_USER_ID to that message

ALTER TABLE links ADD COLUMN notify INTEGER NOT NULL DEFAULT 0;
ALTER TABLE links ADD COLUMN notify_ping INTEGER NOT NULL DEFAULT 0;
