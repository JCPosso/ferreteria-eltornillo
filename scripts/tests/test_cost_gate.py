import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))
import cost_gate  # noqa: E402

PRICES = cost_gate.load_prices()


def rc(rtype, after, actions=("create",), name="x"):
    return {"address": f"module.app.{rtype}.{name}", "type": rtype,
            "change": {"actions": list(actions), "after": after}}


def plan(*changes):
    return {"resource_changes": list(changes)}


class CostGateTest(unittest.TestCase):
    def test_dev_stack_is_nearly_free(self):
        rows, missing = cost_gate.estimate(plan(
            rc("azurerm_static_web_app", {"sku_tier": "Free"}),
            rc("azurerm_mssql_database", {"use_free_limit": True, "sku_name": "GP_S_Gen5_1"}),
            rc("azurerm_service_plan", {"sku_name": "Y1"}),
            rc("azurerm_log_analytics_workspace", {"daily_quota_gb": 0.5}),
            rc("azurerm_storage_account", {}),
            rc("azurerm_key_vault", {}),
        ), PRICES)
        self.assertEqual(missing, [])
        self.assertLess(sum(r[1] for r in rows), 1.0)

    def test_prod_standard_swa_costs_nine(self):
        rows, _ = cost_gate.estimate(plan(rc("azurerm_static_web_app", {"sku_tier": "Standard"})), PRICES)
        self.assertEqual(rows[0][1], 9.0)

    def test_s1_database_price(self):
        rows, _ = cost_gate.estimate(plan(rc("azurerm_mssql_database", {"sku_name": "S1"})), PRICES)
        self.assertEqual(rows[0][1], 29.43)

    def test_paid_serverless_is_expensive(self):
        rows, _ = cost_gate.estimate(plan(
            rc("azurerm_mssql_database", {"sku_name": "GP_S_Gen5_1", "use_free_limit": False})), PRICES)
        self.assertGreater(rows[0][1], 100)

    def test_deleted_resources_do_not_count(self):
        rows, _ = cost_gate.estimate(plan(
            rc("azurerm_static_web_app", {"sku_tier": "Standard"}, actions=("delete",))), PRICES)
        self.assertEqual(rows, [])

    def test_unknown_resource_is_reported(self):
        _, missing = cost_gate.estimate(plan(rc("azurerm_redis_cache", {})), PRICES)
        self.assertEqual(len(missing), 1)

    def test_unknown_sku_is_reported(self):
        _, missing = cost_gate.estimate(plan(rc("azurerm_service_plan", {"sku_name": "P1v3"})), PRICES)
        self.assertEqual(len(missing), 1)


class CliTest(unittest.TestCase):
    def run_cli(self, p, budget=None, env="prod"):
        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as f:
            json.dump(p, f)
        e = {k: v for k, v in os.environ.items() if k not in ("COST_BUDGET_USD", "GITHUB_STEP_SUMMARY")}
        if budget is not None:
            e["COST_BUDGET_USD"] = str(budget)
        r = subprocess.run([sys.executable, str(ROOT / "scripts/cost_gate.py"), f.name, "--environment", env],
                           capture_output=True, text=True, env=e)
        os.unlink(f.name)
        return r

    def test_passes_within_budget(self):
        r = self.run_cli(plan(rc("azurerm_static_web_app", {"sku_tier": "Standard"})))
        self.assertEqual(r.returncode, 0, r.stderr)

    def test_fails_when_budget_is_zero(self):
        r = self.run_cli(plan(rc("azurerm_static_web_app", {"sku_tier": "Standard"})), budget=0)
        self.assertEqual(r.returncode, 1)
        self.assertIn("supera el presupuesto", r.stderr)

    def test_fails_on_missing_rule(self):
        r = self.run_cli(plan(rc("azurerm_redis_cache", {})))
        self.assertEqual(r.returncode, 2)


if __name__ == "__main__":
    unittest.main()
