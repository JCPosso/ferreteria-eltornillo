IF SCHEMA_ID(N'seguridad') IS NULL EXEC (N'CREATE SCHEMA seguridad');
GO
IF EXISTS (SELECT 1 FROM sys.security_policies WHERE name = N'politica_sede')
  DROP SECURITY POLICY seguridad.politica_sede;
GO
CREATE OR ALTER FUNCTION seguridad.fn_filtro_sede (@sede_id AS INT)
  RETURNS TABLE
  WITH SCHEMABINDING
AS
  RETURN SELECT 1 AS permitido
  WHERE @sede_id = CAST(SESSION_CONTEXT(N'sede_id') AS INT)
     OR CAST(SESSION_CONTEXT(N'es_admin') AS INT) = 1;
GO
CREATE SECURITY POLICY seguridad.politica_sede
  ADD FILTER PREDICATE seguridad.fn_filtro_sede(sede_id) ON dbo.existencias,
  ADD BLOCK  PREDICATE seguridad.fn_filtro_sede(sede_id) ON dbo.existencias AFTER INSERT,
  ADD BLOCK  PREDICATE seguridad.fn_filtro_sede(sede_id) ON dbo.existencias AFTER UPDATE
  WITH (STATE = ON);
GO
