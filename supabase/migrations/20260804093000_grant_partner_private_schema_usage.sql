-- The server invokes the public lifecycle RPCs with service_role.  Those
-- RPCs resolve the private interval helper in app_private, so service_role
-- needs schema USAGE in addition to the helper's EXECUTE privilege.
-- Keep the schema private to ordinary client roles.
grant usage on schema app_private to service_role;
