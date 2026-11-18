# Tests for migration 027 (contribution rules without holdings)

Run against a throwaway local Postgres 16, never the live project:

```bash
createdb wos027
psql -d wos027 -v ON_ERROR_STOP=1 -f 00_schema.sql
psql -d wos027 -v ON_ERROR_STOP=1 -f 01_live_functions_18nov2026.sql
psql -d wos027 -v ON_ERROR_STOP=1 -1 -f ../../migrations/027_contribution_rule_balance_accounts.sql
psql -d wos027 -v ON_ERROR_STOP=1 -f 10_tests.sql
```

`00_schema.sql` is a copy of the live `wealth_os` tables the engine touches, and `01_…sql` holds the live engine functions as they were before 027. Every block in `10_tests.sql` prints `PASS …` or stops with `FAIL …`. Without 027 applied, the tests stop at `FAIL 1b` (a rule with no funds is refused), which shows they exercise the change.
