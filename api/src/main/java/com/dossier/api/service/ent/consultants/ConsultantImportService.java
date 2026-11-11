package com.dossier.api.service.ent.consultants;

import com.dossier.api.domain.ent.OrgRoleDefinition;
import com.dossier.api.repository.ent.OrgRoleRepository;
import com.dossier.api.service.ResumeDocException;
import com.dossier.api.service.dto.org.OrgInviteRequest;
import com.dossier.api.service.dto.org.OrgInviteResultDTO;
import com.dossier.api.service.ent.RoleTemplates;
import com.dossier.api.service.org.OrgAuditService;
import com.dossier.api.service.org.OrgException;
import com.dossier.api.service.org.OrgInviteService;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.org.OrgNotFoundException;
import jakarta.persistence.EntityManager;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Import consultants from a CSV (docs/enterprise-v2/ONBOARDING-BUILD.md, gap A3): the browser reads the file, this service checks every row with the very
 * rules of "Add consultant" ({@link ConsultantWriteService#checkCreate}) and, on Apply, creates the READY rows. For a ticked row it sends the normal
 * invitation first (the Consultant role), so the new profile links to that invited seat the moment it is created. One row's failure never stops
 * the others: each row runs in its own transaction. Resumes are not imported (user decision 2026-11-11: they live in the consultant's own account).
 *
 * <p>Gates: {@code consultants.edit} for everything; {@code members.invite} for the invitations (without it a row is created and simply not invited).
 */
@Service
public class ConsultantImportService {

    /** At most this many rows per import. */
    public static final int MAX_ROWS = 500;
    public static final String AUDIT_IMPORT = "CONSULTANT_IMPORT";
    static final String INVITE_KEY = "members.invite";

    /** One row of the file, as the browser read it ({@code years} may be blank; {@code department} is a department's name). */
    public record Row(String name, String email, String jobTitle, String location, String workMode, String years, List<String> skills, String department, Boolean invite) {}

    public record ImportRequest(List<Row> rows) {}

    /**
     * The verdict on one row. {@code status}: READY, INVALID, DUPLICATE (in the organization or earlier in the file), SENSITIVE (a never-collected
     * value). {@code field} names the cell at fault. {@code invite}: WILL_INVITE, NOT_ASKED, ALREADY_MEMBER, NO_PERMISSION.
     */
    public record Verdict(int row, String email, String status, String field, String message, String invite) {}

    public record CheckResult(int total, int ready, List<Verdict> rows) {}

    /** One applied row: CREATED, or SKIPPED with the reason; {@code invited} when an invitation went out. */
    public record Applied(int row, String email, String outcome, boolean invited, String message) {}

    public record ApplyResult(int added, int invited, int skipped, List<Applied> rows) {}

    private final ConsultantWriteService write;
    private final OrgInviteService invites;
    private final OrgRoleRepository roles;
    private final OrgAuditService audit;
    private final EntityManager em;
    private final TransactionTemplate perRow;
    private final TransactionTemplate checkRow;

    public ConsultantImportService(ConsultantWriteService write, OrgInviteService invites, OrgRoleRepository roles, OrgAuditService audit, EntityManager em, PlatformTransactionManager txm) {
        this.write = write;
        this.invites = invites;
        this.roles = roles;
        this.audit = audit;
        this.em = em;
        this.perRow = new TransactionTemplate(txm);
        this.perRow.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        // a refused row throws; checking it in a transaction of its own keeps that refusal from marking any caller's transaction rollback-only
        this.checkRow = new TransactionTemplate(txm);
        this.checkRow.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        this.checkRow.setReadOnly(true);
    }

    // ---- check --------------------------------------------------------------------------------------------------------------

    /** Every row's verdict; writes nothing. */
    public CheckResult check(OrgMembership me, ImportRequest req) {
        write.gate(me, ConsultantAccess.EDIT);
        List<Row> rows = rows(req);
        List<Verdict> out = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        boolean canInvite = me.canKey(INVITE_KEY);
        int ready = 0;
        for (int i = 0; i < rows.size(); i++) {
            Verdict v = verdict(me, i + 1, rows.get(i), seen, canInvite);
            if ("READY".equals(v.status())) ready++;
            out.add(v);
        }
        return new CheckResult(rows.size(), ready, out);
    }

    private Verdict verdict(OrgMembership me, int n, Row r, Set<String> seen, boolean canInvite) {
        String email = r == null || r.email() == null ? "" : r.email().trim();
        String lower = email.toLowerCase(Locale.ROOT);
        try {
            checkRow.executeWithoutResult(st -> write.checkCreate(me.orgId(), request(me.orgId(), r)));
        } catch (DepartmentNotFound e) {
            return new Verdict(n, email, "INVALID", "department", "No department called \"" + e.name + "\". Add it on Teams & Departments, or leave the cell empty.", null);
        } catch (YearsNotANumber e) {
            return new Verdict(n, email, "INVALID", "years", "Years must be a whole number.", null);
        } catch (ResumeDocException e) {
            return new Verdict(n, email, "SENSITIVE", fieldOf(e), "A value looks like an ID, bank or tax number. We never accept those.", null);
        } catch (OrgNotFoundException e) { // a subtype of OrgException, so it goes first
            return new Verdict(n, email, "INVALID", "department", "That department isn't in this organization.", null);
        } catch (OrgException e) {
            boolean dup = ConsultantWriteService.CODE_CONSULTANT_EXISTS.equals(e.getCode());
            return new Verdict(n, email, dup ? "DUPLICATE" : "INVALID", fieldOf(e), dup ? "A consultant with this email already exists." : human(e), null);
        }
        if (!seen.add(lower)) return new Verdict(n, email, "DUPLICATE", "email", "This email is on an earlier row of the file.", null);
        String invite = !Boolean.TRUE.equals(r.invite()) ? "NOT_ASKED" : !canInvite ? "NO_PERMISSION" : alreadyMember(me.orgId(), lower) ? "ALREADY_MEMBER" : "WILL_INVITE";
        return new Verdict(n, email, "READY", null, null, invite);
    }

    // ---- apply --------------------------------------------------------------------------------------------------------------

    /** Re-checks every row and creates the READY ones (inviting the ticked ones first). Not transactional itself: each row commits on its own. */
    public ApplyResult apply(OrgMembership me, ImportRequest req) {
        write.gate(me, ConsultantAccess.EDIT);
        CheckResult checked = check(me, req);
        List<Row> rows = rows(req);
        Long consultantRole = roles.findSystemByRoleKey(RoleTemplates.CONSULTANT).map(OrgRoleDefinition::getId).orElse(null);
        List<Applied> out = new ArrayList<>();
        int added = 0;
        int invited = 0;
        for (Verdict v : checked.rows()) {
            if (!"READY".equals(v.status())) {
                out.add(new Applied(v.row(), v.email(), "SKIPPED", false, v.message()));
                continue;
            }
            Row r = rows.get(v.row() - 1);
            boolean invite = "WILL_INVITE".equals(v.invite());
            try {
                boolean sent = Boolean.TRUE.equals(perRow.execute(st -> {
                    boolean ok = false;
                    if (invite) {
                        OrgInviteResultDTO res = invites.invite(me, new OrgInviteRequest(List.of(v.email()), null, null, null, consultantRole == null ? null : List.of(consultantRole), null, null, null, cleanName(r.name()), null));
                        ok = res.invited() != null && !res.invited().isEmpty();
                    }
                    write.create(me, request(me.orgId(), r)); // links to the invited seat by email (seatFor), as "Add consultant" does
                    return ok;
                }));
                added++;
                if (sent) invited++;
                out.add(new Applied(v.row(), v.email(), "CREATED", sent, null));
            } catch (RuntimeException e) {
                out.add(new Applied(v.row(), v.email(), "SKIPPED", false, messageOf(e)));
            }
        }
        int skipped = out.size() - added;
        audit.record(me, AUDIT_IMPORT, "CONSULTANT", null, null, "imported " + added + " of " + out.size() + " rows; " + invited + " invited; " + skipped + " skipped");
        return new ApplyResult(added, invited, skipped, out);
    }

    // ---- helpers ------------------------------------------------------------------------------------------------------------

    private static List<Row> rows(ImportRequest req) {
        List<Row> rows = req == null || req.rows() == null ? List.of() : req.rows();
        if (rows.isEmpty()) throw OrgException.invalid("rows", "the file has no rows");
        if (rows.size() > MAX_ROWS) throw OrgException.invalid("rows", "at most " + MAX_ROWS + " rows per import; split the file");
        return rows;
    }

    private ConsultantWriteService.CreateRequest request(Long orgId, Row r) {
        if (r == null) throw OrgException.invalid("row", "is empty");
        Integer years = null;
        if (r.years() != null && !r.years().isBlank()) {
            try {
                years = Integer.valueOf(r.years().trim());
            } catch (NumberFormatException e) {
                throw new YearsNotANumber();
            }
        }
        Long dept = r.department() == null || r.department().isBlank() ? null : departmentId(orgId, r.department().trim());
        List<String> skills = r.skills() == null ? List.of() : r.skills().stream().filter(s -> s != null && !s.isBlank()).map(String::trim).toList();
        return new ConsultantWriteService.CreateRequest(cleanName(r.name()), r.email() == null ? null : r.email().trim(), blankToNull(r.jobTitle()), years, blankToNull(r.location()), mode(r.workMode()), skills, dept, null);
    }

    /** The department of this organization with that name (case-insensitive); refused when there is none. */
    private Long departmentId(Long orgId, String name) {
        List<Long> ids = em.createQuery(
            "select g.id from OrgGroup g where g.orgId = :o and g.kind = com.dossier.api.domain.enumeration.OrgGroupKind.DEPARTMENT and lower(g.name) = :n", Long.class
        ).setParameter("o", orgId).setParameter("n", name.toLowerCase(Locale.ROOT)).setMaxResults(1).getResultList();
        if (ids.isEmpty()) throw new DepartmentNotFound(name);
        return ids.get(0);
    }

    /** Whether the email is already an ACTIVE member's or an open invitation's in this organization (then no second invitation goes out). */
    private boolean alreadyMember(Long orgId, String lowerEmail) {
        long active = em.createQuery(
            "select count(m) from OrgMember m where m.orgId = :o and m.status = com.dossier.api.domain.enumeration.OrgMemberStatus.ACTIVE and m.userId in (select u.id from User u where lower(u.email) = :e)", Long.class
        ).setParameter("o", orgId).setParameter("e", lowerEmail).getSingleResult();
        long invitedSeats = em.createQuery(
            "select count(m) from OrgMember m where m.orgId = :o and m.status = com.dossier.api.domain.enumeration.OrgMemberStatus.INVITED and lower(m.inviteEmail) = :e", Long.class
        ).setParameter("o", orgId).setParameter("e", lowerEmail).getSingleResult();
        return active + invitedSeats > 0;
    }

    /** "Remote", "on-site", "Hybrid" → the API's REMOTE / ONSITE / HYBRID; anything else is passed on and refused by the shared rules. */
    static String mode(String raw) {
        if (raw == null || raw.isBlank()) return null;
        String m = raw.trim().toUpperCase(Locale.ROOT).replace("-", "").replace(" ", "").replace("_", "");
        return switch (m) {
            case "REMOTE" -> "REMOTE";
            case "HYBRID" -> "HYBRID";
            case "ONSITE", "OFFICE", "INOFFICE" -> "ONSITE";
            default -> raw.trim();
        };
    }

    private static String cleanName(String s) {
        return s == null ? null : s.trim().replaceAll("\\s+", " ");
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }

    private static String fieldOf(RuntimeException e) {
        if (e instanceof OrgException o && o.getExtra() != null && o.getExtra().get("field") instanceof String f) return label(f);
        if (e instanceof ResumeDocException r && r.getMessage() != null) {
            for (String f : List.of("displayName", "email", "jobTitle", "locationLabel", "skills")) if (r.getMessage().contains(f)) return label(f);
        }
        return null;
    }

    /** The CSV's column name for an API field. */
    private static String label(String field) {
        return switch (field) {
            case "displayName" -> "name";
            case "jobTitle" -> "job title";
            case "locationLabel" -> "location";
            case "workMode" -> "work mode";
            case "yearsExperience" -> "years";
            case "departmentGroupId" -> "department";
            default -> field;
        };
    }

    /** The sentence of a refusal without its "field: " prefix (the row already names the column). */
    static String human(OrgException e) {
        if (e.getExtra() != null && e.getExtra().get("message") instanceof String m && !m.isBlank()) return Character.toUpperCase(m.charAt(0)) + m.substring(1) + (m.endsWith(".") ? "" : ".");
        return e.getMessage();
    }

    private static String messageOf(RuntimeException e) {
        if (e instanceof OrgException o && o.getMessage() != null) return human(o);
        return "This row couldn't be added. Nothing was changed for it.";
    }

    /** A department name that matches no department of the organization (a row-level verdict, never a 404 for the whole file). */
    static final class DepartmentNotFound extends RuntimeException {

        private static final long serialVersionUID = 1L;
        final String name;

        DepartmentNotFound(String name) {
            super(null, null, false, false);
            this.name = name;
        }
    }

    static final class YearsNotANumber extends RuntimeException {

        private static final long serialVersionUID = 1L;

        YearsNotANumber() {
            super(null, null, false, false);
        }
    }
}
