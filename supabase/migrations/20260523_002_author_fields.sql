-- Add author/credit fields for embedded Tableau Public templates.
-- twbx_storage_path becomes optional (null when template links out to Tableau Public
-- instead of being hosted in our Storage bucket).

alter table tk_templates
  alter column twbx_storage_path drop not null;

alter table tk_templates
  add column if not exists author_name text,
  add column if not exists author_profile_url text,
  add column if not exists license_note text;

comment on column tk_templates.twbx_storage_path is 'Optional. If null, Download button links to tableau_public_url (the workbook is hosted on Tableau Public, not in our Storage).';
comment on column tk_templates.author_name is 'Original creator name (e.g. "Ken Flerlage"). null = TableauKit original.';
comment on column tk_templates.author_profile_url is 'Original creator profile URL.';
comment on column tk_templates.license_note is 'Free-form license/credit note (e.g. "Embedded from Tableau Public with permission; All rights to author.").';
