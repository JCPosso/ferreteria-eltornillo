terraform {
  required_version = ">= 1.9"
  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 4.40"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }
  # Los datos del backend se pasan con -backend-config (ver workflow y README)
  backend "azurerm" {
    key              = "dev.tfstate"
    use_oidc         = true
    use_azuread_auth = true
  }
}

provider "azurerm" {
  features {}
  subscription_id = var.subscription_id
  use_oidc        = true
}

variable "subscription_id" { type = string }
variable "tenant_id" { type = string }
variable "sql_admin_login" { type = string }
variable "sql_admin_object_id" { type = string }
variable "budget_email" {
  type    = string
  default = ""
}
variable "app_version" {
  type    = string
  default = "dev"
}

module "app" {
  source              = "../../modules/app"
  name                = "tornillo-dev"
  swa_sku             = "Free"
  tenant_id           = var.tenant_id
  sql_admin_login     = var.sql_admin_login
  sql_admin_object_id = var.sql_admin_object_id
  budget_email        = var.budget_email
  budget_amount       = 10
  app_version         = var.app_version
  tags                = { ambiente = "dev" }
}

output "resource_group" { value = module.app.resource_group }
output "swa_name" { value = module.app.swa_name }
output "swa_url" { value = module.app.swa_url }
output "function_name" { value = module.app.function_name }
output "sql_server_name" { value = module.app.sql_server_name }
output "sql_server_fqdn" { value = module.app.sql_server_fqdn }
output "sql_database" { value = module.app.sql_database }
output "identity_name" { value = module.app.identity_name }
output "identity_client_id" { value = module.app.identity_client_id }
