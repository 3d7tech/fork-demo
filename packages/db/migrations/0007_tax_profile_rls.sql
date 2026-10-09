-- Row-level security for an employee's tax profile (ADR 0010).
--
-- What someone earns outside work, their student loan and their household are theirs alone, like
-- their decisions (0005): the only policy is for that employee. Owners and accountants have none.

ALTER TABLE tax_profile ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON tax_profile TO fork_app;
CREATE POLICY tax_profile_own ON tax_profile FOR ALL TO fork_app
  USING (company_id = fork_company_id() AND employee_id = fork_my_employee_id())
  WITH CHECK (company_id = fork_company_id() AND employee_id = fork_my_employee_id());
