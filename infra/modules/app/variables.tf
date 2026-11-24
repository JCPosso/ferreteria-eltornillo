variable "name" {
  description = "Nombre corto del ambiente, por ejemplo tornillo-dev"
  type        = string
}

variable "location" {
  description = "Región de Azure (Central US funcionó en el Laboratorio 8)"
  type        = string
  default     = "centralus"
}

variable "swa_location" {
  description = "Región de Static Web Apps (solo algunas regiones están disponibles)"
  type        = string
  default     = "centralus"
}

variable "swa_sku" {
  description = "Plan de Static Web Apps: Standard (SLA, funciones propias) o Free"
  type        = string
  default     = "Standard"
  validation {
    condition     = contains(["Free", "Standard"], var.swa_sku)
    error_message = "swa_sku debe ser Free o Standard."
  }
}

variable "sql_admin_login" {
  description = "Nombre visible de la identidad que administra Azure SQL (la del pipeline)"
  type        = string
}

variable "sql_admin_object_id" {
  description = "Object ID de la identidad que administra Azure SQL (la del pipeline)"
  type        = string
}

variable "tenant_id" {
  description = "Tenant de Microsoft Entra"
  type        = string
}

variable "budget_amount" {
  description = "Presupuesto mensual (USD) del grupo de recursos para la alerta"
  type        = number
  default     = 20
}

variable "budget_email" {
  description = "Correo para las alertas de presupuesto y de errores 5xx (obligatorio: el enunciado exige al menos una alerta)"
  type        = string

  validation {
    condition     = can(regex("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$", var.budget_email))
    error_message = "budget_email es obligatorio: define la variable BUDGET_EMAIL en GitHub (Settings > Variables) con un correo válido."
  }
}

variable "app_version" {
  description = "Versión que reporta /api/health (el SHA del commit)"
  type        = string
  default     = "dev"
}

variable "tags" {
  type    = map(string)
  default = {}
}

variable "function_location" {
  description = "Región del plan y la Function App. En Azure for Students la cuota de planes de consumo (Y1) es 0 en Central US; eastus tiene cuota para dev y prod (verificado) y la política de la suscripción la permite."
  type        = string
  default     = "eastus"
}
