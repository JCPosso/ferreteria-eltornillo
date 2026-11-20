-- Datos de ejemplo para el MVP (ficticios). Idempotente.
-- Se marca la sesión como administrador para que la seguridad por fila permita cargar datos.
EXEC sp_set_session_context @key = N'es_admin', @value = 1, @read_only = 0;
GO
MERGE dbo.sedes AS t
USING (VALUES (1, N'Centro'), (2, N'Norte'), (3, N'Sur')) AS s (id, nombre)
ON t.id = s.id
WHEN NOT MATCHED THEN INSERT (id, nombre) VALUES (s.id, s.nombre);
GO
MERGE dbo.productos AS t
USING (VALUES
  (N'HER-001', N'Martillo de uña 16 oz',        N'Herramientas'),
  (N'HER-002', N'Destornillador de pala 6 mm',  N'Herramientas'),
  (N'HER-003', N'Destornillador de estrella N.2', N'Herramientas'),
  (N'HER-004', N'Alicate universal 8 pulgadas', N'Herramientas'),
  (N'HER-005', N'Cinta métrica 5 m',            N'Herramientas'),
  (N'HER-006', N'Nivel de burbuja 40 cm',       N'Herramientas'),
  (N'HER-007', N'Serrucho 20 pulgadas',         N'Herramientas'),
  (N'TOR-001', N'Tornillo para madera 1 pulgada (caja x100)', N'Tornillería'),
  (N'TOR-002', N'Tornillo drywall 1 1/4 (caja x100)',         N'Tornillería'),
  (N'TOR-003', N'Chazo plástico 1/4 (bolsa x50)',             N'Tornillería'),
  (N'TOR-004', N'Puntilla 2 pulgadas (libra)',                N'Tornillería'),
  (N'TOR-005', N'Tuerca hexagonal 3/8 (bolsa x25)',           N'Tornillería'),
  (N'CON-001', N'Cemento gris 50 kg',           N'Construcción'),
  (N'CON-002', N'Arena de pega (bulto)',        N'Construcción'),
  (N'CON-003', N'Ladrillo tolete',              N'Construcción'),
  (N'CON-004', N'Varilla corrugada 3/8 x 6 m',  N'Construcción'),
  (N'CON-005', N'Malla electrosoldada',         N'Construcción'),
  (N'PIN-001', N'Pintura blanca vinilo galón',  N'Pintura'),
  (N'PIN-002', N'Rodillo 9 pulgadas',           N'Pintura'),
  (N'PIN-003', N'Brocha 3 pulgadas',            N'Pintura'),
  (N'PIN-004', N'Thinner galón',                N'Pintura'),
  (N'ELE-001', N'Cable THHN N.12 (metro)',      N'Eléctrico'),
  (N'ELE-002', N'Toma doble',                   N'Eléctrico'),
  (N'ELE-003', N'Interruptor sencillo',         N'Eléctrico'),
  (N'ELE-004', N'Cinta aislante',               N'Eléctrico'),
  (N'ELE-005', N'Bombillo LED 9 W',             N'Eléctrico'),
  (N'PLO-001', N'Tubo PVC presión 1/2 x 6 m',   N'Plomería'),
  (N'PLO-002', N'Codo PVC 1/2',                 N'Plomería'),
  (N'PLO-003', N'Llave de paso 1/2',            N'Plomería'),
  (N'PLO-004', N'Cinta teflón',                 N'Plomería')
) AS s (codigo, nombre, categoria)
ON t.codigo = s.codigo
WHEN NOT MATCHED THEN INSERT (codigo, nombre, categoria) VALUES (s.codigo, s.nombre, s.categoria);
GO
-- Existencias iniciales deterministas (distintas por sede) para poder probar.
INSERT INTO dbo.existencias (sede_id, producto_id, cantidad)
SELECT s.id, p.id, ((p.id * 7 + s.id * 13) % 90) + 5
FROM dbo.sedes AS s
CROSS JOIN dbo.productos AS p
WHERE NOT EXISTS (SELECT 1 FROM dbo.existencias e WHERE e.sede_id = s.id AND e.producto_id = p.id);
GO
