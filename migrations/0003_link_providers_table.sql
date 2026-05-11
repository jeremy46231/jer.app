-- Migration number: 0003   2026-05-11T00:00:00.000Z

CREATE TABLE link_providers (
  path        TEXT NOT NULL REFERENCES links(path) ON DELETE CASCADE,
  provider_id TEXT NOT NULL,
  url         TEXT NOT NULL,
  PRIMARY KEY (path, provider_id)
);

INSERT INTO link_providers (path, provider_id, url)
  SELECT path, 'gofile',    gofile_url    FROM links WHERE gofile_url    IS NOT NULL;
INSERT INTO link_providers (path, provider_id, url)
  SELECT path, 'catbox',    catbox_url    FROM links WHERE catbox_url    IS NOT NULL;
INSERT INTO link_providers (path, provider_id, url)
  SELECT path, 'litterbox', litterbox_url FROM links WHERE litterbox_url IS NOT NULL;
INSERT INTO link_providers (path, provider_id, url)
  SELECT path, 'hc-cdn',    hc_cdn_url    FROM links WHERE hc_cdn_url    IS NOT NULL;

ALTER TABLE links DROP COLUMN gofile_url;
ALTER TABLE links DROP COLUMN catbox_url;
ALTER TABLE links DROP COLUMN litterbox_url;
ALTER TABLE links DROP COLUMN hc_cdn_url;
