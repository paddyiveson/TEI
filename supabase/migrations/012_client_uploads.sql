-- Wealth OS: client document uploads (redesign spec B9.3). NOT YET APPLIED.
-- REVIEW BEFORE APPLYING: this lets a client write to the documents table
-- and the client-documents bucket for the first time.
--
-- Settings > Documents lets a client send a statement, screenshot or payslip
-- to their coach. The file goes into the private client-documents bucket
-- under the client's own folder (<client_id>/...), with a documents row
-- marked review_status = 'pending'. The coach opens it, keys the figures
-- into Manual Entry and marks it 'added' (Adviser Workspace > Documents).
-- Nothing changes the client's figures automatically: that is the
-- existing coach approval step.
--
-- documents:
--   review_status  null for documents the coach shares; 'pending' or
--                  'added' for documents the client sends.
--   account_id     optional account the upload is about.
--
-- Policies added (existing ones are unchanged):
--   documents_insert_own_client_upload  a client may insert a row for their
--     own client_id only when review_status = 'pending' and the type is one
--     a client can send. They cannot update or delete it.
--   client_documents_insert_own_folder  a client may upload into
--     client-documents/<their client_id>/ only. Reading their own files is
--     covered by the bucket's existing policies (clients already open the
--     documents their coach shares).

-- Clients send type 'statement', 'screenshot', 'payslip' or 'other'. If
-- documents.type has a check constraint, extend it with 'screenshot' and
-- 'payslip' (the existing types are statement, report, note, forecast and
-- other).

alter table wealth_os.documents
  add column review_status text check (review_status in ('pending', 'added')),
  add column account_id uuid references wealth_os.accounts(id) on delete set null;
comment on column wealth_os.documents.review_status is 'Client uploads only: pending until the coach adds the figures, then added (redesign B9.3).';
comment on column wealth_os.documents.account_id is 'Optional account a client upload is about.';

drop policy if exists documents_insert_own_client_upload on wealth_os.documents;
create policy documents_insert_own_client_upload on wealth_os.documents
for insert to authenticated
with check (
  review_status = 'pending'
  and type in ('statement', 'screenshot', 'payslip', 'other')
  and exists (select 1 from wealth_os.clients c where c.id = client_id and c.user_id = auth.uid())
);

drop policy if exists client_documents_insert_own_folder on storage.objects;
create policy client_documents_insert_own_folder on storage.objects
for insert to authenticated
with check (
  bucket_id = 'client-documents'
  and exists (
    select 1 from wealth_os.clients c
    where c.id::text = (storage.foldername(name))[1] and c.user_id = auth.uid()
  )
);
