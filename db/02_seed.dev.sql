EXEC sp_set_session_context @key = N'es_admin', @value = 1, @read_only = 0;
GO
MERGE dbo.sedes AS t
USING (VALUES (1, N'Centro'), (2, N'Norte'), (3, N'Sur')) AS s (id, nombre)
ON t.id = s.id
WHEN NOT MATCHED THEN INSERT (id, nombre) VALUES (s.id, s.nombre);
GO
DELETE FROM dbo.movimientos;
DELETE FROM dbo.existencias;
DELETE FROM dbo.productos;
GO
SELECT * INTO #catalogo FROM (VALUES
  (N'HER-101', N'Martillo de goma 16 oz', N'Herramientas', 42, 8, 0),
  (N'HER-102', N'Llave inglesa ajustable 10 pulgadas', N'Herramientas', 15, 15, 15),
  (N'HER-103', N'Juego de llaves Allen (9 piezas)', N'Herramientas', 14, 16, 1),
  (N'HER-104', N'Taladro inalámbrico 20 V', N'Herramientas', 3, 0, 7),
  (N'HER-105', N'Pistola de silicona', N'Herramientas', 120, 85, 60),
  (N'HER-106', N'Escuadra de carpintero 30 cm', N'Herramientas', 0, 0, 0),
  (N'HER-107', N'Alicate de presión 10 pulgadas', N'Herramientas', 22, NULL, NULL),
  (N'HER-108', N'Sierra caladora 600 W (modelo ''Pro'')', N'Herramientas', 5, 12, 30),
  (N'TOR-101', N'Tornillo autoperforante 1/2 (caja x200)', N'Tornillería', 250, 300, 180),
  (N'TOR-102', N'Perno hexagonal 1/2 x 3 pulgadas', N'Tornillería', 75, 0, 44),
  (N'TOR-103', N'Arandela plana 3/8 (bolsa x100)', N'Tornillería', 16, 14, 18),
  (N'TOR-104', N'Ancla de expansión 3/8', N'Tornillería', 9, 9, 9),
  (N'TOR-105', N'Clavo de acero 3 pulgadas (libra)', N'Tornillería', 0, 25, 35),
  (N'TOR-106', N'Remache pop 1/8 (caja x500)', N'Tornillería', 40, 40, 2),
  (N'TOR-107', N'Tornillo para techo con arandela (caja x100)', N'Tornillería', 999, 850, 1200),
  (N'CON-101', N'Cemento blanco 25 kg', N'Construcción', 18, 6, 0),
  (N'CON-102', N'Bloque de arcilla No. 5', N'Construcción', 1500, 900, 2000),
  (N'CON-103', N'Gravilla (bulto)', N'Construcción', 30, 30, 0),
  (N'CON-104', N'Varilla lisa 1/4 x 6 m', N'Construcción', 12, 70, 5),
  (N'CON-105', N'Impermeabilizante acrílico 5 galones', N'Construcción', 4, 4, 4),
  (N'CON-106', N'Yeso en polvo 25 kg', N'Construcción', 55, 0, 13),
  (N'CON-107', N'Cal hidratada 10 kg', N'Construcción', 0, 17, 15),
  (N'PIN-101', N'Pintura esmalte negro galón', N'Pintura', 8, 20, 0),
  (N'PIN-102', N'Pintura látex azul 1/4 de galón', N'Pintura', 14, 15, 16),
  (N'PIN-103', N'Lija de agua grano 220', N'Pintura', 100, 100, 100),
  (N'PIN-104', N'Espátula 4 pulgadas', N'Pintura', 0, 3, 9),
  (N'PIN-105', N'Cinta de enmascarar 48 mm', N'Pintura', 65, 0, 27),
  (N'PIN-106', N'Rodillo antigoteo 9 pulgadas con extensión telescópica de aluminio y mango ergonómico (kit)', N'Pintura', 6, 11, 0),
  (N'ELE-101', N'Cable duplex N.14 (metro)', N'Eléctrico', 300, 250, 410),
  (N'ELE-102', N'Breaker monopolar 20 A', N'Eléctrico', 11, 0, 25),
  (N'ELE-103', N'Tomacorriente GFCI', N'Eléctrico', 6, 6, 0),
  (N'ELE-104', N'Bombillo LED 15 W luz cálida', N'Eléctrico', 48, 12, 90),
  (N'ELE-105', N'Extensión múltiple 6 salidas', N'Eléctrico', 0, 14, 22),
  (N'ELE-106', N'Caja de paso 4x4 plástica', N'Eléctrico', 70, 33, 0),
  (N'ELE-107', N'Timbre inalámbrico', N'Eléctrico', 2, 18, 10),
  (N'PLO-101', N'Tubo PVC sanitario 4 pulgadas x 3 m', N'Plomería', 20, 9, 0),
  (N'PLO-102', N'Sifón plástico para lavaplatos', N'Plomería', 13, 0, 21),
  (N'PLO-103', N'Grifería monocontrol para lavamanos', N'Plomería', 5, 3, 1),
  (N'PLO-104', N'Manguera de jardín 15 m', N'Plomería', 0, 8, 19),
  (N'PLO-105', N'Sellante de silicona transparente', N'Plomería', 31, 31, 31),
  (N'PLO-106', N'Flotador para tanque de inodoro', N'Plomería', 17, 4, 0)
) AS s (codigo, nombre, categoria, centro, norte, sur);
GO
INSERT INTO dbo.productos (codigo, nombre, categoria)
SELECT codigo, nombre, categoria FROM #catalogo;
GO
INSERT INTO dbo.existencias (sede_id, producto_id, cantidad)
SELECT v.sede_id, p.id, v.cantidad
FROM #catalogo AS c
JOIN dbo.productos AS p ON p.codigo = c.codigo
CROSS APPLY (VALUES (1, c.centro), (2, c.norte), (3, c.sur)) AS v (sede_id, cantidad)
WHERE v.cantidad IS NOT NULL;
GO
DROP TABLE #catalogo;
GO
