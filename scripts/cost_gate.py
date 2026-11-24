#!/usr/bin/env python3
"""Control de costos del pipeline.

Lee el plan de Terraform en JSON (terraform show -json tfplan), estima el costo
mensual de los recursos que quedarán desplegados y falla si supera el presupuesto.

Uso:  python3 scripts/cost_gate.py plan.json [--environment dev|prod]

Variables de entorno:
  COST_BUDGET_USD   presupuesto mensual en USD (por defecto: dev 10, prod 30)

Un recurso sin regla de precio hace fallar el control: así un recurso nuevo nunca
llega a producción sin que alguien decida cuánto cuesta.
"""
import argparse
import json
import os
import sys
from pathlib import Path

DEFAULT_BUDGETS = {"dev": 10.0, "prod": 30.0}

# Recursos que no generan costo por sí mismos.
FREE_RESOURCES = {
    "azurerm_resource_group",
    "azurerm_application_insights",  # los datos se cobran en Log Analytics
    "azurerm_service_plan",          # se valida el SKU en una regla propia
    "azurerm_linux_function_app",    # plan de consumo: dentro de la capa gratuita
    "azurerm_mssql_server",
    "azurerm_mssql_firewall_rule",
    "azurerm_storage_container",
    "azurerm_user_assigned_identity",
    "azurerm_role_assignment",
    "azurerm_static_web_app_function_app_registration",
    "azurerm_consumption_budget_resource_group",
    "azurerm_monitor_action_group",
    "random_string",
}


def load_prices(path=None):
    path = path or Path(__file__).with_name("cost_prices.json")
    return json.loads(Path(path).read_text(encoding="utf-8"))


def vcores_from_sku(sku_name):
    # GP_S_Gen5_2 -> 2 vCores
    try:
        return int(sku_name.rsplit("_", 1)[1])
    except (IndexError, ValueError):
        return 1


def price_resource(rtype, after, prices):
    """Devuelve (costo_mensual, detalle) o None si no hay regla de precio."""
    a = prices["suposiciones"]
    if rtype in FREE_RESOURCES and rtype != "azurerm_service_plan":
        return 0.0, "sin costo propio"
    if rtype == "azurerm_service_plan":
        sku = after.get("sku_name")
        if sku in prices["service_plan"]:
            return prices["service_plan"][sku], f"plan {sku} (consumo)"
        return None
    if rtype == "azurerm_static_web_app":
        tier = after.get("sku_tier")
        if tier in prices["static_web_app"]:
            return prices["static_web_app"][tier], f"plan {tier}"
        return None
    if rtype == "azapi_resource":
        # La base gratuita se crea con azapi (azurerm no expone useFreeLimit).
        if str(after.get("type", "")).startswith("Microsoft.Sql/servers/databases"):
            props = (after.get("body") or {}).get("properties") or {}
            if props.get("useFreeLimit"):
                return 0.0, "oferta gratuita (100.000 vCore-s al mes)"
        return None
    if rtype == "azurerm_mssql_database":
        sku = after.get("sku_name") or ""
        if after.get("use_free_limit"):
            return 0.0, "oferta gratuita (100.000 vCore-s al mes)"
        if sku in ("S0", "S1"):
            return prices["sql_database"][sku], f"DTU {sku}"
        if sku.startswith("GP_S_"):
            vc = vcores_from_sku(sku)
            seconds = a["sql_active_hours"] * 3600
            cost = vc * seconds * prices["sql_database"]["serverless_vcore_second"]
            return round(cost, 2), f"serverless {vc} vCore x {a['sql_active_hours']} h activas"
        return None
    if rtype == "azurerm_log_analytics_workspace":
        quota = after.get("daily_quota_gb")
        gb = a["log_ingestion_gb"]
        if quota is not None and quota >= 0:
            gb = min(gb, quota * 30)
        cost = max(0.0, gb - prices["log_analytics_free_gb"]) * prices["log_analytics_gb"]
        return round(cost, 2), f"{gb:g} GB/mes (5 GB gratis)"
    if rtype == "azurerm_storage_account":
        cost = a["storage_gb"] * prices["storage_gb"] + prices["storage_operations_flat"]
        return round(cost, 2), f"{a['storage_gb']} GB + operaciones"
    if rtype == "azurerm_key_vault":
        return prices["key_vault_flat"], "operaciones estimadas"
    if rtype == "azurerm_monitor_metric_alert":
        return prices["metric_alert"], "1 regla de alerta"
    return None


def estimate(plan, prices):
    rows, missing = [], []
    for rc in plan.get("resource_changes", []):
        actions = rc["change"]["actions"]
        if actions == ["delete"]:
            continue  # se destruye: no cuenta
        after = rc["change"].get("after") or {}
        res = price_resource(rc["type"], after, prices)
        if res is None:
            missing.append(rc["address"])
        else:
            rows.append((rc["address"], res[0], res[1]))
    return rows, missing


def main(argv=None):
    p = argparse.ArgumentParser()
    p.add_argument("plan")
    p.add_argument("--environment", default=os.environ.get("ENVIRONMENT", "dev"))
    args = p.parse_args(argv)

    plan = json.loads(Path(args.plan).read_text(encoding="utf-8"))
    prices = load_prices()
    rows, missing = estimate(plan, prices)
    total = round(sum(r[1] for r in rows), 2)

    raw = os.environ.get("COST_BUDGET_USD", "").strip()
    budget = float(raw) if raw else DEFAULT_BUDGETS.get(args.environment, 10.0)

    lines = [f"### Control de costos ({args.environment})", "",
             "| Recurso | USD/mes | Detalle |", "|---|---|---|"]
    for addr, cost, detail in sorted(rows, key=lambda r: -r[1]):
        if cost > 0:
            lines.append(f"| `{addr}` | {cost:.2f} | {detail} |")
    lines += ["", f"**Total estimado: USD {total:.2f} / mes** - presupuesto: USD {budget:.2f}", ""]
    report = "\n".join(lines)
    print(report)
    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary:
        with open(summary, "a", encoding="utf-8") as f:
            f.write(report + "\n")

    if missing:
        print("ERROR: recursos sin regla de precio (agregar en scripts/cost_gate.py):", file=sys.stderr)
        for m in missing:
            print(f"  - {m}", file=sys.stderr)
        return 2
    if total > budget:
        print(f"ERROR: el costo estimado (USD {total:.2f}) supera el presupuesto (USD {budget:.2f}).",
              file=sys.stderr)
        return 1
    print("OK: dentro del presupuesto.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
