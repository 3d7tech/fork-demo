-- Row-level security (ADR 0007). Hand-written so it can be reviewed as SQL.
--
-- Two login roles, neither of which owns a table, so every policy applies to them:
--   fork_app   serves signed-in requests. Each transaction sets fork.user_id, fork.company_id
--              and fork.role; the helper functions below check them against membership.
--   fork_auth  handles sign-in links, sessions and invites, before anyone is signed in. It can
--              touch only those tables.
-- Migrations create the roles without login; the environment gives them a password.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fork_app') THEN CREATE ROLE fork_app NOLOGIN NOBYPASSRLS; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fork_auth') THEN CREATE ROLE fork_auth NOLOGIN NOBYPASSRLS; END IF;
END $$;

-- ---------- Request context ----------

CREATE FUNCTION fork_user_id() RETURNS uuid LANGUAGE sql STABLE AS
$$ SELECT nullif(current_setting('fork.user_id', true), '')::uuid $$;

CREATE FUNCTION fork_company_id() RETURNS uuid LANGUAGE sql STABLE AS
$$ SELECT nullif(current_setting('fork.company_id', true), '')::uuid $$;

CREATE FUNCTION fork_role() RETURNS text LANGUAGE sql STABLE AS
$$ SELECT nullif(current_setting('fork.role', true), '') $$;

-- True only if the request is acting as an owner AND membership says this user is an owner of
-- the current company. Security definer so it can read membership without recursing into RLS.
CREATE FUNCTION fork_is_owner() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
$$
  SELECT fork_role() = 'owner' AND EXISTS (
    SELECT 1 FROM membership m
    WHERE m.user_id = fork_user_id() AND m.company_id = fork_company_id() AND m.role = 'owner'
  )
$$;

-- The employee record of the signed-in employee in the current company, or null.
CREATE FUNCTION fork_my_employee_id() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
$$
  SELECT m.employee_id FROM membership m
  WHERE fork_role() = 'employee' AND m.user_id = fork_user_id() AND m.company_id = fork_company_id() AND m.role = 'employee'
  LIMIT 1
$$;

-- Any member of the current company, in the role they are acting as.
CREATE FUNCTION fork_is_member() RETURNS boolean LANGUAGE sql STABLE AS
$$ SELECT fork_is_owner() OR fork_my_employee_id() IS NOT NULL $$;

-- Users who belong to the current company, for an owner's team list.
CREATE FUNCTION fork_in_my_company(target uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
$$ SELECT EXISTS (SELECT 1 FROM membership m WHERE m.user_id = target AND m.company_id = fork_company_id()) $$;

REVOKE ALL ON FUNCTION fork_is_owner(), fork_my_employee_id(), fork_in_my_company(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fork_user_id(), fork_company_id(), fork_role(), fork_is_owner(), fork_my_employee_id(), fork_is_member(), fork_in_my_company(uuid) TO fork_app;

-- ---------- Turn RLS on everywhere ----------

ALTER TABLE company ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_user ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee ENABLE ROW LEVEL SECURITY;
ALTER TABLE membership ENABLE ROW LEVEL SECURITY;
ALTER TABLE invite ENABLE ROW LEVEL SECURITY;
ALTER TABLE login_token ENABLE ROW LEVEL SECURITY;
ALTER TABLE session ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_upload ENABLE ROW LEVEL SECURITY;
ALTER TABLE pay_record ENABLE ROW LEVEL SECURITY;
ALTER TABLE policy_document ENABLE ROW LEVEL SECURITY;
ALTER TABLE pension_scheme ENABLE ROW LEVEL SECURITY;
ALTER TABLE policy_fact ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_event ENABLE ROW LEVEL SECURITY;

GRANT USAGE ON SCHEMA public TO fork_app, fork_auth;

-- ---------- fork_app: signed-in requests ----------

GRANT SELECT, UPDATE ON company TO fork_app;
CREATE POLICY company_read ON company FOR SELECT TO fork_app USING (id = fork_company_id() AND fork_is_member());
CREATE POLICY company_owner_update ON company FOR UPDATE TO fork_app USING (id = fork_company_id() AND fork_is_owner());

GRANT SELECT ON app_user TO fork_app;
CREATE POLICY app_user_self ON app_user FOR SELECT TO fork_app USING (id = fork_user_id());
CREATE POLICY app_user_team ON app_user FOR SELECT TO fork_app USING (fork_is_owner() AND fork_in_my_company(id));

GRANT SELECT ON membership TO fork_app;
CREATE POLICY membership_self ON membership FOR SELECT TO fork_app USING (user_id = fork_user_id());
CREATE POLICY membership_owner ON membership FOR SELECT TO fork_app USING (company_id = fork_company_id() AND fork_is_owner());

GRANT SELECT, INSERT, UPDATE, DELETE ON employee TO fork_app;
CREATE POLICY employee_owner ON employee FOR ALL TO fork_app
  USING (company_id = fork_company_id() AND fork_is_owner()) WITH CHECK (company_id = fork_company_id() AND fork_is_owner());
CREATE POLICY employee_self ON employee FOR SELECT TO fork_app USING (company_id = fork_company_id() AND id = fork_my_employee_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON invite TO fork_app;
CREATE POLICY invite_owner ON invite FOR ALL TO fork_app
  USING (company_id = fork_company_id() AND fork_is_owner()) WITH CHECK (company_id = fork_company_id() AND fork_is_owner());

GRANT SELECT, INSERT, UPDATE, DELETE ON payroll_upload TO fork_app;
CREATE POLICY payroll_upload_owner ON payroll_upload FOR ALL TO fork_app
  USING (company_id = fork_company_id() AND fork_is_owner()) WITH CHECK (company_id = fork_company_id() AND fork_is_owner());

GRANT SELECT, INSERT, UPDATE, DELETE ON pay_record TO fork_app;
CREATE POLICY pay_record_owner ON pay_record FOR ALL TO fork_app
  USING (company_id = fork_company_id() AND fork_is_owner()) WITH CHECK (company_id = fork_company_id() AND fork_is_owner());
CREATE POLICY pay_record_self ON pay_record FOR SELECT TO fork_app USING (company_id = fork_company_id() AND employee_id = fork_my_employee_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON policy_document, pension_scheme, policy_fact TO fork_app;
CREATE POLICY policy_document_owner ON policy_document FOR ALL TO fork_app
  USING (company_id = fork_company_id() AND fork_is_owner()) WITH CHECK (company_id = fork_company_id() AND fork_is_owner());
CREATE POLICY policy_document_member ON policy_document FOR SELECT TO fork_app USING (company_id = fork_company_id() AND fork_is_member());
CREATE POLICY pension_scheme_owner ON pension_scheme FOR ALL TO fork_app
  USING (company_id = fork_company_id() AND fork_is_owner()) WITH CHECK (company_id = fork_company_id() AND fork_is_owner());
CREATE POLICY pension_scheme_member ON pension_scheme FOR SELECT TO fork_app USING (company_id = fork_company_id() AND fork_is_member());
CREATE POLICY policy_fact_owner ON policy_fact FOR ALL TO fork_app
  USING (company_id = fork_company_id() AND fork_is_owner()) WITH CHECK (company_id = fork_company_id() AND fork_is_owner());
-- Employees see only facts a person has confirmed.
CREATE POLICY policy_fact_member ON policy_fact FOR SELECT TO fork_app
  USING (company_id = fork_company_id() AND fork_is_member() AND confidence = 'confirmed');

-- Audit is insert-only. A person can read back only their own events; a company-wide view for
-- owners comes with step 8, once employee events can be kept out of it.
GRANT SELECT, INSERT ON audit_event TO fork_app;
GRANT USAGE ON SEQUENCE audit_event_id_seq TO fork_app, fork_auth;
CREATE POLICY audit_insert ON audit_event FOR INSERT TO fork_app
  WITH CHECK (actor_user_id = fork_user_id() AND (company_id IS NULL OR (company_id = fork_company_id() AND fork_is_member())));
CREATE POLICY audit_read_own ON audit_event FOR SELECT TO fork_app USING (actor_user_id = fork_user_id());

-- ---------- fork_auth: sign-in, sessions, invites ----------

GRANT SELECT, INSERT, UPDATE ON app_user TO fork_auth;
CREATE POLICY app_user_auth ON app_user FOR ALL TO fork_auth USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE ON login_token TO fork_auth;
CREATE POLICY login_token_auth ON login_token FOR ALL TO fork_auth USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, DELETE ON session TO fork_auth;
CREATE POLICY session_auth ON session FOR ALL TO fork_auth USING (true) WITH CHECK (true);
GRANT SELECT, UPDATE ON invite TO fork_auth;
CREATE POLICY invite_auth ON invite FOR ALL TO fork_auth USING (true) WITH CHECK (true);
GRANT SELECT, INSERT ON membership TO fork_auth;
CREATE POLICY membership_auth ON membership FOR ALL TO fork_auth USING (true) WITH CHECK (true);
-- Company names, for the invite page and the company picker after sign-in.
GRANT SELECT (id, name, brand_colour) ON company TO fork_auth;
CREATE POLICY company_auth ON company FOR SELECT TO fork_auth USING (true);
GRANT INSERT ON audit_event TO fork_auth;
CREATE POLICY audit_auth_insert ON audit_event FOR INSERT TO fork_auth WITH CHECK (true);
