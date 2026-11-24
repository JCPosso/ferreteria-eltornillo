# Se ejecuta UNA vez, a mano, con "az login" (ver README). Crea:
#  - el almacenamiento del estado de Terraform (solo Entra ID, sin llaves),
#  - la identidad que usa GitHub Actions (OIDC, sin secretos) y sus permisos.
#
# La identidad es una identidad administrada asignada por el usuario (igual que en el Laboratorio 8)
# y no una aplicación de Entra: el tenant de la universidad no permite crear aplicaciones ni
# service principals (Authorization_RequestDenied).
terraform {
  required_version = ">= 1.11"
  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
    time = {
      source  = "hashicorp/time"
      version = "~> 0.12"
    }
  }
}

provider "azurerm" {
  use_cli                         = true
  storage_use_azuread             = true # la cuenta del estado no tiene llaves: todo va con Entra ID
  resource_provider_registrations = "none"
  subscription_id                 = var.subscription_id
  features {}
}

variable "subscription_id" {
  type = string
}

variable "github_repo" {
  description = "Repositorio en formato dueño/nombre, por ejemplo JCPosso/ferreteria-eltornillo"
  type        = string
}

variable "github_subject_repo" {
  description = "Parte del subject de OIDC. Los repos nuevos usan IDs: OWNER@ID/REPO@ID (ver error AADSTS700213 del Lab 8). Vacío = dueño/nombre."
  type        = string
  default     = ""
}

variable "location" {
  type    = string
  default = "centralus"
}

locals {
  subject_repo = var.github_subject_repo != "" ? var.github_subject_repo : var.github_repo
  ambientes    = toset(["dev", "prod"])
  etiquetas    = { project = "ferreteria-eltornillo", managed_by = "terraform" }
}

data "azurerm_client_config" "actual" {}

data "azurerm_subscription" "actual" {}

resource "random_string" "sufijo" {
  length  = 5
  upper   = false
  special = false
}

# ---------- Estado remoto de Terraform ----------
resource "azurerm_resource_group" "estado" {
  name     = "rg-tornillo-tfstate"
  location = var.location
  tags     = local.etiquetas
}

resource "azurerm_storage_account" "estado" {
  name                            = "sttornillotf${random_string.sufijo.result}"
  resource_group_name             = azurerm_resource_group.estado.name
  location                        = azurerm_resource_group.estado.location
  account_tier                    = "Standard"
  account_replication_type        = "LRS"
  min_tls_version                 = "TLS1_2"
  allow_nested_items_to_be_public = false
  shared_access_key_enabled       = false # el estado se lee con Entra ID, no con llaves
  default_to_oauth_authentication = true
  tags                            = local.etiquetas

  blob_properties {
    versioning_enabled = true
    delete_retention_policy {
      days = 14
    }
  }
}

# Quien corre el bootstrap necesita este rol para crear el contenedor (el acceso es por Entra ID).
resource "azurerm_role_assignment" "estado_admin" {
  scope                = azurerm_storage_account.estado.id
  role_definition_name = "Storage Blob Data Contributor"
  principal_id         = data.azurerm_client_config.actual.object_id
}

# Un rol nuevo tarda en propagarse; sin esta espera la creación del contenedor falla con 403.
resource "time_sleep" "propagacion_rbac" {
  depends_on      = [azurerm_role_assignment.estado_admin]
  create_duration = "90s"
}

resource "azurerm_storage_container" "estado" {
  name                  = "tfstate"
  storage_account_id    = azurerm_storage_account.estado.id
  container_access_type = "private"
  depends_on            = [time_sleep.propagacion_rbac]
}

# ---------- Identidad de GitHub Actions (OIDC, sin secretos) ----------
resource "azurerm_user_assigned_identity" "github" {
  name                = "id-tornillo-github"
  resource_group_name = azurerm_resource_group.estado.name
  location            = azurerm_resource_group.estado.location
  tags                = local.etiquetas
}

# Azure solo acepta tokens de este repositorio y de estos dos environments de GitHub.
resource "azurerm_federated_identity_credential" "ambiente" {
  for_each = local.ambientes

  name                      = "github-${each.key}"
  user_assigned_identity_id = azurerm_user_assigned_identity.github.id
  audience                  = ["api://AzureADTokenExchange"]
  issuer                    = "https://token.actions.githubusercontent.com"
  subject                   = "repo:${local.subject_repo}:environment:${each.key}"
}

# Permisos: crear recursos y asignar roles dentro de la suscripción del proyecto.
# Compromiso aceptado (ver README): se acota a la suscripción de PENU, que es de uso exclusivo.
resource "azurerm_role_assignment" "contributor" {
  scope                = data.azurerm_subscription.actual.id
  role_definition_name = "Contributor"
  principal_id         = azurerm_user_assigned_identity.github.principal_id
  principal_type       = "ServicePrincipal"
}

resource "azurerm_role_assignment" "acceso" {
  scope                = data.azurerm_subscription.actual.id
  role_definition_name = "User Access Administrator"
  principal_id         = azurerm_user_assigned_identity.github.principal_id
  principal_type       = "ServicePrincipal"
}

resource "azurerm_role_assignment" "estado" {
  scope                = azurerm_storage_account.estado.id
  role_definition_name = "Storage Blob Data Contributor"
  principal_id         = azurerm_user_assigned_identity.github.principal_id
  principal_type       = "ServicePrincipal"
}

# Los nombres de las salidas son los de las variables de GitHub que hay que crear.
output "AZURE_CLIENT_ID" { value = azurerm_user_assigned_identity.github.client_id }
output "AZURE_TENANT_ID" { value = data.azurerm_client_config.actual.tenant_id }
output "AZURE_SUBSCRIPTION_ID" { value = var.subscription_id }
output "SQL_ADMIN_OBJECT_ID" { value = azurerm_user_assigned_identity.github.principal_id }
output "SQL_ADMIN_LOGIN" { value = azurerm_user_assigned_identity.github.name }
output "TFSTATE_RESOURCE_GROUP" { value = azurerm_resource_group.estado.name }
output "TFSTATE_STORAGE_ACCOUNT" { value = azurerm_storage_account.estado.name }
output "TFSTATE_CONTAINER" { value = azurerm_storage_container.estado.name }
