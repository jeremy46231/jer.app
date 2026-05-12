-- Migration number: 0005   2026-05-11T00:00:00.000Z
-- Consolidate inline_file / attachment_file into a single 'file' type.

PRAGMA foreign_keys = OFF;

CREATE TABLE links_new (
  path             TEXT PRIMARY KEY,
  type             TEXT NOT NULL CHECK (type IN ('redirect', 'file')),
  redirect_url     TEXT,
  redirect_status  INTEGER NOT NULL DEFAULT 302,
  file             BLOB,
  content_type     TEXT,
  filename         TEXT,
  created_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
  download         BOOLEAN NOT NULL DEFAULT 0
);

INSERT INTO links_new (path, type, redirect_url, redirect_status, file, content_type, filename, created_at, download)
SELECT
  path,
  CASE WHEN type IN ('inline_file', 'attachment_file') THEN 'file' ELSE type END,
  redirect_url,
  redirect_status,
  file,
  content_type,
  filename,
  created_at,
  download
FROM links;

DROP TABLE links;
ALTER TABLE links_new RENAME TO links;

PRAGMA foreign_keys = ON;
