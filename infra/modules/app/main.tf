locals {
  sufijo    = random_string.sufijo.result
  base      = replace(var.name, "-", "")
  etiquetas = merge(var.tags, { proyecto = "ferreteria-eltornillo", ambiente = var.name })
}

resource "random_string" "sufijo" {
  length  = 5
  upper   = false
  special = false
}

resource "azurerm_resource_group" "main" {
  name     = "rg-${var.name}"
  location = var.location
  tags     = local.etiquetas
}

# ---------- Observabilidad ----------
resource "azurerm_log_analytics_workspace" "main" {
  name                = "log-${var.name}"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  sku                 = "PerGB2018"
  retention_in_days   = 30
  daily_quota_gb      = 0.5 # tope diario: FinOps, evita un gasto inesperado por logs
  tags                = local.etiquetas
}

resource "azurerm_application_insights" "main" {
  name                = "appi-${var.name}"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  workspace_id        = azurerm_log_analytics_workspace.main.id
  application_type    = "web"
  tags                = local.etiquetas
}

# ---------- Almacenamiento (host de la Function App, CSV, reportes) ----------
resource "azurerm_storage_account" "main" {
  name                            = substr("st${local.base}${local.sufijo}", 0, 24)
  resource_group_name             = azurerm_resource_group.main.name
  location                        = azurerm_resource_group.main.location
  account_tier                    = "Standard"
  account_replication_type        = "LRS"
  min_tls_version                 = "TLS1_2"
  https_traffic_only_enabled      = true
  allow_nested_items_to_be_public = false
  tags                            = local.etiquetas

  sas_policy {
    expiration_period = "01.00:00:00"
  }

  blob_properties {
    delete_retention_policy {
      days = 7
    }
  }
}

resource "azurerm_storage_container" "csv" {
  for_each              = toset(["csv-entrada", "csv-procesados", "csv-errores", "reportes", "respaldos"])
  name                  = each.key
  storage_account_id    = azurerm_storage_account.main.id
  container_access_type = "private"
}

# ---------- Base de datos (solo autenticación de Entra, sin contraseñas) ----------
resource "azurerm_mssql_server" "main" {
  name                          = "sql-${var.name}-${local.sufijo}"
  resource_group_name           = azurerm_resource_group.main.name
  location                      = azurerm_resource_group.main.location
  version                       = "12.0"
  minimum_tls_version           = "1.2"
  public_network_access_enabled = true # riesgo aceptado: sin private endpoints para ahorrar costo (ver README)
  tags                          = local.etiquetas

  azuread_administrator {
    login_username              = var.sql_admin_login
    object_id                   = var.sql_admin_object_id
    tenant_id                   = var.tenant_id
    azuread_authentication_only = true
  }
}

resource "azurerm_mssql_database" "inventario" {
  name                        = "inventario"
  server_id                   = azurerm_mssql_server.main.id
  sku_name                    = "GP_S_Gen5_1"
  min_capacity                = 0.5
  max_size_gb                 = 32
  auto_pause_delay_in_minutes = 60
  zone_redundant              = false
  storage_account_type        = "Local"
  collation                   = "SQL_Latin1_General_CP1_CI_AS"
  use_free_limit              = true
  # Al agotar el cupo gratuito la base se pausa hasta el mes siguiente (riesgo R2 del HLD).
  free_limit_exhaustion_behavior = "AutoPause"
  tags                           = local.etiquetas
}

# Permite el acceso desde servicios de Azure (la Function App). El pipeline agrega y quita
# su propia regla temporal para inicializar la base.
resource "azurerm_mssql_firewall_rule" "servicios_azure" {
  name             = "AllowAzureServices"
  server_id        = azurerm_mssql_server.main.id
  start_ip_address = "0.0.0.0"
  end_ip_address   = "0.0.0.0"
}

# ---------- Secretos ----------
data "azurerm_client_config" "actual" {}

resource "azurerm_key_vault" "main" {
  name                       = substr("kv-${local.base}-${local.sufijo}", 0, 24)
  location                   = azurerm_resource_group.main.location
  resource_group_name        = azurerm_resource_group.main.name
  tenant_id                  = var.tenant_id
  sku_name                   = "standard"
  rbac_authorization_enabled = true
  soft_delete_retention_days = 7
  purge_protection_enabled   = false
  tags                       = local.etiquetas
}

# ---------- API (Azure Functions, plan de consumo) ----------
# Identidad administrada asignada por el usuario: su client_id permite crear el usuario de la
# base de datos sin consultar Microsoft Graph (ver db/04_usuarios.sql).
resource "azurerm_user_assigned_identity" "api" {
  name                = "id-${var.name}-api"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  tags                = local.etiquetas
}

resource "azurerm_service_plan" "api" {
  name                = "plan-${var.name}"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  os_type             = "Linux"
  sku_name            = "Y1"
  tags                = local.etiquetas
}

resource "azurerm_linux_function_app" "api" {
  name                        = "func-${var.name}-${local.sufijo}"
  resource_group_name         = azurerm_resource_group.main.name
  location                    = azurerm_resource_group.main.location
  service_plan_id             = azurerm_service_plan.api.id
  storage_account_name        = azurerm_storage_account.main.name
  storage_account_access_key  = azurerm_storage_account.main.primary_access_key
  https_only                  = true
  functions_extension_version = "~4"
  tags                        = local.etiquetas

  identity {
    type         = "UserAssigned"
    identity_ids = [azurerm_user_assigned_identity.api.id]
  }

  key_vault_reference_identity_id = azurerm_user_assigned_identity.api.id

  site_config {
    application_insights_connection_string = azurerm_application_insights.main.connection_string
    minimum_tls_version                    = "1.2"
    ftps_state                             = "Disabled"
    http2_enabled                          = true
    application_stack {
      node_version = "22"
    }
  }

  app_settings = {
    SQL_SERVER   = azurerm_mssql_server.main.fully_qualified_domain_name
    SQL_DATABASE = azurerm_mssql_database.inventario.name
    APP_VERSION  = var.app_version
    # DefaultAzureCredential usa este client_id para obtener el token de la identidad
    AZURE_CLIENT_ID = azurerm_user_assigned_identity.api.client_id
  }
}

# La identidad de la Function App lee secretos del Key Vault (mínimo privilegio).
resource "azurerm_role_assignment" "api_kv" {
  scope                = azurerm_key_vault.main.id
  role_definition_name = "Key Vault Secrets User"
  principal_id         = azurerm_user_assigned_identity.api.principal_id
}

# ---------- Frontend (Static Web Apps) enlazado a la Function App ----------
resource "azurerm_static_web_app" "web" {
  name                = "swa-${var.name}-${local.sufijo}"
  resource_group_name = azurerm_resource_group.main.name
  location            = var.swa_location
  sku_tier            = var.swa_sku
  sku_size            = var.swa_sku
  tags                = local.etiquetas
}

# "Bring your own functions": solo disponible en el plan Standard.
resource "azurerm_static_web_app_function_app_registration" "api" {
  count             = var.swa_sku == "Standard" ? 1 : 0
  static_web_app_id = azurerm_static_web_app.web.id
  function_app_id   = azurerm_linux_function_app.api.id
}

# ---------- Alerta de presupuesto (opcional) ----------
resource "azurerm_consumption_budget_resource_group" "main" {
  count             = var.budget_email == "" ? 0 : 1
  name              = "presupuesto-${var.name}"
  resource_group_id = azurerm_resource_group.main.id
  amount            = var.budget_amount
  time_grain        = "Monthly"

  time_period {
    start_date = formatdate("YYYY-MM-01'T'00:00:00Z", timestamp())
  }

  notification {
    enabled        = true
    threshold      = 80
    operator       = "GreaterThan"
    threshold_type = "Actual"
    contact_emails = [var.budget_email]
  }

  lifecycle {
    ignore_changes = [time_period]
  }
}

# ---------- Alerta de errores 5xx de la API ----------
resource "azurerm_monitor_action_group" "equipo" {
  count               = var.budget_email == "" ? 0 : 1
  name                = "ag-${var.name}"
  resource_group_name = azurerm_resource_group.main.name
  short_name          = "tornillo"

  email_receiver {
    name          = "dueno"
    email_address = var.budget_email
  }
}

resource "azurerm_monitor_metric_alert" "errores_5xx" {
  count               = var.budget_email == "" ? 0 : 1
  name                = "alerta-5xx-${var.name}"
  resource_group_name = azurerm_resource_group.main.name
  scopes              = [azurerm_linux_function_app.api.id]
  description         = "Más de 5 errores 5xx en 5 minutos"
  severity            = 2
  frequency           = "PT1M"
  window_size         = "PT5M"

  criteria {
    metric_namespace = "Microsoft.Web/sites"
    metric_name      = "Http5xx"
    aggregation      = "Total"
    operator         = "GreaterThan"
    threshold        = 5
  }

  action {
    action_group_id = azurerm_monitor_action_group.equipo[0].id
  }
}
