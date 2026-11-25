IF OBJECT_ID(N'dbo.sedes') IS NULL
  CREATE TABLE dbo.sedes (
    id     INT          NOT NULL CONSTRAINT pk_sedes PRIMARY KEY,
    nombre NVARCHAR(50) NOT NULL
  );
GO
IF OBJECT_ID(N'dbo.productos') IS NULL
  CREATE TABLE dbo.productos (
    id        INT IDENTITY(1,1) NOT NULL CONSTRAINT pk_productos PRIMARY KEY,
    codigo    NVARCHAR(20)  NOT NULL CONSTRAINT uq_productos_codigo UNIQUE,
    nombre    NVARCHAR(100) NOT NULL,
    categoria NVARCHAR(50)  NOT NULL
  );
GO
IF OBJECT_ID(N'dbo.existencias') IS NULL
  CREATE TABLE dbo.existencias (
    sede_id     INT NOT NULL CONSTRAINT fk_existencias_sede     FOREIGN KEY REFERENCES dbo.sedes(id),
    producto_id INT NOT NULL CONSTRAINT fk_existencias_producto FOREIGN KEY REFERENCES dbo.productos(id),
    cantidad    INT NOT NULL CONSTRAINT ck_existencias_no_negativa CHECK (cantidad >= 0),
    version     ROWVERSION,
    CONSTRAINT pk_existencias PRIMARY KEY (sede_id, producto_id)
  );
GO
IF OBJECT_ID(N'dbo.movimientos') IS NULL
  CREATE TABLE dbo.movimientos (
    id          BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT pk_movimientos PRIMARY KEY,
    sede_id     INT          NOT NULL CONSTRAINT fk_mov_sede     FOREIGN KEY REFERENCES dbo.sedes(id),
    producto_id INT          NOT NULL CONSTRAINT fk_mov_producto FOREIGN KEY REFERENCES dbo.productos(id),
    tipo        NVARCHAR(10) NOT NULL CONSTRAINT ck_mov_tipo CHECK (tipo IN (N'venta', N'entrada', N'ajuste')),
    cantidad    INT          NOT NULL,
    creado_en   DATETIME2    NOT NULL CONSTRAINT df_mov_creado DEFAULT SYSUTCDATETIME()
  );
GO
