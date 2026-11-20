# Se ejecuta UNA vez, a mano, con "az login" (ver README). Crea:
#  - el almacenamiento del estado de Terraform,
#  - la identidad que usa GitHub Actions (OIDC, sin secretos) y sus permisos.
terraform {
  required_version = ">= 1.9"
  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 4.40"
    }
    azuread = {
      source  = "hashicorp/azuread"
      version = "~> 3.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }
}

provider "azurerm" {
  features {}
  subscription_id = var.subscription_id
}

provider "azuread" {}

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
}

data "azurerm_subscription" "actual" {}

resource "random_string" "sufijo" {
  length  = 5
  upper   = false
  special = false
}

resource "azurerm_resource_group" "estado" {
  name     = "rg-tornillo-tfstate"
  location = var.location
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

  blob_properties {
    versioning_enabled = true
    delete_retention_policy {
      days = 14
    }
  }
}

resource "azurerm_storage_container" "estado" {
  name                  = "tfstate"
  storage_account_id    = azurerm_storage_account.estado.id
  container_access_type = "private"
}

# ---------- Identidad de GitHub Actions (OIDC) ----------
resource "azuread_application" "github" {
  display_name = "gh-ferreteria-eltornillo"
}

resource "azuread_service_principal" "github" {
  client_id = azuread_application.github.client_id
}

resource "azuread_application_federated_identity_credential" "ambiente" {
  for_each       = local.ambientes
  application_id = azuread_application.github.id
  display_name   = "github-${each.key}"
  audiences      = ["api://AzureADTokenExchange"]
  issuer         = "https://token.actions.githubusercontent.com"
  subject        = "repo:${local.subject_repo}:environment:${each.key}"
}

# Permisos: crear recursos y asignar roles dentro de la suscripción del proyecto.
# Compromiso aceptado (ver README): se acota a la suscripción de PENU, que es de uso exclusivo.
resource "azurerm_role_assignment" "contributor" {
  scope                = data.azurerm_subscription.actual.id
  role_definition_name = "Contributor"
  principal_id         = azuread_service_principal.github.object_id
}

resource "azurerm_role_assignment" "acceso" {
  scope                = data.azurerm_subscription.actual.id
  role_definition_name = "User Access Administrator"
  principal_id         = azuread_service_principal.github.object_id
}

resource "azurerm_role_assignment" "estado" {
  scope                = azurerm_storage_account.estado.id
  role_definition_name = "Storage Blob Data Contributor"
  principal_id         = azuread_service_principal.github.object_id
}

data "azurerm_client_config" "actual" {}

output "AZURE_CLIENT_ID" { value = azuread_application.github.client_id }
output "AZURE_TENANT_ID" { value = data.azurerm_client_config.actual.tenant_id }
output "AZURE_SUBSCRIPTION_ID" { value = var.subscription_id }
output "SQL_ADMIN_OBJECT_ID" { value = azuread_service_principal.github.object_id }
output "SQL_ADMIN_LOGIN" { value = azuread_application.github.display_name }
output "TFSTATE_RESOURCE_GROUP" { value = azurerm_resource_group.estado.name }
output "TFSTATE_STORAGE_ACCOUNT" { value = azurerm_storage_account.estado.name }
output "TFSTATE_CONTAINER" { value = azurerm_storage_container.estado.name }
