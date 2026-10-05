-- Documents of any common type: Word, CSV and Excel files are converted to a
-- sanitised HTML fragment at upload time (in the adviser's browser) and stored
-- next to the original as <original path>.view.html. The original stays
-- downloadable; the viewer shows the converted copy.
--
--   format     how the viewer shows it: html (forecasts and other HTML files,
--              sandboxed iframe), docx/csv/xlsx (converted copy at view_path),
--              pdf, image, file (download only). Null on rows from before this
--              migration: the viewer falls back to the storage_path extension.
--   view_path  the converted copy, same bucket, same <client_id>/ folder.
--
-- Access control is unchanged and needs no new policies: the converted copy
-- lives in the same <client_id>/ folder as the original, so the existing
-- client-documents storage policies cover it --
--   SELECT  "own client folder or adviser select": adviser, or
--           (storage.foldername(name))[1] = the signed-in client's clients.id
--   INSERT/UPDATE/DELETE: adviser only
-- and wealth_os.documents rows stay readable by the adviser or the owning
-- client only (documents_select_own_or_adviser), writable by the adviser only.

alter table wealth_os.documents
  add column format text check (format in ('html','docx','csv','xlsx','pdf','image','file')),
  add column view_path text;
