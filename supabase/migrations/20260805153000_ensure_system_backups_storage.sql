-- Ensure the private bucket required by BeforeRestore exists in every environment.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('system-backups', 'system-backups', false, 52428800, array['application/json']::text[])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;
