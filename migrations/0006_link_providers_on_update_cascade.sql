-- Migration number: 0006   2026-05-11T00:00:00.000Z
-- Recreate link_providers with ON UPDATE CASCADE so renaming a link path
-- automatically updates all provider rows without a FK violation.

CREATE TABLE link_providers_new (
  path        TEXT NOT NULL REFERENCES links(path) ON DELETE CASCADE ON UPDATE CASCADE,
  provider_id TEXT NOT NULL,
  url         TEXT NOT NULL,
  PRIMARY KEY (path, provider_id)
);

INSERT INTO link_providers_new SELECT * FROM link_providers;

DROP TABLE link_providers;

ALTER TABLE link_providers_new RENAME TO link_providers;
