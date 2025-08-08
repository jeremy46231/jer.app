-- Migration number: 0002 	 2025-07-14T00:00:00.000Z

-- Add provider-specific URL columns for multi-location file storage
ALTER TABLE links ADD COLUMN gofile_url TEXT;
ALTER TABLE links ADD COLUMN catbox_url TEXT;
ALTER TABLE links ADD COLUMN litterbox_url TEXT;
ALTER TABLE links ADD COLUMN hc_cdn_url TEXT;
ALTER TABLE links ADD COLUMN redirect_url TEXT;

-- For redirect links, move url to redirect_url
UPDATE links SET redirect_url = url WHERE type = 'redirect';

-- For attachment files, we need to determine which provider was used based on the URL
UPDATE links SET gofile_url = url WHERE type = 'attachment_file' AND url LIKE '%gofile.io%';
UPDATE links SET catbox_url = url WHERE type = 'attachment_file' AND url LIKE '%files.catbox.moe%';
UPDATE links SET litterbox_url = url WHERE type = 'attachment_file' AND url LIKE '%litter.catbox.moe%';
UPDATE links SET hc_cdn_url = url WHERE type = 'attachment_file' AND url LIKE '%hc-cdn.hel1.your-objectstorage.com%';

ALTER TABLE links DROP COLUMN url;
