-- Read-only application catalog for an isolated restore rehearsal.
-- No rows, passwords, sessions, integration values or storage objects are read.
-- Keep the resulting JSON private until reviewed: function bodies can contain literals.
WITH selected_schemas AS (
  SELECT oid, nspname FROM pg_namespace WHERE nspname IN ('public','app_private')
), selected_tables AS (
  SELECT c.*, n.nspname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE (n.nspname IN ('public','app_private') AND c.relkind IN ('r','p','v','m','S'))
     OR (n.nspname='auth' AND c.relname='users' AND c.relkind='r')
), selected_functions AS (
  SELECT p.*, n.nspname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname IN ('public','app_private','auth') AND p.prokind='f'
    AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid='pg_proc'::regclass
      AND d.objid=p.oid AND d.deptype='e')
)
SELECT jsonb_build_object(
  'format_version',2,
  'captured_at',now(),
  'postgres_version',current_setting('server_version'),
  'scope','Complete public/app_private application catalog and auth.users/identity functions. No data or platform services.',
  'schemas',(SELECT jsonb_agg(jsonb_build_object('name',nspname,'owner',pg_get_userbyid(nspowner),'acl',nspacl::text) ORDER BY nspname) FROM pg_namespace WHERE nspname IN ('public','app_private','auth','extensions')),
  'tables',(SELECT jsonb_agg(jsonb_build_object('schema',nspname,'name',relname,'kind',relkind,'owner',pg_get_userbyid(relowner),'rls',relrowsecurity,'force_rls',relforcerowsecurity,'options',reloptions) ORDER BY nspname,relname) FROM selected_tables),
  'columns',(SELECT jsonb_agg(jsonb_build_object('schema',c.nspname,'table',c.relname,'name',a.attname,'position',a.attnum,'type',format_type(a.atttypid,a.atttypmod),'not_null',a.attnotnull,'identity',a.attidentity,'generated',a.attgenerated,'default',pg_get_expr(d.adbin,d.adrelid)) ORDER BY c.nspname,c.relname,a.attnum) FROM selected_tables c JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum WHERE c.relkind IN ('r','p')),
  'constraints',(SELECT jsonb_agg(jsonb_build_object('schema',t.nspname,'table',t.relname,'name',c.conname,'type',c.contype,'validated',c.convalidated,'definition',pg_get_constraintdef(c.oid,true)) ORDER BY t.nspname,t.relname,c.conname) FROM pg_constraint c JOIN selected_tables t ON t.oid=c.conrelid),
  'indexes',(SELECT jsonb_agg(jsonb_build_object('schema',t.nspname,'table',t.relname,'name',i.relname,'definition',pg_get_indexdef(i.oid),'constraint_index',EXISTS(SELECT 1 FROM pg_constraint x WHERE x.conindid=i.oid)) ORDER BY t.nspname,t.relname,i.relname) FROM selected_tables t JOIN pg_index x ON x.indrelid=t.oid JOIN pg_class i ON i.oid=x.indexrelid),
  'functions',(SELECT jsonb_agg(jsonb_build_object('schema',nspname,'name',proname,'identity_args',pg_get_function_identity_arguments(oid),'owner',pg_get_userbyid(proowner),'acl',proacl::text,'definition',pg_get_functiondef(oid)) ORDER BY nspname,proname,oid) FROM selected_functions),
  'triggers',(SELECT jsonb_agg(jsonb_build_object('schema',c.nspname,'table',c.relname,'name',t.tgname,'enabled',t.tgenabled,'definition',pg_get_triggerdef(t.oid,true)) ORDER BY c.nspname,c.relname,t.tgname) FROM pg_trigger t JOIN selected_tables c ON c.oid=t.tgrelid WHERE NOT t.tgisinternal),
  'views',(SELECT jsonb_agg(jsonb_build_object('schema',nspname,'name',relname,'definition',pg_get_viewdef(oid,true),'options',reloptions) ORDER BY nspname,relname) FROM selected_tables WHERE relkind IN ('v','m')),
  'policies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY schemaname,tablename,policyname) FROM pg_policies p WHERE schemaname IN ('public','app_private') OR (schemaname='auth' AND tablename='users')),
  'table_grants',(SELECT jsonb_agg(jsonb_build_object('schema',t.nspname,'table',t.relname,'grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,'privilege',a.privilege_type,'grantable',a.is_grantable) ORDER BY t.nspname,t.relname,a.grantee,a.privilege_type) FROM selected_tables t CROSS JOIN LATERAL aclexplode(coalesce(t.relacl,acldefault(CASE WHEN t.relkind='S' THEN 'S'::"char" ELSE 'r'::"char" END,t.relowner))) a),
  'function_grants',(SELECT jsonb_agg(jsonb_build_object('schema',f.nspname,'name',f.proname,'identity_args',pg_get_function_identity_arguments(f.oid),'grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,'privilege',a.privilege_type,'grantable',a.is_grantable) ORDER BY f.nspname,f.proname,f.oid,a.grantee) FROM selected_functions f CROSS JOIN LATERAL aclexplode(coalesce(f.proacl,acldefault('f',f.proowner))) a),
  'enums',(SELECT jsonb_agg(row_to_json(e)) FROM (SELECT n.nspname AS schema,t.typname AS name,array_agg(e.enumlabel ORDER BY e.enumsortorder) AS labels FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace JOIN pg_enum e ON e.enumtypid=t.oid WHERE n.nspname IN ('public','app_private','auth') GROUP BY 1,2 ORDER BY 1,2) e),
  'sequences',(SELECT jsonb_agg(jsonb_build_object('schema',t.nspname,'name',t.relname,'type',format_type(s.seqtypid,NULL),'start',s.seqstart,'increment',s.seqincrement,'min',s.seqmin,'max',s.seqmax,'cache',s.seqcache,'cycle',s.seqcycle)) FROM selected_tables t JOIN pg_sequence s ON s.seqrelid=t.oid),
  'extensions',(SELECT jsonb_agg(jsonb_build_object('name',e.extname,'version',e.extversion,'schema',n.nspname) ORDER BY e.extname) FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace)
) AS catalog;
