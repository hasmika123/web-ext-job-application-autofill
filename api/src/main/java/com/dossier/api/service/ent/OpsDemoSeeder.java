package com.dossier.api.service.ent;

import com.dossier.api.domain.User;
import com.dossier.api.domain.ent.ops.FinanceForecastInput;
import com.dossier.api.domain.ent.ops.FinanceInvoice;
import com.dossier.api.domain.ent.ops.FinancePayment;
import com.dossier.api.domain.ent.ops.FinancePlacementPeriod;
import com.dossier.api.domain.ent.ops.FinancePlacementTerms;
import com.dossier.api.domain.ent.ops.FinanceTimesheet;
import com.dossier.api.domain.ent.ops.HrDocumentRequirement;
import com.dossier.api.domain.ent.ops.HrEmployee;
import com.dossier.api.domain.ent.ops.HrEmployeeNote;
import com.dossier.api.domain.ent.ops.HrLifecycleEvent;
import com.dossier.api.domain.ent.ops.HrOffboardingTask;
import com.dossier.api.domain.ent.ops.HrOnboardingItem;
import com.dossier.api.domain.ent.ops.HrTraining;
import com.dossier.api.domain.ent.ops.HrTrainingRecord;
import com.dossier.api.domain.ent.ops.ReportDefinition;
import com.dossier.api.domain.ent.ops.ReportExport;
import com.dossier.api.domain.ent.ops.ReportMetric;
import com.dossier.api.domain.ent.ops.ReportRecipient;
import com.dossier.api.domain.ent.ops.ReportRun;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.ent.talent.MarketerAssignment;
import com.dossier.api.domain.ent.talent.TalentPlacement;
import com.dossier.api.domain.enumeration.OrgGroupKind;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.org.OrgGroup;
import com.dossier.api.domain.org.OrgMember;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.ent.ops.FinanceForecastInputRepository;
import com.dossier.api.repository.ent.ops.FinanceInvoiceRepository;
import com.dossier.api.repository.ent.ops.FinancePaymentRepository;
import com.dossier.api.repository.ent.ops.FinancePlacementPeriodRepository;
import com.dossier.api.repository.ent.ops.FinancePlacementTermsRepository;
import com.dossier.api.repository.ent.ops.FinanceTimesheetRepository;
import com.dossier.api.repository.ent.ops.HrDocumentRequirementRepository;
import com.dossier.api.repository.ent.ops.HrEmployeeNoteRepository;
import com.dossier.api.repository.ent.ops.HrEmployeeRepository;
import com.dossier.api.repository.ent.ops.HrLifecycleEventRepository;
import com.dossier.api.repository.ent.ops.HrOffboardingTaskRepository;
import com.dossier.api.repository.ent.ops.HrOnboardingItemRepository;
import com.dossier.api.repository.ent.ops.HrTrainingRecordRepository;
import com.dossier.api.repository.ent.ops.HrTrainingRepository;
import com.dossier.api.repository.ent.ops.OpsMemberRosterRepository;
import com.dossier.api.repository.ent.ops.ReportDefinitionRepository;
import com.dossier.api.repository.ent.ops.ReportExportRepository;
import com.dossier.api.repository.ent.ops.ReportMetricRepository;
import com.dossier.api.repository.ent.ops.ReportRecipientRepository;
import com.dossier.api.repository.ent.ops.ReportRunRepository;
import com.dossier.api.repository.ent.talent.ConsultantProfileRepository;
import com.dossier.api.repository.ent.talent.MarketerAssignmentRepository;
import com.dossier.api.repository.ent.talent.TalentPlacementRepository;
import com.dossier.api.repository.org.OrgGroupRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Random;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Demo data for the Enterprise HR, Finance and Reports boards (branch ent-ops-data). It runs under exactly the switches of
 * {@link EnterpriseDemoSeeder} ({@code DEMO_ENABLED} + {@code ENT_DEMO_SEED}, never under {@code prod}) and only AFTER {@link TalentDemoSeeder}:
 * {@link com.dossier.api.config.EnterpriseDemoBootstrap} calls {@link #seed()} once the talent data exists. Nothing is invented that the talent
 * seed already decided: HR records are built from the org's seats and consultants, finance rows from its placements, report numbers from its
 * applications and placements, so every page shows the same people and totals.
 *
 * <p><b>Idempotent per module:</b> HR is skipped when the org already has employee records, finance when it has placement periods, reports when it
 * has report definitions. <b>Record-only (E2):</b> no phone, birth date, identity-document, tax-id or bank value exists anywhere; documents are
 * tracked by type and status only; money is recorded, never moved. Dates are relative to now (six months of history); the random stream is seeded
 * per organization, so two databases get the same story.
 */
@Service
public class OpsDemoSeeder {

    private static final Logger LOG = LoggerFactory.getLogger(OpsDemoSeeder.class);

    record Spec(String orgKey, String slug, String adminKey, String financeKey, List<String> accountManagerKeys, List<String> reportOwnerKeys, int reports, long seed) {}

    static final Spec ACME = new Spec("acme", EnterpriseDemoSeeder.ACME_SLUG, "sarah", "felix", List.of("amara"),
        List.of("jessica", "michael", "emily", "david", "samantha", "felix", "ryan", "sarah", "hana", "omar", "amara", "felix"), 12, 20261101L);
    static final Spec BETA = new Spec("beta", EnterpriseDemoSeeder.BETA_SLUG, "bea", "bea", List.of("priya"),
        List.of("bea", "priya", "leo", "bea", "priya"), 5, 20261102L);
    public static final List<Spec> SPECS = List.of(ACME, BETA);

    /** What a call did: per organization slug, the row count of every ops table afterwards (only for organizations seeded now). */
    public record Result(boolean ran, String skippedBecause, Map<String, Map<String, Long>> seeded) {
        static Result skipped(String why) {
            return new Result(false, why, Map.of());
        }
    }

    // ---- vocabulary ----------------------------------------------------------------------------------------------------

    static final String FULL_TIME = "FULL_TIME";
    static final String CONTRACT = "CONTRACT";

    private static final Map<String, String> TITLES = Map.ofEntries(
        Map.entry("sarah", "Director, Talent Operations"), Map.entry("omar", "Marketing Consultant"), Map.entry("anika", "Full Stack Developer"), Map.entry("ben", "DevOps Engineer"),
        Map.entry("hana", "HR Business Partner"), Map.entry("felix", "Finance Manager"), Map.entry("amara", "Account Manager"), Map.entry("tomas", "Talent Acquisition Lead"),
        Map.entry("eve", "Operations Executive"), Map.entry("sam", "Business Analyst"), Map.entry("nina", "Salesforce Consultant"), Map.entry("jessica", "Marketing Strategist"),
        Map.entry("michael", "Marketing Consultant"), Map.entry("emily", "Marketing Consultant"), Map.entry("david", "Marketing Consultant"), Map.entry("samantha", "Marketing Consultant"),
        Map.entry("ryan", "Marketing Consultant"), Map.entry("bea", "Managing Director"), Map.entry("priya", "Marketing Consultant"), Map.entry("leo", "Marketing Consultant")
    );
    private static final List<String> MARKETING_KEYS = List.of("jessica", "michael", "emily", "david", "samantha", "ryan", "priya", "leo", "bea");
    private static final String[][] STAFF_CITIES = {
        { "New York", "NY" }, { "San Francisco", "CA" }, { "Austin", "TX" }, { "Chicago", "IL" }, { "Boston", "MA" }, { "Seattle", "WA" }, { "Denver", "CO" }
    };
    private static final String[] NOTE_TEXTS = {
        "Completed the first-week check-in; no blockers.", "Asked to move the policy review to next week; approved.", "Manager confirmed the onboarding plan.",
        "Equipment request sent to IT.", "Discussed a title review at the next cycle.", "Back from leave; access restored."
    };
    private static final String[] ONBOARDING_FT = { "Offer letter signed", "Background check", "Tax forms received", "Company policies review", "Setup equipment" };
    private static final String[] ONBOARDING_CT = { "Contract signed", "Background check", "Contractor forms received", "Company policies review", "Setup access and equipment" };
    private static final int[] ONBOARDING_OFFSET = { 0, 2, 4, 6, 10 };
    private static final String[] OFFBOARDING = { "Return equipment", "Revoke system access", "Exit interview", "Knowledge transfer" };
    private static final String[][] DOC_TYPES = {
        { "ID_VERIFICATION", "ID Verification" }, { "TAX_FORM", "Tax Forms" }, { "DIRECT_DEPOSIT", "Direct Deposit" },
        { "EMPLOYMENT_ELIGIBILITY", "Employment Eligibility Form" }, { "EMERGENCY_CONTACT", "Emergency Contact" }, { "POLICY_ACK", "Policy Acknowledgement" }
    };
    private static final String[][] TRAININGS = {
        { "annual_policy_ack", "Annual Policy Acknowledgment", "ANNUAL" }, { "data_security", "Data Security Training", "ANNUAL" }, { "code_of_conduct", "Code of Conduct", "ANNUAL" }
    };

    /** One report to seed: source key, name, description, type, schedule (NONE/WEEKLY/MONTHLY, day, time), charts, tables, metrics. */
    record RSpec(String key, String name, String description, String type, String freq, int day, String time, int charts, int tables, List<String> metrics) {}

    private static final List<RSpec> REPORTS = List.of(
        new RSpec("application_funnel", "Application Funnel Report", "End-to-end view of application pipeline", "RECRUITING", "WEEKLY", 1, "09:00", 6, 4,
            List.of("Total applications", "Conversion rate by stage", "Time in stage (average)", "Applications by source", "Applications by department", "Offer acceptance rate")),
        new RSpec("consultant_utilization", "Consultant Utilization Report", "Consultant billable hours and utilization", "CONSULTANTS", "MONTHLY", 10, "14:15", 4, 3,
            List.of("Billable hours", "Utilization rate", "Bench time", "Hours by client")),
        new RSpec("revenue_summary", "Revenue Summary", "Revenue by client, department, and month", "FINANCE", "MONTHLY", 8, "09:20", 5, 3,
            List.of("Revenue by month", "Revenue by client", "Payouts by month", "Margin overview")),
        new RSpec("client_activity", "Client Activity Report", "Client engagements and placement activity", "CLIENTS", "WEEKLY", 3, "16:45", 4, 2,
            List.of("Active clients", "New placements by client", "Open requirements", "Interviews by client")),
        new RSpec("time_to_fill", "Time to Fill Analysis", "Average time to fill by role and department", "RECRUITING", "MONTHLY", 3, "11:15", 3, 2,
            List.of("Average days to fill", "Fill time by role", "Fill time by department")),
        new RSpec("placement_margin", "Placement Margin Report", "Margin per placement and per client", "FINANCE", "MONTHLY", 5, "10:00", 4, 3,
            List.of("Margin by placement", "Margin by client", "Bill and pay rate bands")),
        new RSpec("interview_conversion", "Interview Conversion Report", "Applications that reach an interview and beyond", "RECRUITING", "NONE", 0, null, 3, 2,
            List.of("Interview conversion", "Interviews by stage", "Offers per interview")),
        new RSpec("marketer_workload", "Marketer Workload Report", "Consultants and active applications per marketer", "CONSULTANTS", "NONE", 0, null, 3, 2,
            List.of("Consultants per marketer", "Active applications per marketer", "Overloaded marketers")),
        new RSpec("timesheets_payouts", "Timesheets and Open Payouts", "Pending timesheets and payouts still open", "FINANCE", "WEEKLY", 5, "08:30", 3, 3,
            List.of("Timesheets pending", "Open payouts", "Overdue invoices")),
        new RSpec("bench_availability", "Bench Availability Report", "Who is available, when and for how long", "CONSULTANTS", "WEEKLY", 2, "07:45", 3, 2,
            List.of("Available consultants", "Days on bench", "Available from")),
        new RSpec("onboarding_compliance", "Onboarding and Compliance Report", "Onboarding progress and compliance completion", "CONSULTANTS", "MONTHLY", 1, "09:00", 4, 3,
            List.of("Onboarding in progress", "Compliance completion", "Overdue trainings")),
        new RSpec("top_clients", "Top Clients by Revenue", "Clients ranked by revenue and margin", "CLIENTS", "NONE", 0, null, 2, 2,
            List.of("Revenue by client", "Margin by client", "Placements by client"))
    );

    // ---- collaborators -------------------------------------------------------------------------------------------------

    private final EnterpriseDemoSeeder base;
    private final OrganizationRepository orgs;
    private final OpsMemberRosterRepository roster;
    private final OrgGroupRepository groups;
    private final UserRepository users;
    private final ConsultantProfileRepository consultantRepo;
    private final MarketerAssignmentRepository assignmentRepo;
    private final TalentPlacementRepository placementRepo;
    private final HrEmployeeRepository employeeRepo;
    private final HrEmployeeNoteRepository noteRepo;
    private final HrOnboardingItemRepository onboardingRepo;
    private final HrDocumentRequirementRepository documentRepo;
    private final HrTrainingRepository trainingRepo;
    private final HrTrainingRecordRepository trainingRecordRepo;
    private final HrOffboardingTaskRepository offboardingRepo;
    private final HrLifecycleEventRepository lifecycleRepo;
    private final FinancePlacementTermsRepository termsRepo;
    private final FinanceInvoiceRepository invoiceRepo;
    private final FinanceTimesheetRepository timesheetRepo;
    private final FinancePlacementPeriodRepository periodRepo;
    private final FinancePaymentRepository paymentRepo;
    private final FinanceForecastInputRepository forecastRepo;
    private final ReportDefinitionRepository definitionRepo;
    private final ReportMetricRepository metricRepo;
    private final ReportRecipientRepository recipientRepo;
    private final ReportRunRepository runRepo;
    private final ReportExportRepository exportRepo;

    public OpsDemoSeeder(
        EnterpriseDemoSeeder base, OrganizationRepository orgs, OpsMemberRosterRepository roster, OrgGroupRepository groups, UserRepository users,
        ConsultantProfileRepository consultantRepo, MarketerAssignmentRepository assignmentRepo, TalentPlacementRepository placementRepo,
        HrEmployeeRepository employeeRepo, HrEmployeeNoteRepository noteRepo, HrOnboardingItemRepository onboardingRepo, HrDocumentRequirementRepository documentRepo,
        HrTrainingRepository trainingRepo, HrTrainingRecordRepository trainingRecordRepo, HrOffboardingTaskRepository offboardingRepo, HrLifecycleEventRepository lifecycleRepo,
        FinancePlacementTermsRepository termsRepo, FinanceInvoiceRepository invoiceRepo, FinanceTimesheetRepository timesheetRepo, FinancePlacementPeriodRepository periodRepo,
        FinancePaymentRepository paymentRepo, FinanceForecastInputRepository forecastRepo, ReportDefinitionRepository definitionRepo, ReportMetricRepository metricRepo,
        ReportRecipientRepository recipientRepo, ReportRunRepository runRepo, ReportExportRepository exportRepo
    ) {
        this.base = base;
        this.orgs = orgs;
        this.roster = roster;
        this.groups = groups;
        this.users = users;
        this.consultantRepo = consultantRepo;
        this.assignmentRepo = assignmentRepo;
        this.placementRepo = placementRepo;
        this.employeeRepo = employeeRepo;
        this.noteRepo = noteRepo;
        this.onboardingRepo = onboardingRepo;
        this.documentRepo = documentRepo;
        this.trainingRepo = trainingRepo;
        this.trainingRecordRepo = trainingRecordRepo;
        this.offboardingRepo = offboardingRepo;
        this.lifecycleRepo = lifecycleRepo;
        this.termsRepo = termsRepo;
        this.invoiceRepo = invoiceRepo;
        this.timesheetRepo = timesheetRepo;
        this.periodRepo = periodRepo;
        this.paymentRepo = paymentRepo;
        this.forecastRepo = forecastRepo;
        this.definitionRepo = definitionRepo;
        this.metricRepo = metricRepo;
        this.recipientRepo = recipientRepo;
        this.runRepo = runRepo;
        this.exportRepo = exportRepo;
    }

    /** Same switches as the base demo seed. Null when the seed may run. */
    public String refusal() {
        return base.refusal();
    }

    @Transactional
    public Result seed() {
        String why = refusal();
        if (why != null) return Result.skipped(why);
        Map<String, Map<String, Long>> done = new LinkedHashMap<>();
        for (Spec spec : SPECS) {
            Organization org = orgs.findBySlug(spec.slug()).orElse(null);
            if (org == null) {
                LOG.debug("Ops demo seed: organization {} does not exist yet, skipped", spec.slug());
                continue;
            }
            User creator = org.getCreatedByUserId() == null ? null : users.findById(org.getCreatedByUserId()).orElse(null);
            if (creator == null || !EnterpriseDemoSeeder.isEnterpriseDemoLogin(creator.getLogin())) {
                LOG.warn("Ops demo seed: {} was not created by the enterprise demo; leaving it alone", spec.slug());
                continue;
            }
            if (consultantRepo.countByOrgId(org.getId()) == 0) {
                LOG.info("Ops demo seed: {} has no talent data yet; run the talent seed first", spec.slug());
                continue;
            }
            Gen g = new Gen(spec, org);
            boolean did = false;
            if (employeeRepo.countByOrgId(org.getId()) == 0) {
                g.seedHr();
                did = true;
            }
            if (periodRepo.countByOrgId(org.getId()) == 0) {
                g.seedFinance();
                did = true;
            }
            if (definitionRepo.countByOrgId(org.getId()) == 0) {
                g.seedReports();
                did = true;
            }
            if (did) {
                Map<String, Long> counts = g.counts();
                done.put(spec.slug(), counts);
                LOG.info("Ops demo seeded for {}: {}", spec.slug(), counts);
            }
        }
        return new Result(true, null, done);
    }

    // ---- the generator for one organization ----------------------------------------------------------------------------

    /** One seat with its person data resolved. */
    private record Pm(OrgMember seat, String key, String name, String email) {}

    private final class Gen {
        final Spec spec;
        final Long orgId;
        final Random rnd;
        final Instant now = Instant.now();
        final LocalDate today = LocalDate.now(ZoneOffset.UTC);

        Map<String, Pm> byKey = new LinkedHashMap<>();
        Map<Long, Pm> bySeatId = new HashMap<>();
        Map<String, Long> deptIds = new HashMap<>();
        Pm admin;

        Gen(Spec spec, Organization org) {
            this.spec = spec;
            this.orgId = org.getId();
            this.rnd = new Random(spec.seed());
            loadRoster();
        }

        void loadRoster() {
            for (OrgGroup g : groups.findByOrgIdOrderBySortOrderAscNameAsc(orgId)) if (g.getKind() == OrgGroupKind.DEPARTMENT) deptIds.put(g.getName(), g.getId());
            String prefix = EnterpriseDemoSeeder.LOGIN_PREFIX + spec.orgKey() + "-";
            for (OrgMember m : roster.findRoster(orgId)) {
                if (m.getStatus() != OrgMemberStatus.ACTIVE && m.getStatus() != OrgMemberStatus.SUSPENDED && m.getStatus() != OrgMemberStatus.INVITED) continue;
                String key;
                String name;
                String email;
                User u = m.getUserId() == null ? null : users.findById(m.getUserId()).orElse(null);
                if (u != null) {
                    String login = u.getLogin() == null ? "" : u.getLogin();
                    key = login.startsWith(prefix) ? login.substring(prefix.length()) : login;
                    name = ((u.getFirstName() == null ? "" : u.getFirstName()) + " " + (u.getLastName() == null ? "" : u.getLastName())).trim();
                    email = u.getEmail();
                } else {
                    email = m.getInviteEmail();
                    name = m.getInviteName() != null ? m.getInviteName() : (email == null ? "Invited member" : email);
                    key = email == null ? "invited" + m.getId() : email.substring(0, email.indexOf('.') > 0 ? email.indexOf('.') : email.indexOf('@'));
                }
                if (name.isBlank()) name = key;
                if (email == null) email = key + "@" + spec.orgKey() + ".example.com";
                Pm pm = new Pm(m, key, name, email);
                byKey.put(key, pm);
                bySeatId.put(m.getId(), pm);
            }
            admin = byKey.get(spec.adminKey());
            if (admin == null && !byKey.isEmpty()) admin = byKey.values().iterator().next();
        }

        Map<String, Long> counts() {
            Map<String, Long> c = new LinkedHashMap<>();
            c.put("hr_employee", employeeRepo.countByOrgId(orgId));
            c.put("hr_employee_note", noteRepo.countByOrgId(orgId));
            c.put("hr_onboarding_item", onboardingRepo.countByOrgId(orgId));
            c.put("hr_document_requirement", documentRepo.countByOrgId(orgId));
            c.put("hr_training", trainingRepo.countByOrgId(orgId));
            c.put("hr_training_record", trainingRecordRepo.countByOrgId(orgId));
            c.put("hr_offboarding_task", offboardingRepo.countByOrgId(orgId));
            c.put("hr_lifecycle_event", lifecycleRepo.countByOrgId(orgId));
            c.put("finance_placement_terms", termsRepo.countByOrgId(orgId));
            c.put("finance_invoice", invoiceRepo.countByOrgId(orgId));
            c.put("finance_timesheet", timesheetRepo.countByOrgId(orgId));
            c.put("finance_placement_period", periodRepo.countByOrgId(orgId));
            c.put("finance_payment", paymentRepo.countByOrgId(orgId));
            c.put("finance_forecast_input", forecastRepo.countByOrgId(orgId));
            c.put("report_definition", definitionRepo.countByOrgId(orgId));
            c.put("report_metric", metricRepo.countByOrgId(orgId));
            c.put("report_recipient", recipientRepo.countByOrgId(orgId));
            c.put("report_run", runRepo.countByOrgId(orgId));
            c.put("report_export", exportRepo.countByOrgId(orgId));
            return c;
        }

        // ---- helpers ----

        int between(int lo, int hi) {
            return lo + rnd.nextInt(hi - lo + 1);
        }

        Instant daysAgo(double d) {
            return now.minusSeconds((long) (d * 86400));
        }

        Instant at(LocalDate d, int hour) {
            return d.atStartOfDay().toInstant(ZoneOffset.UTC).plus(hour, ChronoUnit.HOURS);
        }

        Instant capNow(Instant t) {
            return t.isAfter(now) ? now.minus(between(1, 90), ChronoUnit.MINUTES) : t;
        }

        LocalDate date(Instant t) {
            return t.atZone(ZoneOffset.UTC).toLocalDate();
        }

        LocalDate monthStart(int k) {
            return today.withDayOfMonth(1).minusMonths(k);
        }

        String departmentName(Long id) {
            for (Map.Entry<String, Long> e : deptIds.entrySet()) if (e.getValue().equals(id)) return e.getKey();
            return null;
        }

        // ============================ HR ============================

        void seedHr() {
            List<ConsultantProfile> consultants = new ArrayList<>(consultantRepo.findByOrgId(orgId));
            consultants.sort(Comparator.comparing(ConsultantProfile::getId));
            Map<Long, ConsultantProfile> consultantBySeat = new HashMap<>();
            for (ConsultantProfile c : consultants) if (c.getMemberId() != null) consultantBySeat.put(c.getMemberId(), c);
            Map<Long, Long> marketerOf = new HashMap<>();
            for (MarketerAssignment a : assignmentRepo.findByOrgId(orgId)) marketerOf.put(a.getConsultantId(), a.getMarketerMemberId());

            // the trainings first
            List<HrTraining> trainings = new ArrayList<>();
            for (int i = 0; i < TRAININGS.length; i++) {
                HrTraining t = new HrTraining();
                t.setOrgId(orgId);
                t.setTrainingKey(TRAININGS[i][0]);
                t.setTitle(TRAININGS[i][1]);
                t.setCadence(TRAININGS[i][2]);
                t.setSortOrder(i);
                trainings.add(t);
            }
            trainings = trainingRepo.saveAll(trainings);

            List<HrEmployee> staff = new ArrayList<>();
            // staff seats (and the consultants who hold one)
            for (Pm pm : byKey.values()) {
                OrgMember m = pm.seat();
                ConsultantProfile linked = consultantBySeat.get(m.getId());
                HrEmployee e = newEmployee();
                e.setMemberId(m.getId());
                if (linked != null) e.setConsultantId(linked.getId());
                e.setDisplayName(pm.name());
                e.setWorkEmail(pm.email());
                e.setJobTitle(linked != null ? linked.getJobTitle() : TITLES.getOrDefault(pm.key(), "Team Member"));
                e.setEmploymentType(linked != null ? CONTRACT : FULL_TIME);
                Long dept = m.getDepartmentGroupId();
                if (dept == null && linked != null) dept = linked.getDepartmentGroupId();
                if (dept == null && MARKETING_KEYS.contains(pm.key())) dept = deptIds.get("Marketing");
                e.setDepartmentGroupId(dept);
                Long mgr = m.getManagerMemberId();
                if (linked != null && marketerOf.get(linked.getId()) != null) mgr = marketerOf.get(linked.getId());
                if (mgr == null && admin != null && !pm.key().equals(admin.key())) mgr = admin.seat().getId();
                e.setManagerMemberId(mgr);
                String[] city = linked != null && linked.getLocationLabel() != null ? splitLocation(linked.getLocationLabel()) : STAFF_CITIES[rnd.nextInt(STAFF_CITIES.length)];
                e.setWorkCity(city[0]);
                e.setWorkRegion(city[1]);
                if (m.getStatus() == OrgMemberStatus.INVITED) {
                    e.setStartDate(today.plusDays(between(7, 14)));
                    e.setLastActivityAt(null);
                } else {
                    e.setStartDate(today.minusDays(between(240, 900)));
                    e.setLastActivityAt(m.getLastActiveAt() != null ? m.getLastActiveAt() : daysAgo(rnd.nextDouble() * 6));
                }
                if (m.getStatus() == OrgMemberStatus.SUSPENDED) e.setEmploymentStatus("ON_LEAVE");
                staff.add(e);
            }
            List<HrEmployee> all = new ArrayList<>(staff);
            // consultants who are not seats
            int notice = 0;
            int leave = 0;
            for (ConsultantProfile c : consultants) {
                if (c.getMemberId() != null) continue;
                HrEmployee e = newEmployee();
                e.setConsultantId(c.getId());
                e.setDisplayName(c.getDisplayName());
                e.setWorkEmail(c.getEmail());
                e.setJobTitle(c.getJobTitle());
                e.setEmploymentType(rnd.nextDouble() < 0.22 ? FULL_TIME : CONTRACT);
                e.setDepartmentGroupId(c.getDepartmentGroupId());
                Long marketer = marketerOf.get(c.getId());
                e.setManagerMemberId(marketer != null ? marketer : admin == null ? null : admin.seat().getId());
                String[] city = splitLocation(c.getLocationLabel());
                e.setWorkCity(city[0]);
                e.setWorkRegion(city[1]);
                boolean justCreated = c.getCreatedAt().isAfter(now.minus(4, ChronoUnit.DAYS));
                e.setStartDate(justCreated ? today.plusDays(between(1, 7)) : date(c.getCreatedAt()));
                e.setLastActivityAt(justCreated ? null : daysAgo(rnd.nextDouble() * (rnd.nextDouble() < 0.7 ? 6 : 24)));
                if ("NOTICE".equals(c.getAvailabilityStatus()) && notice < 3) {
                    e.setEmploymentStatus("OFFBOARDING");
                    e.setEndDate(today.plusDays(between(5, 30)));
                    notice++;
                } else if ("UNAVAILABLE".equals(c.getAvailabilityStatus()) && leave < 4) {
                    e.setEmploymentStatus("ON_LEAVE");
                    leave++;
                }
                all.add(e);
            }
            // onboarding timeline
            for (HrEmployee e : all) {
                if (e.getStartDate().isAfter(today)) {
                    e.setOnboardingStage("NOT_STARTED");
                    continue;
                }
                Instant started = at(e.getStartDate(), 9);
                if (started.isAfter(now)) started = now.minus(1, ChronoUnit.HOURS);
                int dur = e.getStartDate().isBefore(today.minusDays(60)) ? 14 : between(11, 28);
                Instant completed = started.plus(dur, ChronoUnit.DAYS);
                e.setOnboardingStartedAt(started);
                if (completed.isAfter(now)) {
                    e.setOnboardingStage("IN_PROGRESS");
                } else {
                    e.setOnboardingStage("COMPLETED");
                    e.setOnboardingCompletedAt(completed);
                }
                e.setCreatedAt(started.isBefore(now) ? started : now);
                e.setUpdatedAt(e.getLastActivityAt() != null ? e.getLastActivityAt() : e.getCreatedAt());
            }
            for (HrEmployee e : all) if (e.getCreatedAt() == null || e.getOnboardingStage().equals("NOT_STARTED")) e.setCreatedAt(daysAgo(between(1, 4)));
            List<HrEmployee> saved = employeeRepo.saveAllAndFlush(all);

            List<HrOnboardingItem> items = new ArrayList<>();
            List<HrDocumentRequirement> docs = new ArrayList<>();
            List<HrTrainingRecord> records = new ArrayList<>();
            List<HrLifecycleEvent> events = new ArrayList<>();
            List<HrOffboardingTask> offTasks = new ArrayList<>();
            List<HrEmployeeNote> notes = new ArrayList<>();
            for (HrEmployee e : saved) {
                String stage = e.getOnboardingStage();
                String[] titles = FULL_TIME.equals(e.getEmploymentType()) ? ONBOARDING_FT : ONBOARDING_CT;
                int sinceStart = (int) ChronoUnit.DAYS.between(e.getStartDate(), today);
                for (int i = 0; i < titles.length; i++) {
                    HrOnboardingItem it = new HrOnboardingItem();
                    it.setOrgId(orgId);
                    it.setEmployeeId(e.getId());
                    it.setTitle(titles[i]);
                    LocalDate due = e.getStartDate().plusDays(ONBOARDING_OFFSET[i]);
                    it.setDueDate(due);
                    it.setSortOrder(i);
                    boolean done = stage.equals("COMPLETED") || (stage.equals("IN_PROGRESS") && i < titles.length - 1 && ONBOARDING_OFFSET[i] < sinceStart - 1);
                    it.setDone(done);
                    if (done) it.setDoneAt(capNow(at(due, 10 + i).minus(rnd.nextInt(2), ChronoUnit.DAYS)));
                    it.setCreatedAt(e.getCreatedAt());
                    items.add(it);
                }
                for (String[] dt : DOC_TYPES) {
                    HrDocumentRequirement d = new HrDocumentRequirement();
                    d.setOrgId(orgId);
                    d.setEmployeeId(e.getId());
                    d.setDocType(dt[0]);
                    d.setLabel(dt[1]);
                    boolean complete = switch (stage) {
                        case "COMPLETED" -> rnd.nextDouble() < 0.97;
                        case "IN_PROGRESS" -> rnd.nextDouble() < 0.55;
                        default -> false;
                    };
                    d.setStatus(!complete ? "PENDING" : dt[0].equals("ID_VERIFICATION") ? "VERIFIED" : "COMPLETED");
                    if (complete) d.setStatusAt(capNow(at(e.getStartDate(), 9).plus(between(1, 12), ChronoUnit.DAYS)));
                    d.setUpdatedAt(d.getStatusAt() != null ? d.getStatusAt() : e.getCreatedAt());
                    docs.add(d);
                }
                if (!stage.equals("NOT_STARTED")) {
                    boolean newHire = e.getStartDate().isAfter(today.minusDays(60));
                    for (int ti = 0; ti < trainings.size(); ti++) {
                        HrTrainingRecord r = new HrTrainingRecord();
                        r.setOrgId(orgId);
                        r.setEmployeeId(e.getId());
                        r.setTrainingId(trainings.get(ti).getId());
                        LocalDate due = newHire ? e.getStartDate().plusDays(30 + ti * 3) : today.minusDays(between(0, 180));
                        r.setDueOn(due);
                        if (due.isAfter(today)) {
                            r.setStatus("PENDING");
                            if (rnd.nextDouble() < 0.3) {
                                r.setCompletedOn(today.minusDays(between(0, 10)));
                                r.setStatus("COMPLETED");
                            }
                        } else if (rnd.nextDouble() < 0.93) {
                            LocalDate done = due.plusDays(between(-10, 20));
                            if (done.isAfter(today)) done = today;
                            if (done.isBefore(e.getStartDate())) done = e.getStartDate();
                            r.setCompletedOn(done);
                            r.setStatus("COMPLETED");
                        } else {
                            r.setStatus("OVERDUE");
                        }
                        r.setCreatedAt(e.getCreatedAt());
                        records.add(r);
                    }
                }
                // lifecycle
                events.add(event(e, "HIRED", null, e.getJobTitle(), "Joined as " + e.getJobTitle(), at(e.getStartDate(), 9)));
                if (e.getOnboardingStartedAt() != null) events.add(event(e, "ONBOARDING_STARTED", null, null, "Onboarding checklist started", e.getOnboardingStartedAt()));
                if (e.getOnboardingCompletedAt() != null) events.add(event(e, "ONBOARDING_COMPLETED", null, null, "Onboarding checklist completed", e.getOnboardingCompletedAt()));
                if ("ON_LEAVE".equals(e.getEmploymentStatus())) events.add(event(e, "LEAVE_STARTED", "ACTIVE", "ON_LEAVE", "Leave recorded", daysAgo(between(2, 20))));
                if ("OFFBOARDING".equals(e.getEmploymentStatus())) {
                    Instant began = daysAgo(between(5, 30));
                    events.add(event(e, "OFFBOARDING_STARTED", "ACTIVE", "OFFBOARDING", "Offboarding started", began));
                    int doneCount = between(1, 2);
                    for (int i = 0; i < OFFBOARDING.length; i++) {
                        HrOffboardingTask t = new HrOffboardingTask();
                        t.setOrgId(orgId);
                        t.setEmployeeId(e.getId());
                        t.setTitle(OFFBOARDING[i]);
                        t.setDueDate(e.getEndDate().minusDays(OFFBOARDING.length - i));
                        t.setCreatedAt(began);
                        if (i < doneCount) {
                            t.setDone(true);
                            Instant doneAt = began.plus(between(1, 9), ChronoUnit.DAYS);
                            t.setDoneAt(doneAt.isAfter(now) ? now.minus(1, ChronoUnit.HOURS) : doneAt);
                        }
                        offTasks.add(t);
                    }
                }
                if (sinceStart > 120 && rnd.nextDouble() < 0.12) {
                    events.add(event(e, "TITLE_CHANGE", "Associate " + e.getJobTitle(), e.getJobTitle(), "Title updated", daysAgo(between(30, 110))));
                }
                if (rnd.nextDouble() < 0.10 && !stage.equals("NOT_STARTED")) {
                    int n = between(1, 2);
                    for (int i = 0; i < n; i++) {
                        HrEmployeeNote note = new HrEmployeeNote();
                        note.setOrgId(orgId);
                        note.setEmployeeId(e.getId());
                        note.setAuthorMemberId(admin == null ? null : admin.seat().getId());
                        note.setBody(NOTE_TEXTS[rnd.nextInt(NOTE_TEXTS.length)]);
                        note.setCreatedAt(daysAgo(rnd.nextDouble() * 40));
                        notes.add(note);
                    }
                }
            }
            onboardingRepo.saveAll(items);
            documentRepo.saveAll(docs);
            trainingRecordRepo.saveAll(records);
            offboardingRepo.saveAll(offTasks);
            lifecycleRepo.saveAll(events);
            noteRepo.saveAll(notes);
        }

        HrEmployee newEmployee() {
            HrEmployee e = new HrEmployee();
            e.setOrgId(orgId);
            return e;
        }

        HrLifecycleEvent event(HrEmployee e, String type, String from, String to, String detail, Instant when) {
            HrLifecycleEvent ev = new HrLifecycleEvent();
            ev.setOrgId(orgId);
            ev.setEmployeeId(e.getId());
            ev.setEventType(type);
            ev.setFromValue(from == null ? null : cut(from, 60));
            ev.setToValue(to == null ? null : cut(to, 60));
            ev.setDetail(detail);
            ev.setActorMemberId(byKey.containsKey("hana") ? byKey.get("hana").seat().getId() : admin == null ? null : admin.seat().getId());
            ev.setOccurredAt(when.isAfter(now) ? now : when);
            return ev;
        }

        String cut(String s, int n) {
            return s.length() <= n ? s : s.substring(0, n);
        }

        String[] splitLocation(String label) {
            if (label == null) return new String[] { "Remote", "US" };
            int i = label.lastIndexOf(',');
            if (i < 0) return new String[] { label.trim(), "" };
            return new String[] { label.substring(0, i).trim(), label.substring(i + 1).trim() };
        }

        // ============================ Finance ============================

        /** One placement-month under construction. */
        private final class Draft {
            TalentPlacement p;
            int k;
            LocalDate month;
            LocalDate monthEnd;
            BigDecimal hours;
            long bill;
            long pay;
            long revenue;
            long payout;
            String tsStatus; // null = no timesheet
            Instant submittedAt;
            Instant decidedAt;
            String invoiceKind; // null, PAID, ISSUED
            LocalDate issuedOn;
            LocalDate paidOn;
            FinanceInvoice invoice;
            FinanceTimesheet timesheet;
        }

        long money(long ratePerHourMinor, BigDecimal hours) {
            return BigDecimal.valueOf(ratePerHourMinor).multiply(hours).setScale(0, RoundingMode.HALF_UP).longValue();
        }

        int weekdays(LocalDate from, LocalDate to) {
            int n = 0;
            for (LocalDate d = from; !d.isAfter(to); d = d.plusDays(1)) {
                DayOfWeek w = d.getDayOfWeek();
                if (w != DayOfWeek.SATURDAY && w != DayOfWeek.SUNDAY) n++;
            }
            return n;
        }

        void seedFinance() {
            List<TalentPlacement> placements = new ArrayList<>(placementRepo.findByOrgId(orgId));
            placements.sort(Comparator.comparing(TalentPlacement::getId));
            Pm finance = byKey.get(spec.financeKey()) != null ? byKey.get(spec.financeKey()) : admin;
            List<Pm> accountManagers = new ArrayList<>();
            for (String k : spec.accountManagerKeys()) if (byKey.containsKey(k)) accountManagers.add(byKey.get(k));
            if (accountManagers.isEmpty() && admin != null) accountManagers.add(admin);
            LocalDate firstMonth = monthStart(5);

            List<Draft> drafts = new ArrayList<>();
            Map<Long, Long> payRateOf = new HashMap<>();
            for (TalentPlacement p : placements) {
                if (p.getBillRateMinor() == null) continue;
                double base = 0.655 + rnd.nextDouble() * 0.045; // pay as a share of bill at the newest month
                payRateOf.put(p.getId(), Math.round(p.getBillRateMinor() * base));
                for (int k = 5; k >= 0; k--) {
                    LocalDate month = monthStart(k);
                    LocalDate monthEnd = month.plusMonths(1).minusDays(1);
                    LocalDate from = p.getStartDate().isAfter(month) ? p.getStartDate() : month;
                    LocalDate to = p.getEndDate() != null && p.getEndDate().isBefore(monthEnd) ? p.getEndDate() : monthEnd;
                    if (from.isAfter(to)) continue;
                    Draft d = new Draft();
                    d.p = p;
                    d.k = k;
                    d.month = month;
                    d.monthEnd = monthEnd;
                    double hrs = weekdays(from, to) * 8 * (0.93 + rnd.nextDouble() * 0.07);
                    d.hours = BigDecimal.valueOf(Math.round(hrs * 2) / 2.0).setScale(2, RoundingMode.HALF_UP);
                    if (d.hours.signum() == 0) continue;
                    d.bill = p.getBillRateMinor();
                    double ratio = Math.min(0.9, base + 0.006 * k);
                    d.pay = Math.round(p.getBillRateMinor() * ratio);
                    d.revenue = money(d.bill, d.hours);
                    d.payout = money(d.pay, d.hours);
                    planWorkflow(d);
                    drafts.add(d);
                }
            }
            // invoice codes by issue date
            List<Draft> invoiced = new ArrayList<>();
            for (Draft d : drafts) if (d.invoiceKind != null) invoiced.add(d);
            invoiced.sort(Comparator.comparing((Draft d) -> d.issuedOn).thenComparing(d -> d.p.getId()));
            Map<Integer, Integer> seq = new HashMap<>();
            for (Draft d : invoiced) {
                int y = d.issuedOn.getYear();
                int n = seq.merge(y, 1, Integer::sum);
                FinanceInvoice inv = new FinanceInvoice();
                inv.setOrgId(orgId);
                inv.setCode(String.format("INV-%d-%04d", y, n));
                inv.setClientId(d.p.getClientId());
                inv.setPlacementId(d.p.getId());
                inv.setPeriodStart(d.month);
                inv.setAmountMinor(d.revenue);
                inv.setIssuedOn(d.issuedOn);
                inv.setDueOn(d.issuedOn.plusDays(30));
                if ("PAID".equals(d.invoiceKind)) {
                    inv.setStatus("PAID");
                    inv.setPaidOn(d.paidOn);
                } else {
                    inv.setStatus(inv.getDueOn().isBefore(today) ? "OVERDUE" : "ISSUED");
                }
                inv.setCreatedAt(capNow(at(d.issuedOn, 10)));
                d.invoice = invoiceRepo.save(inv);
            }
            // terms, timesheets, periods, payments
            for (TalentPlacement p : placements) {
                if (!payRateOf.containsKey(p.getId())) continue;
                FinancePlacementTerms t = new FinancePlacementTerms();
                t.setOrgId(orgId);
                t.setPlacementId(p.getId());
                t.setPayRateMinor(payRateOf.get(p.getId()));
                t.setRateUnit(p.getRateUnit() == null ? "HOUR" : p.getRateUnit());
                t.setCurrency(p.getCurrency());
                t.setAccountManagerMemberId(accountManagers.get((int) (p.getId() % accountManagers.size())).seat().getId());
                t.setCreatedAt(p.getCreatedAt());
                t.setUpdatedAt(p.getCreatedAt());
                termsRepo.save(t);
            }
            for (Draft d : drafts) {
                if (d.tsStatus != null) {
                    FinanceTimesheet ts = new FinanceTimesheet();
                    ts.setOrgId(orgId);
                    ts.setPlacementId(d.p.getId());
                    ts.setConsultantId(d.p.getConsultantId());
                    ts.setPeriodStart(d.month);
                    ts.setHours(d.hours);
                    ts.setStatus(d.tsStatus);
                    ts.setSubmittedAt(d.submittedAt);
                    ts.setCreatedAt(d.submittedAt);
                    if (d.decidedAt != null) {
                        ts.setDecidedAt(d.decidedAt);
                        ts.setDecidedByMemberId(finance == null ? null : finance.seat().getId());
                    }
                    if ("REJECTED".equals(d.tsStatus)) ts.setRejectReason("Hours do not match the client's record; please resubmit.");
                    d.timesheet = timesheetRepo.save(ts);
                }
                FinancePlacementPeriod pp = new FinancePlacementPeriod();
                pp.setOrgId(orgId);
                pp.setPlacementId(d.p.getId());
                pp.setClientId(d.p.getClientId());
                pp.setConsultantId(d.p.getConsultantId());
                pp.setPeriodStart(d.month);
                pp.setBillRateMinor(d.bill);
                pp.setPayRateMinor(d.pay);
                pp.setRateUnit("HOUR");
                pp.setCurrency(d.p.getCurrency());
                pp.setHours(d.hours);
                pp.setRevenueMinor(d.revenue);
                pp.setPayoutMinor(d.payout);
                pp.setMarginBps(d.revenue == 0 ? 0 : (int) ((d.revenue - d.payout) * 10000 / d.revenue));
                pp.setInvoiceId(d.invoice == null ? null : d.invoice.getId());
                pp.setTimesheetId(d.timesheet == null ? null : d.timesheet.getId());
                pp.setInvoiceStatus(d.invoice != null ? switch (d.invoice.getStatus()) {
                    case "PAID" -> "PAID";
                    case "OVERDUE" -> "OVERDUE";
                    default -> "INVOICED";
                } : "APPROVED".equals(d.tsStatus) ? "PENDING_INVOICE" : "PENDING_REVIEW");
                Instant created = capNow(at(d.monthEnd.plusDays(1), 0));
                pp.setCreatedAt(created);
                pp.setUpdatedAt(created);
                periodRepo.save(pp);
                // payments
                if (d.invoice != null && "PAID".equals(d.invoice.getStatus())) {
                    FinancePayment in = new FinancePayment();
                    in.setOrgId(orgId);
                    in.setDirection("IN");
                    in.setStatus("PAID");
                    in.setAmountMinor(d.revenue);
                    in.setCurrency(d.p.getCurrency());
                    in.setPlacementId(d.p.getId());
                    in.setConsultantId(d.p.getConsultantId());
                    in.setInvoiceId(d.invoice.getId());
                    in.setPeriodStart(d.month);
                    in.setDueOn(d.invoice.getDueOn());
                    in.setPaidOn(d.invoice.getPaidOn());
                    in.setMethodLabel("Recorded (received outside Kiwiply)");
                    in.setMemo("Invoice " + d.invoice.getCode());
                    in.setCreatedAt(capNow(at(d.invoice.getPaidOn(), 12)));
                    paymentRepo.save(in);
                }
                if (d.tsStatus == null || "APPROVED".equals(d.tsStatus)) {
                    FinancePayment out = new FinancePayment();
                    out.setOrgId(orgId);
                    out.setDirection("OUT");
                    out.setAmountMinor(d.payout);
                    out.setCurrency(d.p.getCurrency());
                    out.setPlacementId(d.p.getId());
                    out.setConsultantId(d.p.getConsultantId());
                    out.setPeriodStart(d.month);
                    LocalDate due = d.monthEnd.plusDays(7);
                    out.setDueOn(due);
                    Instant outCreated = d.decidedAt != null ? d.decidedAt : capNow(at(d.monthEnd.plusDays(1), 8));
                    out.setCreatedAt(outCreated);
                    boolean paid = !due.isAfter(today) && (d.tsStatus == null || rnd.nextDouble() < 0.85);
                    if (paid) {
                        LocalDate paidOn = due.minusDays(rnd.nextInt(4));
                        LocalDate createdDay = date(outCreated);
                        out.setPaidOn(paidOn.isBefore(createdDay) ? createdDay : paidOn);
                        out.setStatus("PAID");
                        out.setMethodLabel("Recorded (paid outside Kiwiply)");
                    } else {
                        out.setStatus("PENDING");
                    }
                    out.setMemo("Payout for " + d.month.getMonth().name().charAt(0) + d.month.getMonth().name().substring(1).toLowerCase() + " " + d.month.getYear());
                    paymentRepo.save(out);
                }
            }
            // forecast inputs for the next six months
            long active = placementRepo.countByOrgIdAndStatus(orgId, "ACTIVE");
            int[] growthPct = { 3, 5, 6, 8, 9, 11 };
            int[] billBps = { 0, 0, 50, 50, 100, 100 };
            int[] payBps = { 0, 0, 25, 25, 50, 50 };
            for (int i = 0; i < 6; i++) {
                FinanceForecastInput f = new FinanceForecastInput();
                f.setOrgId(orgId);
                f.setMonthStart(today.withDayOfMonth(1).plusMonths(i + 1));
                f.setExpectedPlacements((int) Math.round(active * (1 + growthPct[i] / 100.0)));
                f.setExpectedHoursPerPlacement(BigDecimal.valueOf(150 + i).setScale(2, RoundingMode.HALF_UP));
                f.setBillRateChangeBps(billBps[i]);
                f.setPayRateChangeBps(payBps[i]);
                f.setNotes("Current run rate plus planned starts");
                f.setUpdatedAt(now);
                forecastRepo.save(f);
            }
        }

        /** Decides the timesheet and invoice story of one placement-month (see ops-data-foundation.md section 3). */
        void planWorkflow(Draft d) {
            double r = rnd.nextDouble();
            Instant monthEndInstant = at(d.monthEnd.plusDays(1), 9);
            if (d.k <= 2) {
                d.tsStatus = switch (d.k) {
                    case 0 -> r < 0.45 ? "PENDING" : r < 0.95 ? "APPROVED" : "REJECTED";
                    case 1 -> r < 0.04 ? "PENDING" : r < 0.97 ? "APPROVED" : "REJECTED";
                    default -> "APPROVED";
                };
                Instant submitted;
                if (d.k == 0) {
                    int into = (int) ChronoUnit.DAYS.between(d.month, today);
                    submitted = at(d.month.plusDays(1 + (into > 1 ? rnd.nextInt(into) : 0)), between(9, 17));
                } else {
                    submitted = monthEndInstant.plus(rnd.nextInt(3) * 24L + between(0, 8), ChronoUnit.HOURS);
                }
                if (submitted.isAfter(now.minus(1, ChronoUnit.HOURS))) submitted = now.minus(between(1, 20), ChronoUnit.HOURS);
                d.submittedAt = submitted;
                if (!"PENDING".equals(d.tsStatus)) {
                    Instant dec = submitted.plusSeconds(3600 + (long) (rnd.nextDouble() * 5 * 86400));
                    if (dec.isAfter(now.minus(5, ChronoUnit.MINUTES))) dec = now.minus(5, ChronoUnit.MINUTES);
                    d.decidedAt = dec;
                }
            }
            boolean approved = d.tsStatus == null || "APPROVED".equals(d.tsStatus);
            if (!approved) return;
            double x = rnd.nextDouble();
            switch (d.k) {
                case 0 -> {
                    if (x < 0.15) {
                        d.invoiceKind = "ISSUED";
                        d.issuedOn = today;
                    }
                }
                case 1 -> {
                    if (x < 0.20) paidInvoice(d, 3);
                    else if (x < 0.80) {
                        d.invoiceKind = "ISSUED";
                        d.issuedOn = capDate(d.monthEnd.plusDays(between(1, 3)));
                    }
                }
                case 2 -> {
                    if (x < 0.88) paidInvoice(d, 3);
                    else {
                        d.invoiceKind = "ISSUED";
                        d.issuedOn = capDate(d.monthEnd.plusDays(between(1, 3)));
                    }
                }
                default -> paidInvoice(d, 3);
            }
        }

        void paidInvoice(Draft d, int issueDelay) {
            d.invoiceKind = "PAID";
            d.issuedOn = capDate(d.monthEnd.plusDays(between(1, issueDelay)));
            LocalDate paid = d.issuedOn.plusDays(between(12, 34));
            d.paidOn = paid.isAfter(today) ? today : paid;
        }

        LocalDate capDate(LocalDate d) {
            return d.isAfter(today) ? today : d;
        }

        // ============================ Reports ============================

        void seedReports() {
            List<Pm> staff = new ArrayList<>();
            for (Pm pm : byKey.values()) if (pm.seat().getStatus() == OrgMemberStatus.ACTIVE) staff.add(pm);
            if (staff.isEmpty()) return;
            List<ReportDefinition> defs = new ArrayList<>();
            List<RSpec> specs = REPORTS.subList(0, spec.reports());
            for (int i = 0; i < specs.size(); i++) {
                RSpec s = specs.get(i);
                Pm owner = byKey.get(spec.reportOwnerKeys().get(i % spec.reportOwnerKeys().size()));
                if (owner == null) owner = staff.get(i % staff.size());
                ReportDefinition d = new ReportDefinition();
                d.setOrgId(orgId);
                d.setName(s.name());
                d.setDescription(s.description());
                d.setReportType(s.type());
                d.setSourceKey(s.key());
                d.setOwnerMemberId(owner.seat().getId());
                d.setScheduleFrequency(s.freq());
                if (!"NONE".equals(s.freq())) {
                    d.setScheduleDay(s.day());
                    d.setScheduleTime(s.time());
                }
                d.setCreatedAt(daysAgo(between(60, 200)));
                d.setUpdatedAt(d.getCreatedAt());
                defs.add(d);
            }
            defs = definitionRepo.saveAllAndFlush(defs);
            List<ReportRun> allRuns = new ArrayList<>();
            List<ReportMetric> metrics = new ArrayList<>();
            List<ReportRecipient> recips = new ArrayList<>();
            Map<Long, List<ReportRun>> runsOf = new HashMap<>();
            for (int i = 0; i < defs.size(); i++) {
                ReportDefinition d = defs.get(i);
                RSpec s = specs.get(i);
                for (int m = 0; m < s.metrics().size(); m++) {
                    ReportMetric rm = new ReportMetric();
                    rm.setOrgId(orgId);
                    rm.setDefinitionId(d.getId());
                    rm.setLabel(s.metrics().get(m));
                    rm.setSortOrder(m);
                    metrics.add(rm);
                }
                int n = Math.min(staff.size(), between(2, 4));
                List<Pm> pool = new ArrayList<>(staff);
                List<Long> chosen = new ArrayList<>();
                chosen.add(d.getOwnerMemberId());
                java.util.Collections.shuffle(pool, rnd);
                for (Pm pm : pool) {
                    if (chosen.size() >= n) break;
                    if (!chosen.contains(pm.seat().getId())) chosen.add(pm.seat().getId());
                }
                for (Long id : chosen) {
                    ReportRecipient rr = new ReportRecipient();
                    rr.setOrgId(orgId);
                    rr.setDefinitionId(d.getId());
                    rr.setMemberId(id);
                    rr.setCreatedAt(d.getCreatedAt());
                    recips.add(rr);
                }
                // run history
                List<Instant> times = new ArrayList<>();
                boolean manual = "NONE".equals(s.freq());
                if (manual) {
                    times.add(daysAgo(between(5, 20)));
                    times.add(daysAgo(between(30, 70)));
                } else if ("WEEKLY".equals(s.freq())) {
                    Instant last = lastWeekly(s.day(), s.time());
                    for (int w = 0; w < 12; w++) times.add(last.minus(7L * w, ChronoUnit.DAYS));
                } else {
                    Instant last = lastMonthly(s.day(), s.time());
                    for (int mo = 0; mo < 6; mo++) times.add(at(date(last).minusMonths(mo), 0).plusSeconds(last.getEpochSecond() - at(date(last), 0).getEpochSecond()));
                }
                List<ReportRun> mine = new ArrayList<>();
                for (int j = 0; j < times.size(); j++) {
                    boolean failed = (i % 5 == 2 && j == 3) || (s.key().equals("timesheets_payouts") && j == 0);
                    ReportRun r = new ReportRun();
                    r.setOrgId(orgId);
                    r.setDefinitionId(d.getId());
                    r.setTriggerKind(manual ? "MANUAL" : "SCHEDULED");
                    r.setRunByMemberId(manual ? d.getOwnerMemberId() : null);
                    r.setStartedAt(times.get(j));
                    r.setFinishedAt(times.get(j).plusSeconds(between(4, 90)));
                    if (failed) {
                        r.setStatus("FAILED");
                        r.setSummary("Run failed");
                        r.setErrorLabel("Data source timed out; the run can be retried");
                    } else {
                        r.setStatus("COMPLETED");
                        r.setChartsCount(s.charts());
                        r.setTablesCount(s.tables());
                        r.setSummary("Generated " + s.charts() + " charts and " + s.tables() + " tables");
                    }
                    mine.add(r);
                }
                runsOf.put(d.getId(), mine);
                allRuns.addAll(mine);
            }
            definitionRepo.flush();
            runRepo.saveAll(allRuns);
            metricRepo.saveAll(metrics);
            recipientRepo.saveAll(recips);
            // denormalised last run + next run
            for (int i = 0; i < defs.size(); i++) {
                ReportDefinition d = defs.get(i);
                RSpec s = specs.get(i);
                ReportRun latest = runsOf.get(d.getId()).get(0);
                d.setLastRunAt(latest.getStartedAt());
                d.setLastRunStatus(latest.getStatus());
                d.setLastRunSummary(latest.getSummary());
                if ("WEEKLY".equals(s.freq())) d.setNextRunAt(latest.getStartedAt().plus(7, ChronoUnit.DAYS));
                else if ("MONTHLY".equals(s.freq())) d.setNextRunAt(at(date(latest.getStartedAt()).plusMonths(1), 0).plusSeconds(latest.getStartedAt().getEpochSecond() - at(date(latest.getStartedAt()), 0).getEpochSecond()));
                d.setUpdatedAt(now);
            }
            definitionRepo.saveAll(defs);
            // exports: the newest few are still READY (24 h), the rest expired, one failed
            List<ReportExport> exports = new ArrayList<>();
            int total = Math.max(3, defs.size() - 2);
            String[] formats = { "PDF", "CSV", "XLSX", "PDF" };
            for (int e = 0; e < total; e++) {
                ReportDefinition d = defs.get(e % defs.size());
                ReportExport x = new ReportExport();
                x.setOrgId(orgId);
                x.setDefinitionId(d.getId());
                x.setFormat(formats[e % formats.length]);
                boolean ready = e < Math.min(4, total - 1);
                Instant requested = ready ? now.minus(between(1, 20), ChronoUnit.HOURS) : daysAgo(between(3, 60));
                x.setRequestedAt(requested);
                x.setRequestedByMemberId(d.getOwnerMemberId());
                x.setExpiresAt(requested.plus(24, ChronoUnit.HOURS));
                boolean failed = e == total - 1;
                x.setStatus(failed ? "FAILED" : ready ? "READY" : "EXPIRED");
                String slug = d.getName().toLowerCase().replaceAll("[^a-z0-9]+", "-").replaceAll("^-|-$", "");
                x.setFileName(slug + "-" + date(requested) + "." + x.getFormat().toLowerCase());
                if (!failed) x.setSizeKb(between(40, 900));
                for (ReportRun run : runsOf.get(d.getId())) {
                    if ("COMPLETED".equals(run.getStatus()) && !run.getStartedAt().isAfter(requested)) {
                        x.setRunId(run.getId());
                        break;
                    }
                }
                exports.add(x);
            }
            exportRepo.saveAll(exports);
        }

        /** The latest occurrence at or before now of a weekly schedule (ISO day of week, HH:mm UTC). */
        Instant lastWeekly(int isoDay, String time) {
            LocalTime t = LocalTime.parse(time);
            LocalDate d = today;
            while (d.getDayOfWeek().getValue() != isoDay) d = d.minusDays(1);
            Instant at = d.atTime(t).toInstant(ZoneOffset.UTC);
            return at.isAfter(now) ? at.minus(7, ChronoUnit.DAYS) : at;
        }

        /** The latest occurrence at or before now of a monthly schedule (day of month 1-28, HH:mm UTC). */
        Instant lastMonthly(int day, String time) {
            LocalTime t = LocalTime.parse(time);
            Instant at = today.withDayOfMonth(day).atTime(t).toInstant(ZoneOffset.UTC);
            return at.isAfter(now) ? today.withDayOfMonth(1).minusMonths(1).withDayOfMonth(day).atTime(t).toInstant(ZoneOffset.UTC) : at;
        }
    }
}
