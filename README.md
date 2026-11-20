# Ferretería "El Tornillo" — inventario compartido en la nube

Proyecto final de *Paradigmas Emergentes en Computación en la Nube* (Maestría en Ingeniería de Sistemas, Escuela Colombiana de Ingeniería, PENU 2026-2).

**MVP:** el empleado de una sede inicia sesión y consulta el inventario de su sede (por código o nombre). Cada sede solo ve lo suyo; el rol `admin` ve todas.

## Arquitectura (resumen)

```
Navegador ──HTTPS──> Azure Static Web Apps (Standard) ──> Azure Functions (API Node.js 22)
   (login Entra ID)        frontend + autenticación              │ identidad administrada
                                                                 ├──> Azure SQL Database (serverless, oferta gratuita)
                                                                 ├──> Key Vault (secretos, RBAC)
                                                                 ├──> Blob Storage (CSV, reportes)
                                                                 └──> Application Insights + Log Analytics
```

- **Sin contraseñas ni secretos en el código:** la API usa identidad administrada para la base; GitHub Actions usa OIDC; Azure SQL solo acepta Entra ID.
- **Multi-sede en una sola base (pool):** columna `sede_id` + filtro en la consulta + *Row-Level Security* como defensa adicional.
- **Infraestructura como código:** Terraform (`infra/`). **Pipeline:** GitHub Actions (`.github/workflows/`).
- Dos ambientes: `dev` (Static Web Apps Free, la API se prueba directo en la Function App) y `prod` (Standard, único plan con SLA y funciones propias; aprobación manual).

## Estructura

| Carpeta | Contenido |
|---|---|
| `api/` | API de inventario (Azure Functions, Node.js 22) y pruebas (`npm test`) |
| `web/` | Frontend estático y `staticwebapp.config.json` (rutas protegidas, cabeceras de seguridad) |
| `db/` | Esquema, datos de ejemplo, Row-Level Security y usuario de la identidad administrada |
| `scripts/` | `db-init.js` (inicializa la base con token Entra) y `smoke-test.sh` |
| `infra/bootstrap` | Se ejecuta una vez a mano: estado remoto de Terraform + identidad OIDC de GitHub |
| `infra/modules/app` | Todos los recursos de un ambiente |
| `infra/environments/{dev,prod}` | Ambientes que usan el módulo |
| `docs/` | HLD (PDF y Word, con el diseño de despliegue como anexo), diagramas (.drawio y PNG) y estimación de costos (Excel) |
| `.github/workflows/` | `ci.yml`, `deploy.yml` (dev → prueba de humo → prod con aprobación), `destroy.yml` |

## Pruebas locales

```bash
cd api
npm ci
npm test        # 39 pruebas (validación, autorización, consulta, funciones HTTP)
npm run lint
```

## Puesta en marcha (una sola vez)

Requisitos: Azure CLI, Terraform >= 1.9, suscripción Azure for Students, repo en GitHub.

1. `az login` con la cuenta de la universidad.
2. Bootstrap:
   ```bash
   cd infra/bootstrap
   cp terraform.tfvars.example terraform.tfvars   # editar subscription_id y github_repo
   terraform init && terraform apply
   terraform output
   ```
   Si el login OIDC falla con `AADSTS700213`, rellena `github_subject_repo` con el subject que muestra GitHub (`OWNER@ID/REPO@ID`), igual que en el Laboratorio 8.
3. En GitHub, *Settings → Secrets and variables → Actions → Variables*, crea (son identificadores, no secretos): `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`, `SQL_ADMIN_OBJECT_ID`, `SQL_ADMIN_LOGIN`, `TFSTATE_RESOURCE_GROUP`, `TFSTATE_STORAGE_ACCOUNT`, `TFSTATE_CONTAINER` (los entrega `terraform output`) y opcionalmente `BUDGET_EMAIL`.
4. *Settings → Environments*: crea `dev` y `prod`; en `prod` agrega **Required reviewers**.
5. `git push` a `main`: se ejecuta CI → deploy dev → prueba de humo → (aprobación) → deploy prod.
6. Dar acceso a usuarios: en el portal de Azure, *Static Web App → Role management → Invite*, con los roles `sede-1`, `sede-2`, `sede-3` o `admin`.

## Limpieza (importante: Static Web Apps Standard cuesta USD 9/mes)

Ejecutar el workflow **Destroy** para `prod` y `dev`, y después `terraform destroy` en `infra/bootstrap`.

## Decisiones y riesgos conocidos

- **Static Web Apps Standard** en prod: el plan Free no tiene SLA ni permite enlazar una Function App propia.
- **Oferta gratuita de Azure SQL:** al agotar 100.000 vCore-s/mes la base se pausa hasta el mes siguiente (riesgo para la disponibilidad); hay alerta de presupuesto y el consumo se revisa antes de la demo.
- **Sin private endpoints** para mantener el costo bajo (`.checkov.yml` documenta cada excepción de seguridad).
- **R11:** la Function App podría aceptar llamadas directas con una cabecera `x-ms-client-principal` falsificada. La prueba de humo lo verifica en prod y emite una advertencia si ocurre.
- **Estado de verificación:** las 39 pruebas de la API pasan y Checkov no reporta fallos. El Terraform y los workflows **todavía no se han ejecutado contra Azure**; el primer `apply` puede requerir ajustes de nombres de argumentos del proveedor `azurerm`.

## Commits

Conventional Commits, en inglés, sin coautores.
