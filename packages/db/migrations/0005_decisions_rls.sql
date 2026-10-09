-- Row-level security for decisions, saved decisions, requests and accountants (step 8, ADR 0007).
--
-- Privacy is structural (brief, principle 3): an employee's questions, answers, saved decisions and
-- requests have a policy for that employee only. There is no owner policy on them at all, so no
-- query an owner can write reaches them. Owners see counts only, through the functions at the end,
-- and only when five or more different people are counted.

CREATE FUNCTION fork_is_accountant_for(target uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
$$
  SELECT fork_role() = 'accountant' AND EXISTS (SELECT 1 FROM accountant_access a WHERE a.user_id = fork_user_id() AND a.company_id = target)
$$;
REVOKE ALL ON FUNCTION fork_is_accountant_for(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fork_is_accountant_for(uuid) TO fork_app;

ALTER TABLE decision_run ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_decision ENABLE ROW LEVEL SECURITY;
ALTER TABLE action_request ENABLE ROW LEVEL SECURITY;
ALTER TABLE accountant_access ENABLE ROW LEVEL SECURITY;

-- ---------- decision_run ----------
GRANT SELECT, INSERT, DELETE ON decision_run TO fork_app;
-- Anyone signed in records their own runs, in the role they're acting as.
CREATE POLICY run_insert_own ON decision_run FOR INSERT TO fork_app
  WITH CHECK (user_id = fork_user_id() AND company_id = fork_company_id() AND fork_is_member() AND audience = fork_role());
CREATE POLICY run_read_own ON decision_run FOR SELECT TO fork_app USING (user_id = fork_user_id() AND company_id = fork_company_id());
-- Company decisions an owner made are shared with the company's other owners. Employee runs never are.
CREATE POLICY run_read_owner_decisions ON decision_run FOR SELECT TO fork_app USING (audience = 'owner' AND company_id = fork_company_id() AND fork_is_owner());
-- People can delete their own questions and answers.
CREATE POLICY run_delete_own ON decision_run FOR DELETE TO fork_app USING (user_id = fork_user_id());

-- ---------- saved_decision: personal ----------
GRANT SELECT, INSERT, UPDATE, DELETE ON saved_decision TO fork_app;
CREATE POLICY saved_own ON saved_decision FOR ALL TO fork_app
  USING (user_id = fork_user_id() AND company_id = fork_company_id())
  WITH CHECK (user_id = fork_user_id() AND company_id = fork_company_id() AND fork_is_member());

-- ---------- action_request ----------
GRANT SELECT, INSERT ON action_request TO fork_app;
GRANT UPDATE (status, accountant_note, status_changed_at) ON action_request TO fork_app;
CREATE POLICY request_insert_own ON action_request FOR INSERT TO fork_app
  WITH CHECK (created_by = fork_user_id() AND company_id = fork_company_id() AND fork_is_member() AND audience = fork_role());
CREATE POLICY request_read_own ON action_request FOR SELECT TO fork_app USING (created_by = fork_user_id());
CREATE POLICY request_read_owner_plans ON action_request FOR SELECT TO fork_app USING (audience = 'owner' AND company_id = fork_company_id() AND fork_is_owner());
-- The accountant sees and updates the requests of companies they look after; that's their job.
CREATE POLICY request_accountant_read ON action_request FOR SELECT TO fork_app USING (fork_is_accountant_for(company_id));
CREATE POLICY request_accountant_update ON action_request FOR UPDATE TO fork_app USING (fork_is_accountant_for(company_id)) WITH CHECK (fork_is_accountant_for(company_id));

-- ---------- accountant_access ----------
GRANT SELECT, DELETE ON accountant_access TO fork_app;
CREATE POLICY accountant_self ON accountant_access FOR SELECT TO fork_app USING (user_id = fork_user_id());
CREATE POLICY accountant_owner ON accountant_access FOR SELECT TO fork_app USING (company_id = fork_company_id() AND fork_is_owner());
CREATE POLICY accountant_owner_remove ON accountant_access FOR DELETE TO fork_app USING (company_id = fork_company_id() AND fork_is_owner());
GRANT SELECT, INSERT ON accountant_access TO fork_auth;
CREATE POLICY accountant_auth ON accountant_access FOR ALL TO fork_auth USING (true) WITH CHECK (true);
-- Accountants need the names of the companies they look after.
CREATE POLICY company_accountant_read ON company FOR SELECT TO fork_app USING (fork_is_accountant_for(id));

-- ---------- Counts for owners, with the group-size rule ----------

-- Topics employees asked about in the last `days` days, only where five or more different people asked.
CREATE FUNCTION fork_topic_counts(days integer) RETURNS TABLE (family text, people integer) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
$$
  SELECT r.family, count(DISTINCT r.user_id)::int
  FROM decision_run r
  WHERE fork_is_owner() AND r.company_id = fork_company_id() AND r.audience = 'employee' AND r.family IS NOT NULL
    AND r.created_at > now() - make_interval(days => days)
  GROUP BY r.family
  HAVING count(DISTINCT r.user_id) >= 5
$$;

-- Employees whose request for a family was completed, and the employer NI they save a year in
-- total. Null unless five or more different people are counted.
CREATE FUNCTION fork_takeup(target_family text) RETURNS TABLE (people integer, saving_per_year numeric, saving_to_date numeric) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
$$
  WITH done AS (
    SELECT DISTINCT ON (a.created_by) a.created_by, coalesce((a.figures->>'employer_ni_saving')::numeric, 0) AS saving, a.status_changed_at
    FROM action_request a
    WHERE fork_is_owner() AND a.company_id = fork_company_id() AND a.audience = 'employee' AND a.family = target_family AND a.status = 'done'
    ORDER BY a.created_by, a.status_changed_at DESC
  )
  SELECT count(*)::int,
         sum(saving),
         sum(saving * greatest(0, extract(epoch FROM now() - status_changed_at)) / (365.25 * 86400))
  FROM done
  HAVING count(*) >= 5
$$;

REVOKE ALL ON FUNCTION fork_topic_counts(integer), fork_takeup(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fork_topic_counts(integer), fork_takeup(text) TO fork_app;

-- A re-explained screen replaces the stored answer; only its owner can do that.
GRANT UPDATE (answer) ON decision_run TO fork_app;
CREATE POLICY run_update_own ON decision_run FOR UPDATE TO fork_app USING (user_id = fork_user_id()) WITH CHECK (user_id = fork_user_id());

-- Where requests go: the company's accountants. Any member may send them one.
CREATE FUNCTION fork_company_accountants() RETURNS TABLE (email text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
$$
  SELECT u.email FROM accountant_access a JOIN app_user u ON u.id = a.user_id
  WHERE fork_is_member() AND a.company_id = fork_company_id()
$$;

-- Who to tell when an accountant updates a request: the person who sent it, and nothing else about them.
CREATE FUNCTION fork_requester_email(request uuid) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
$$
  SELECT u.email FROM action_request r JOIN app_user u ON u.id = r.created_by
  WHERE r.id = request AND fork_is_accountant_for(r.company_id)
$$;

REVOKE ALL ON FUNCTION fork_company_accountants(), fork_requester_email(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fork_company_accountants(), fork_requester_email(uuid) TO fork_app;

-- When a company's first accountant joins, requests that were waiting as drafts go to them.
GRANT SELECT, UPDATE (status, status_changed_at) ON action_request TO fork_auth;
-- Postgres also checks updated rows against SELECT policies, so reading covers both states.
CREATE POLICY request_auth_read_drafts ON action_request FOR SELECT TO fork_auth USING (status IN ('draft', 'sent'));
CREATE POLICY request_auth_release_drafts ON action_request FOR UPDATE TO fork_auth USING (status = 'draft') WITH CHECK (status = 'sent');
