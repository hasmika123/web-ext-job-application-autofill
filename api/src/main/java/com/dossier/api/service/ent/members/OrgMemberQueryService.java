package com.dossier.api.service.ent.members;

import com.dossier.api.domain.User;
import com.dossier.api.domain.ent.OrgMemberOffboarding;
import com.dossier.api.domain.enumeration.OrgGroupKind;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.enumeration.PermissionScope;
import com.dossier.api.domain.enumeration.ShareScope;
import com.dossier.api.domain.org.OrgAuditEvent;
import com.dossier.api.domain.org.OrgGroup;
import com.dossier.api.domain.org.OrgMember;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.ent.OrgMemberDirectoryRepository;
import com.dossier.api.repository.ent.OrgMemberOffboardingRepository;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.service.dto.ent.MemberDTO;
import com.dossier.api.service.org.DataShareService;
import com.dossier.api.service.org.OrgAuditService;
import com.dossier.api.service.org.OrgException;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.org.OrgNotFoundException;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import jakarta.persistence.TypedQuery;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Collection;
import java.util.EnumSet;
import java.util.HashMap;
import java.util.HashSet;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The read side of the Employees board on real data (X4.3 list and tiles, X4.6 detail and activity). Everything here is scoped twice: the
 * query names the organization first, and the rows the caller may see are narrowed by {@link MemberAccess} (the caller's widest people scope,
 * confirmed row by row by {@code ScopeEvaluator}). A row outside the scope is simply absent from a list and the generic 404 on the detail.
 *
 * <p>Person-owned data stays behind the person's consent: no resume, application or answer of a member is read here. The profile subset of
 * the sheet is the account's name, email and photo plus the org-set title; phone, location and timezone are not stored for a member today and
 * are returned as {@code null} (never invented).
 */
@Service
public class OrgMemberQueryService {

    public static final String CODE_FILTER_INVALID = "FILTER_INVALID";
    public static final String CODE_SORT_INVALID = "SORT_INVALID";

    public static final List<String> SORT_FIELDS = List.of("name", "joined", "status", "lastActive");
    static final int MAX_SIZE = 100;
    static final int DEFAULT_SIZE = 25;
    /** The states the table can show; ERASED seats are anonymised and never listed. */
    static final Set<OrgMemberStatus> LISTABLE = EnumSet.of(
        OrgMemberStatus.INVITED, OrgMemberStatus.ACTIVE, OrgMemberStatus.SUSPENDED, OrgMemberStatus.LEFT, OrgMemberStatus.REMOVED
    );
    static final Set<OrgMemberStatus> DEFAULT_STATES = EnumSet.of(OrgMemberStatus.INVITED, OrgMemberStatus.ACTIVE, OrgMemberStatus.SUSPENDED);
    private static final Set<OrgMemberStatus> ENDED = EnumSet.of(OrgMemberStatus.LEFT, OrgMemberStatus.REMOVED, OrgMemberStatus.ERASED);

    /** The list parameters after parsing: the controller passes the raw query values and this record is what the service works with. */
    public record ListQuery(String q, List<String> status, Long roleId, Long departmentId, Long teamId, Long managerId, List<String> sort, Integer page, Integer size) {}

    private final OrgMemberRepository members;
    private final OrgMemberDirectoryRepository directory;
    private final OrgMemberOffboardingRepository offboardings;
    private final OrganizationRepository orgs;
    private final UserRepository users;
    private final MemberAccess access;
    private final DataShareService dataShare;
    private final Clock clock;

    @PersistenceContext
    private EntityManager em;

    @Autowired
    public OrgMemberQueryService(
        OrgMemberRepository members,
        OrgMemberDirectoryRepository directory,
        OrgMemberOffboardingRepository offboardings,
        OrganizationRepository orgs,
        UserRepository users,
        MemberAccess access,
        DataShareService dataShare
    ) {
        this(members, directory, offboardings, orgs, users, access, dataShare, Clock.systemUTC());
    }

    OrgMemberQueryService(
        OrgMemberRepository members,
        OrgMemberDirectoryRepository directory,
        OrgMemberOffboardingRepository offboardings,
        OrganizationRepository orgs,
        UserRepository users,
        MemberAccess access,
        DataShareService dataShare,
        Clock clock
    ) {
        this.members = members;
        this.directory = directory;
        this.offboardings = offboardings;
        this.orgs = orgs;
        this.users = users;
        this.access = access;
        this.dataShare = dataShare;
        this.clock = clock;
    }

    // ---- list -----------------------------------------------------------------------------------------------------------------

    @Transactional(readOnly = true)
    public MemberDTO.Page list(OrgMembership me, ListQuery q) {
        PermissionScope view = access.requireViewScope(me);
        Long orgId = me.orgId();
        int page = q.page() == null ? 0 : q.page();
        int size = q.size() == null ? DEFAULT_SIZE : q.size();
        if (page < 0) throw filter("page", "must be 0 or more");
        if (size < 1 || size > MAX_SIZE) throw filter("size", "must be between 1 and " + MAX_SIZE);
        Set<OrgMemberStatus> statuses = parseStatuses(q.status());
        String search = parseSearch(q.q());
        String order = parseSort(q.sort());

        Set<Long> visible = access.visibleIds(me, view);
        if (visible != null && visible.isEmpty()) return new MemberDTO.Page(List.of(), page, size, 0, false);

        Map<String, Object> params = new HashMap<>();
        params.put("orgId", orgId);
        params.put("statuses", statuses);
        StringBuilder from = new StringBuilder(" from OrgMember m left join User u on u.id = m.userId where m.orgId = :orgId and m.status in :statuses");
        if (visible != null) {
            from.append(" and m.id in :visible");
            params.put("visible", visible);
        }
        if (search != null) {
            from.append(
                " and (lower(concat(coalesce(u.firstName, ''), ' ', coalesce(u.lastName, ''))) like :q escape '!' or lower(coalesce(u.email, '')) like :q escape '!'" +
                " or lower(coalesce(m.inviteEmail, '')) like :q escape '!' or lower(coalesce(m.displayLabel, '')) like :q escape '!' or lower(coalesce(m.title, '')) like :q escape '!'" +
                " or exists (select 1 from OrgMemberRole qr, OrgRoleDefinition qd where qr.orgId = m.orgId and qr.memberId = m.id and qr.endsAt is null and qd.id = qr.roleId and lower(qd.name) like :q escape '!')" +
                " or exists (select 1 from OrgGroup qg where qg.orgId = m.orgId and (qg.id = m.departmentGroupId or qg.id = m.teamGroupId or qg.id = m.groupId) and lower(qg.name) like :q escape '!'))"
            );
            params.put("q", "%" + escapeLike(search.toLowerCase(Locale.ROOT)) + "%");
        }
        if (q.roleId() != null) {
            from.append(" and exists (select 1 from OrgMemberRole fr where fr.orgId = m.orgId and fr.memberId = m.id and fr.endsAt is null and fr.roleId = :roleId)");
            params.put("roleId", q.roleId());
        }
        if (q.departmentId() != null) {
            from.append(" and (m.departmentGroupId = :departmentId or (m.departmentGroupId is null and m.groupId = :departmentId))");
            params.put("departmentId", q.departmentId());
        }
        if (q.teamId() != null) {
            from.append(" and (m.teamGroupId = :teamId or (m.teamGroupId is null and m.groupId = :teamId))");
            params.put("teamId", q.teamId());
        }
        if (q.managerId() != null) {
            from.append(" and m.managerMemberId = :managerId");
            params.put("managerId", q.managerId());
        }

        TypedQuery<Long> count = em.createQuery("select count(m)" + from, Long.class);
        params.forEach(count::setParameter);
        long total = count.getSingleResult();
        if (total == 0 || (long) page * size >= total) return new MemberDTO.Page(List.of(), page, size, total, false);

        TypedQuery<OrgMember> rows = em.createQuery("select m" + from + " order by " + order, OrgMember.class);
        params.forEach(rows::setParameter);
        rows.setFirstResult(page * size);
        rows.setMaxResults(size);
        List<OrgMember> seats = rows.getResultList();

        Set<Long> adminIds = adminIds(me);
        View v = loadView(orgId, seats);
        List<MemberDTO.Row> items = new ArrayList<>();
        for (OrgMember seat : seats) items.add(row(v, seat, adminIds == null || adminIds.contains(seat.getId())));
        return new MemberDTO.Page(items, page, size, total, (long) (page + 1) * size < total);
    }

    // ---- tiles ----------------------------------------------------------------------------------------------------------------

    /**
     * The KPI tiles. Current figures count the seats the caller reaches; the "last month" figures are rebuilt from the seats' own timestamps
     * and the audit trail (suspend and reinstate rows, the end of a seat). Where that history does not exist the tile's {@code previous} and
     * deltas are {@code null}: an organization younger than a month has no baseline at all, a seat that ended with no time recorded makes
     * the totals unknowable, and a suspension nobody audited makes the active and suspended figures unknowable.
     */
    @Transactional(readOnly = true)
    public MemberDTO.Counts counts(OrgMembership me) {
        PermissionScope view = access.requireViewScope(me);
        Long orgId = me.orgId();
        Instant now = Instant.now(clock);
        Instant asOf = now.atZone(ZoneOffset.UTC).minusMonths(1).toInstant();
        Set<Long> visible = access.visibleIds(me, view);
        boolean whole = visible == null;

        List<Object[]> facts = directory.findLifeFacts(orgId);
        List<Object[]> timeline = directory.findMemberAuditTimeline(orgId, auditActions());
        Map<Long, String> suspensionAtAsOf = new HashMap<>();
        Map<Long, Instant> endedAudit = new HashMap<>();
        Set<Long> everSuspendedByAudit = new HashSet<>();
        for (Object[] t : timeline) {
            Long id = parseId((String) t[0]);
            if (id == null) continue;
            String action = (String) t[1];
            Instant at = (Instant) t[2];
            if (MemberAuditActions.SUSPENSION_ACTIONS.contains(action)) {
                if ("MEMBER_SUSPEND".equals(action)) everSuspendedByAudit.add(id);
                if (!at.isAfter(asOf)) suspensionAtAsOf.put(id, action);
            } else if (MemberAuditActions.ENDING_ACTIONS.contains(action)) {
                endedAudit.putIfAbsent(id, at);
            }
        }

        long invited = 0, active = 0, suspended = 0;
        long pInvited = 0, pActive = 0, pSuspended = 0;
        boolean endedUnknown = false;
        boolean suspensionUnknown = false;
        Set<Long> departments = new HashSet<>();
        Set<Long> teams = new HashSet<>();
        for (Object[] f : facts) {
            Long id = (Long) f[0];
            if (!whole && !visible.contains(id)) continue;
            OrgMemberStatus status = (OrgMemberStatus) f[1];
            Instant createdAt = (Instant) f[2];
            Instant joinedAt = (Instant) f[3];
            Instant leftAt = (Instant) f[4];
            Long dept = (Long) f[5];
            Long team = (Long) f[6];
            Long legacy = (Long) f[7];
            if (status == OrgMemberStatus.INVITED) invited++;
            else if (status == OrgMemberStatus.ACTIVE) active++;
            else if (status == OrgMemberStatus.SUSPENDED) {
                suspended++;
                if (!everSuspendedByAudit.contains(id)) suspensionUnknown = true;
            }
            if (!whole && (status == OrgMemberStatus.ACTIVE || status == OrgMemberStatus.SUSPENDED || status == OrgMemberStatus.INVITED)) {
                if (dept != null) departments.add(dept);
                if (team != null) teams.add(team);
                if (dept == null && team == null && legacy != null) teams.add(legacy);
            }
            // the same seat one month ago
            if (createdAt != null && createdAt.isAfter(asOf)) continue;
            if (ENDED.contains(status)) {
                Instant ended = leftAt != null ? leftAt : endedAudit.get(id);
                if (ended == null) {
                    endedUnknown = true;
                    continue;
                }
                if (!ended.isAfter(asOf)) continue;
            }
            Instant joined = joinedAt != null ? joinedAt : (status == OrgMemberStatus.INVITED ? null : createdAt);
            if (joined == null || joined.isAfter(asOf)) pInvited++;
            else if ("MEMBER_SUSPEND".equals(suspensionAtAsOf.get(id))) pSuspended++;
            else pActive++;
        }

        Organization org = orgs.findByOrgId(orgId).orElseThrow(OrgNotFoundException::new);
        boolean baseline = org.getCreatedAt() != null && !org.getCreatedAt().isAfter(asOf);
        boolean totalsKnown = baseline && !endedUnknown;
        boolean statesKnown = totalsKnown && !suspensionUnknown;

        MemberDTO.Tile total = MemberDTO.Tile.of(invited + active + suspended, totalsKnown ? pInvited + pActive + pSuspended : null);
        MemberDTO.Tile tInvited = MemberDTO.Tile.of(invited, totalsKnown ? pInvited : null);
        MemberDTO.Tile tActive = MemberDTO.Tile.of(active, statesKnown ? pActive : null);
        MemberDTO.Tile tSuspended = MemberDTO.Tile.of(suspended, statesKnown ? pSuspended : null);

        MemberDTO.Tile tDepartments;
        MemberDTO.Tile tTeams;
        if (whole) {
            long dNow = 0, tNow = 0, dThen = 0, tThen = 0;
            for (Object[] r : directory.countGroupsByKind(orgId)) {
                if (r[0] == OrgGroupKind.DEPARTMENT) dNow = ((Number) r[1]).longValue();
                else if (r[0] == OrgGroupKind.TEAM) tNow = ((Number) r[1]).longValue();
            }
            boolean groupsKnown = baseline && directory.countGroupDeletionsSince(orgId, asOf) == 0;
            if (groupsKnown) {
                for (Object[] r : directory.countGroupsByKindCreatedBefore(orgId, asOf)) {
                    if (r[0] == OrgGroupKind.DEPARTMENT) dThen = ((Number) r[1]).longValue();
                    else if (r[0] == OrgGroupKind.TEAM) tThen = ((Number) r[1]).longValue();
                }
            }
            tDepartments = MemberDTO.Tile.of(dNow, groupsKnown ? dThen : null);
            tTeams = MemberDTO.Tile.of(tNow, groupsKnown ? tThen : null);
        } else {
            tDepartments = MemberDTO.Tile.of(departments.size(), null);
            tTeams = MemberDTO.Tile.of(teams.size(), null);
        }
        return new MemberDTO.Counts(asOf, whole ? PermissionScope.ORG.name() : view.name(), total, tActive, tInvited, tSuspended, tDepartments, tTeams);
    }

    private static List<String> auditActions() {
        List<String> all = new ArrayList<>(MemberAuditActions.SUSPENSION_ACTIONS);
        all.addAll(MemberAuditActions.ENDING_ACTIONS);
        return all;
    }

    // ---- detail ---------------------------------------------------------------------------------------------------------------

    @Transactional(readOnly = true)
    public MemberDTO.Detail detail(OrgMembership me, Long memberId) {
        PermissionScope view = access.requireViewScope(me);
        OrgMember seat = members.findByOrgIdAndId(me.orgId(), memberId).orElseThrow(OrgNotFoundException::new);
        if (seat.getStatus() == OrgMemberStatus.ERASED || !access.covers(me, view, seat.getId())) throw new OrgNotFoundException();
        View v = loadView(me.orgId(), List.of(seat));
        v.extra(directory.findDirectReports(me.orgId(), seat.getId(), List.of(OrgMemberStatus.ACTIVE, OrgMemberStatus.SUSPENDED, OrgMemberStatus.INVITED)));
        boolean full = hasAdminView(me, seat.getId());
        User user = v.user(seat);
        MemberDTO.Row r = row(v, seat, full);

        boolean viewActivity = canViewActivity(me, seat.getId());
        Instant now = Instant.now(clock);
        Optional<OrgMemberOffboarding> pending = full ? offboardings.findPendingByOrgIdAndMemberId(me.orgId(), seat.getId()) : Optional.empty();
        MemberDTO.ScheduledOffboarding scheduled = pending.map(p -> new MemberDTO.ScheduledOffboarding(p.getId(), p.getEffectiveAt(), p.getReason(), p.getCreatedAt())).orElse(null);

        MemberDTO.PersonRef fullTo = null;
        if (full) {
            Optional<DataShareService.ShareView> share = dataShare.viewOf(me.orgId(), seat.getId());
            if (share.isPresent() && share.get().fullToMemberId() != null) {
                fullTo = personRef(v, share.get().fullToMemberId());
            }
        }
        List<MemberDTO.PersonRef> reports = new ArrayList<>();
        if (full) for (OrgMember rep : v.reports) reports.add(new MemberDTO.PersonRef(rep.getId(), v.nameOf(rep), v.avatarOf(rep)));

        return new MemberDTO.Detail(
            seat.getId(), r.name(), r.initials(), r.workEmail(), null, null, null, r.avatarUrl(), r.status(), statusSince(me.orgId(), seat), r.title(), r.roles(),
            r.roles().stream().filter(MemberDTO.RoleRef::primary).map(MemberDTO.RoleRef::key).findFirst().orElse(null), r.department(), r.team(), r.manager(), reports,
            r.joinedAt(), r.lastActiveAt(), seat.getLeftAt(), full ? r.consentScope() : shareScopeOf(me.orgId(), seat.getId()), fullTo, r.invite(), scheduled,
            actions(me, seat, now), viewActivity ? recent(me.orgId(), seat, 8) : List.of(), !full, version(seat, v.rolesOf(seat.getId()))
        );
    }

    /** The weak ETag of a seat: a hash of everything the board lets a caller edit, so any change by anyone makes a held version stale. */
    public static String version(OrgMember seat, List<MemberDTO.RoleRef> roles) {
        StringBuilder sb = new StringBuilder();
        sb.append(seat.getId()).append('|').append(seat.getStatus()).append('|').append(seat.getTitle()).append('|').append(seat.getDepartmentGroupId()).append('|')
            .append(seat.getTeamGroupId()).append('|').append(seat.getManagerMemberId()).append('|').append(seat.getPrimaryRoleId());
        for (MemberDTO.RoleRef r : roles) sb.append('\n').append(r.roleId()).append(r.primary() ? "*" : "");
        try {
            byte[] h = MessageDigest.getInstance("SHA-256").digest(sb.toString().getBytes(StandardCharsets.UTF_8));
            return "W/\"" + HexFormat.of().formatHex(h, 0, 8) + "\"";
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    /** The current version of one seat as the sheet would carry it (what an If-Match must equal). */
    @Transactional(readOnly = true)
    public String currentVersion(Long orgId, OrgMember seat) {
        View v = loadView(orgId, List.of(seat));
        return version(seat, v.rolesOf(seat.getId()));
    }

    // ---- activity -------------------------------------------------------------------------------------------------------------

    /** Audit rows about a member ({@code direction=on}) or done by them ({@code by}); needs the audit key or an HR view, at a scope covering the member. */
    @Transactional(readOnly = true)
    public MemberDTO.ActivityPage activity(OrgMembership me, Long memberId, String direction, Integer pageParam, Integer sizeParam) {
        PermissionScope view = access.requireViewScope(me);
        OrgMember seat = members.findByOrgIdAndId(me.orgId(), memberId).orElseThrow(OrgNotFoundException::new);
        if (seat.getStatus() == OrgMemberStatus.ERASED || !access.covers(me, view, seat.getId()) || !canViewActivity(me, seat.getId())) throw new OrgNotFoundException();
        String dir = direction == null || direction.isBlank() ? "on" : direction.trim().toLowerCase(Locale.ROOT);
        if (!dir.equals("on") && !dir.equals("by")) throw filter("direction", "must be on or by");
        int page = pageParam == null ? 0 : pageParam;
        int size = sizeParam == null ? DEFAULT_SIZE : sizeParam;
        if (page < 0) throw filter("page", "must be 0 or more");
        if (size < 1 || size > MAX_SIZE) throw filter("size", "must be between 1 and " + MAX_SIZE);

        String login = seat.getUserId() == null ? null : users.findById(seat.getUserId()).map(User::getLogin).orElse(null);
        if (dir.equals("by") && login == null) return new MemberDTO.ActivityPage(dir, List.of(), page, size, 0, false);
        String where = dir.equals("on")
            ? "a.orgId = :orgId and a.targetType = 'MEMBER' and a.targetId = :target"
            : "a.orgId = :orgId and a.actorLogin = :login";
        TypedQuery<Long> count = em.createQuery("select count(a) from OrgAuditEvent a where " + where, Long.class);
        TypedQuery<OrgAuditEvent> rows = em.createQuery("select a from OrgAuditEvent a where " + where + " order by a.createdAt desc, a.id desc", OrgAuditEvent.class);
        for (TypedQuery<?> qy : List.of(count, rows)) {
            qy.setParameter("orgId", me.orgId());
            if (dir.equals("on")) qy.setParameter("target", String.valueOf(seat.getId()));
            else qy.setParameter("login", login);
        }
        long total = count.getSingleResult();
        rows.setFirstResult(page * size);
        rows.setMaxResults(size);
        return new MemberDTO.ActivityPage(dir, activityItems(me.orgId(), rows.getResultList()), page, size, total, (long) (page + 1) * size < total);
    }

    private List<MemberDTO.ActivityItem> recent(Long orgId, OrgMember seat, int n) {
        TypedQuery<OrgAuditEvent> rows = em.createQuery(
            "select a from OrgAuditEvent a where a.orgId = :orgId and a.targetType = 'MEMBER' and a.targetId = :target order by a.createdAt desc, a.id desc", OrgAuditEvent.class
        );
        rows.setParameter("orgId", orgId);
        rows.setParameter("target", String.valueOf(seat.getId()));
        rows.setMaxResults(n);
        return activityItems(orgId, rows.getResultList());
    }

    private List<MemberDTO.ActivityItem> activityItems(Long orgId, List<OrgAuditEvent> events) {
        Set<String> logins = new LinkedHashSet<>();
        for (OrgAuditEvent e : events) if (e.getActorLogin() != null) logins.add(e.getActorLogin());
        Map<String, User> byLogin = new HashMap<>();
        if (!logins.isEmpty()) for (User u : users.findAllByLoginIn(logins)) byLogin.put(u.getLogin(), u);
        Map<Long, OrgMember> seatByUser = new HashMap<>();
        if (!byLogin.isEmpty()) {
            for (OrgMember m : directory.findByOrgIdAndUserIdIn(orgId, byLogin.values().stream().map(User::getId).toList())) {
                if (m.getUserId() != null && (m.getStatus() == OrgMemberStatus.ACTIVE || m.getStatus() == OrgMemberStatus.SUSPENDED)) seatByUser.putIfAbsent(m.getUserId(), m);
            }
        }
        List<MemberDTO.ActivityItem> out = new ArrayList<>();
        for (OrgAuditEvent e : events) {
            User u = e.getActorLogin() == null ? null : byLogin.get(e.getActorLogin());
            MemberDTO.PersonRef actor;
            if (u == null) {
                actor = new MemberDTO.PersonRef(null, OrgAuditService.SYSTEM_ACTOR.equals(e.getActorLogin()) ? "System" : "Someone", null);
            } else {
                OrgMember seat = seatByUser.get(u.getId());
                actor = new MemberDTO.PersonRef(seat == null ? null : seat.getId(), personName(u, seat), u.getImageUrl());
            }
            out.add(new MemberDTO.ActivityItem(e.getId(), e.getCreatedAt(), actor, e.getAction(), e.getRisk(), e.getTargetType(), e.getDetails()));
        }
        return out;
    }

    // ---- shared projections ---------------------------------------------------------------------------------------------------

    /** What the caller may do with this one seat; the same rules every write endpoint re-checks. */
    MemberDTO.Actions actions(OrgMembership me, OrgMember seat, Instant now) {
        Long id = seat.getId();
        OrgMemberStatus st = seat.getStatus();
        boolean self = id.equals(me.memberId());
        boolean live = st == OrgMemberStatus.ACTIVE || st == OrgMemberStatus.SUSPENDED || st == OrgMemberStatus.INVITED;
        boolean writable = com.dossier.api.service.ent.authz.OrgStateRules.allows(me.orgStatus(), com.dossier.api.service.ent.authz.AuthzOperation.WRITE, List.of(MemberAccess.KEY_GROUP_SET));
        boolean edit = writable && live && (access.canAct(me, MemberAccess.KEY_GROUP_SET, id) || access.canAct(me, MemberAccess.KEY_MANAGER_SET, id));
        boolean roles = writable && live && !self && access.canAct(me, MemberAccess.KEY_ROLE_SET, id);
        boolean suspend = writable && !self && st == OrgMemberStatus.ACTIVE && access.canAct(me, MemberAccess.KEY_SUSPEND, id);
        boolean reinstate = writable && !self && st == OrgMemberStatus.SUSPENDED && access.canAct(me, MemberAccess.KEY_SUSPEND, id);
        boolean offboard = writable && !self && (st == OrgMemberStatus.ACTIVE || st == OrgMemberStatus.SUSPENDED) && access.canAct(me, MemberAccess.KEY_REMOVE, id);
        return new MemberDTO.Actions(edit, roles, suspend, reinstate, offboard, canViewActivity(me, id));
    }

    private boolean canViewActivity(OrgMembership me, Long targetId) {
        return access.canAct(me, MemberAccess.KEY_AUDIT_VIEW, targetId) || access.canAct(me, "hr.view", targetId);
    }

    /** True when some people-administration key the caller holds covers this seat (the full sheet; otherwise the summary projection). */
    boolean hasAdminView(OrgMembership me, Long seatId) {
        for (String key : MemberAccess.ADMIN_KEYS) if (access.canAct(me, key, seatId)) return true;
        return false;
    }

    /** The seats shown in full, or {@code null} for "all of them". Empty when the caller holds no administration key at all. */
    private Set<Long> adminIds(OrgMembership me) {
        Optional<PermissionScope> admin = access.widest(me, MemberAccess.ADMIN_KEYS);
        if (admin.isEmpty()) return Set.of();
        return access.visibleIds(me, admin.get());
    }

    private Instant statusSince(Long orgId, OrgMember seat) {
        return switch (seat.getStatus()) {
            case SUSPENDED -> Optional.ofNullable(directory.findLatestAuditAt(orgId, String.valueOf(seat.getId()), "MEMBER_SUSPEND")).orElse(seat.getUpdatedAt());
            case LEFT, REMOVED, ERASED -> seat.getLeftAt() != null ? seat.getLeftAt() : seat.getUpdatedAt();
            case INVITED -> seat.getCreatedAt();
            case ACTIVE -> seat.getJoinedAt() != null ? seat.getJoinedAt() : seat.getCreatedAt();
        };
    }

    private String shareScopeOf(Long orgId, Long memberId) {
        ShareScope s = dataShare.scopeOf(orgId, memberId);
        return s == null ? ShareScope.NONE.name() : s.name();
    }

    MemberDTO.Row row(View v, OrgMember seat, boolean full) {
        User u = v.user(seat);
        String name = v.nameOf(seat);
        List<MemberDTO.RoleRef> roles = v.rolesOf(seat.getId());
        MemberDTO.GroupRef dept = v.group(seat.getDepartmentGroupId(), seat.getGroupId(), OrgGroupKind.DEPARTMENT);
        MemberDTO.GroupRef team = v.group(seat.getTeamGroupId(), seat.getGroupId(), OrgGroupKind.TEAM);
        MemberDTO.PersonRef manager = full && seat.getManagerMemberId() != null ? personRef(v, seat.getManagerMemberId()) : null;
        MemberDTO.InviteMeta invite = seat.getStatus() == OrgMemberStatus.INVITED
            ? new MemberDTO.InviteMeta(seat.getInviteExpiresAt(), seat.getInviteExpiresAt() != null && seat.getInviteExpiresAt().isBefore(Instant.now(clock)))
            : null;
        return new MemberDTO.Row(
            seat.getId(), name, initials(name), full ? v.emailOf(seat) : null, v.avatarOf(seat), seat.getStatus().name(), seat.getTitle(), roles, dept, team, manager,
            seat.getJoinedAt(), full ? seat.getLastActiveAt() : null, full ? shareScopeOf(seat.getOrgId(), seat.getId()) : null, full ? invite : null, !full
        );
    }

    private MemberDTO.PersonRef personRef(View v, Long memberId) {
        OrgMember m = v.seatsById.get(memberId);
        if (m == null) {
            List<OrgMember> found = directory.findByOrgIdAndIdIn(v.orgId, List.of(memberId));
            if (found.isEmpty()) return null;
            m = found.get(0);
            v.addUsers(List.of(m));
        }
        if (m.getStatus() == OrgMemberStatus.ERASED) return null;
        return new MemberDTO.PersonRef(m.getId(), v.nameOf(m), v.avatarOf(m));
    }

    // ---- view: the batch loads behind a page of rows --------------------------------------------------------------------------

    /** The users, roles, groups and managers of a set of seats, loaded in a handful of queries rather than per row. */
    View loadView(Long orgId, Collection<OrgMember> seats) {
        View v = new View(orgId);
        for (OrgMember s : seats) v.seatsById.put(s.getId(), s);
        Set<Long> ids = new LinkedHashSet<>(v.seatsById.keySet());
        Set<Long> managerIds = new LinkedHashSet<>();
        Set<Long> groupIds = new LinkedHashSet<>();
        for (OrgMember s : seats) {
            if (s.getManagerMemberId() != null) managerIds.add(s.getManagerMemberId());
            if (s.getDepartmentGroupId() != null) groupIds.add(s.getDepartmentGroupId());
            if (s.getTeamGroupId() != null) groupIds.add(s.getTeamGroupId());
            if (s.getGroupId() != null) groupIds.add(s.getGroupId());
        }
        managerIds.removeAll(ids);
        if (!managerIds.isEmpty()) for (OrgMember m : directory.findByOrgIdAndIdIn(orgId, managerIds)) v.seatsById.put(m.getId(), m);
        v.addUsers(v.seatsById.values());
        if (!ids.isEmpty()) {
            for (Object[] r : directory.findLiveRolesForMembers(orgId, ids)) {
                v.roles.computeIfAbsent((Long) r[0], k -> new ArrayList<>()).add(new MemberDTO.RoleRef((Long) r[1], (String) r[2], (String) r[3], (Boolean) r[4]));
            }
        }
        if (!groupIds.isEmpty()) for (OrgGroup g : directory.findGroupsByOrgIdAndIdIn(orgId, groupIds)) v.groups.put(g.getId(), g);
        for (OrgMember s : seats) {
            if (!v.roles.containsKey(s.getId()) && s.getRole() != null && !s.getRole().isReserved()) {
                // a seat with no role rows yet still reads the legacy enum (the roles flag may be off for this organization)
                v.roles.put(s.getId(), List.of(new MemberDTO.RoleRef(null, s.getRole().name(), pretty(s.getRole()), true)));
            }
        }
        return v;
    }

    /** The loaded data behind a set of rows. */
    final class View {

        final Long orgId;
        final Map<Long, OrgMember> seatsById = new LinkedHashMap<>();
        final Map<Long, User> usersById = new HashMap<>();
        final Map<Long, List<MemberDTO.RoleRef>> roles = new HashMap<>();
        final Map<Long, OrgGroup> groups = new HashMap<>();
        List<OrgMember> reports = List.of();

        View(Long orgId) {
            this.orgId = orgId;
        }

        void extra(List<OrgMember> reportSeats) {
            this.reports = reportSeats;
            addUsers(reportSeats);
        }

        void addUsers(Collection<OrgMember> seats) {
            Set<Long> userIds = new LinkedHashSet<>();
            for (OrgMember s : seats) if (s.getUserId() != null && !usersById.containsKey(s.getUserId())) userIds.add(s.getUserId());
            if (!userIds.isEmpty()) for (User u : users.findAllById(userIds)) usersById.put(u.getId(), u);
        }

        User user(OrgMember seat) {
            return seat.getUserId() == null ? null : usersById.get(seat.getUserId());
        }

        String nameOf(OrgMember seat) {
            return personName(user(seat), seat);
        }

        String emailOf(OrgMember seat) {
            User u = user(seat);
            if (u != null && u.getEmail() != null && !u.getEmail().isBlank()) return u.getEmail();
            return seat.getInviteEmail();
        }

        String avatarOf(OrgMember seat) {
            User u = user(seat);
            return u == null ? null : u.getImageUrl();
        }

        List<MemberDTO.RoleRef> rolesOf(Long seatId) {
            return roles.getOrDefault(seatId, List.of());
        }

        /** The linked group, or the legacy single group when it is of {@code kind} and nothing is linked. */
        MemberDTO.GroupRef group(Long linkedId, Long legacyId, OrgGroupKind kind) {
            Long id = linkedId;
            if (id == null && legacyId != null) {
                OrgGroup legacy = groups.get(legacyId);
                if (legacy != null && legacy.getKind() == kind) id = legacyId;
            }
            if (id == null) return null;
            OrgGroup g = groups.get(id);
            return g == null ? null : new MemberDTO.GroupRef(g.getId(), g.getName());
        }
    }

    // ---- names ----------------------------------------------------------------------------------------------------------------

    /** The name shown for a seat: the account's name, else the label staff gave, else the invited email's local part. Never the login. */
    static String personName(User u, OrgMember seat) {
        if (u != null) {
            String n = ((u.getFirstName() == null ? "" : u.getFirstName().strip()) + " " + (u.getLastName() == null ? "" : u.getLastName().strip())).strip();
            if (!n.isEmpty()) return n;
        }
        if (seat != null && seat.getDisplayLabel() != null && !seat.getDisplayLabel().isBlank()) return seat.getDisplayLabel().strip();
        String email = u != null && u.getEmail() != null && !u.getEmail().isBlank() ? u.getEmail() : seat == null ? null : seat.getInviteEmail();
        if (email != null && !email.isBlank()) return email.contains("@") ? email.substring(0, email.indexOf('@')) : email;
        return seat == null ? "Member" : "Member " + seat.getId();
    }

    static String initials(String name) {
        if (name == null || name.isBlank()) return "?";
        String[] parts = name.strip().split("\\s+");
        String first = parts[0].substring(0, 1);
        String last = parts.length > 1 ? parts[parts.length - 1].substring(0, 1) : parts[0].length() > 1 ? parts[0].substring(1, 2) : "";
        return (first + last).toUpperCase(Locale.ROOT);
    }

    private static String pretty(OrgRole role) {
        String n = role.name().toLowerCase(Locale.ROOT);
        return Character.toUpperCase(n.charAt(0)) + n.substring(1);
    }

    // ---- parsing --------------------------------------------------------------------------------------------------------------

    private static Set<OrgMemberStatus> parseStatuses(List<String> raw) {
        if (raw == null || raw.isEmpty()) return DEFAULT_STATES;
        Set<OrgMemberStatus> out = EnumSet.noneOf(OrgMemberStatus.class);
        for (String s : raw) {
            if (s == null || s.isBlank()) continue;
            for (String part : s.split(",")) {
                OrgMemberStatus st;
                try {
                    st = OrgMemberStatus.valueOf(part.strip().toUpperCase(Locale.ROOT));
                } catch (IllegalArgumentException e) {
                    throw filter("status", "must be one of INVITED, ACTIVE, SUSPENDED, LEFT, REMOVED");
                }
                if (!LISTABLE.contains(st)) throw filter("status", "must be one of INVITED, ACTIVE, SUSPENDED, LEFT, REMOVED");
                out.add(st);
            }
        }
        return out.isEmpty() ? DEFAULT_STATES : out;
    }

    private static String parseSearch(String raw) {
        if (raw == null) return null;
        String q = raw.strip();
        if (q.isEmpty()) return null;
        if (q.length() > 80) throw filter("q", "at most 80 characters");
        if (q.length() < 2) throw filter("q", "at least 2 characters");
        return q;
    }

    /** {@code sort=field,dir} (repeatable); the allow-list is {@link #SORT_FIELDS}; the last tiebreak is always the id. */
    private static String parseSort(List<String> raw) {
        List<String> specs = raw == null || raw.isEmpty() ? List.of("name,asc") : raw;
        StringBuilder out = new StringBuilder();
        Set<String> seen = new HashSet<>();
        for (String spec : specs) {
            if (spec == null || spec.isBlank()) continue;
            String[] p = spec.split(",");
            String field = p[0].strip();
            String dir = p.length > 1 ? p[1].strip().toLowerCase(Locale.ROOT) : "asc";
            if (!SORT_FIELDS.contains(field) || p.length > 2 || (!dir.equals("asc") && !dir.equals("desc"))) {
                throw OrgException.coded(400, CODE_SORT_INVALID, "Sort by one of " + SORT_FIELDS + ", ascending or descending", Map.of("allowed", SORT_FIELDS));
            }
            if (!seen.add(field)) continue;
            String expr = switch (field) {
                case "name" -> "lower(coalesce(nullif(trim(concat(coalesce(u.firstName, ''), ' ', coalesce(u.lastName, ''))), ''), m.displayLabel, m.inviteEmail, ''))";
                case "joined" -> "m.joinedAt";
                case "status" -> "m.status";
                default -> "m.lastActiveAt";
            };
            if (out.length() > 0) out.append(", ");
            out.append(expr).append(' ').append(dir);
        }
        if (out.length() == 0) out.append("lower(coalesce(nullif(trim(concat(coalesce(u.firstName, ''), ' ', coalesce(u.lastName, ''))), ''), m.displayLabel, m.inviteEmail, '')) asc");
        return out.append(", m.id asc").toString();
    }

    private static String escapeLike(String s) {
        return s.replace("!", "!!").replace("%", "!%").replace("_", "!_");
    }

    private static Long parseId(String raw) {
        try {
            return raw == null ? null : Long.valueOf(raw);
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private static OrgException filter(String field, String message) {
        return OrgException.coded(400, CODE_FILTER_INVALID, field + ": " + message, Map.of("field", field));
    }
}
