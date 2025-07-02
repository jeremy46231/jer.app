-- Migration number: 0001 	 2025-07-02T20:45:16.621Z

CREATE TABLE links (
  path TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('redirect', 'inline_file', 'attachment_file')),
  url TEXT,
  file BLOB,
  content_type TEXT,
  filename TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  download BOOLEAN NOT NULL DEFAULT 0
);
