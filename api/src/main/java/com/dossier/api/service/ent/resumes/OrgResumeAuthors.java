package com.dossier.api.service.ent.resumes;

import com.dossier.api.domain.Resume;
import com.dossier.api.domain.User;
import com.dossier.api.domain.ent.mkt.MktResumeEvent;
import com.dossier.api.domain.ent.talent.OrgResume;
import com.dossier.api.domain.org.OrgMember;
import com.dossier.api.repository.ResumeRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.ent.mkt.MktResumeEventRepository;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.service.ResumeActors;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * "Modified &lt;time&gt; by &lt;name&gt;" for the organization's resume lists (the consultant's My Resumes, the Resumes board and its drawer): who last
 * changed each row, taken from the NEWER of two records, so every kind of change counts and none is attributed to the wrong person:
 * <ul>
 *   <li>the Resume Builder document behind a linked row ({@code resume.updated_by_login}: the real author of the last write, which is the marketer
 *       while one edits in act-for mode, never the consultant whose account owns the document);</li>
 *   <li>the row's own change log ({@code mkt_resume_event}: created, edited, approved, sent back, made primary, details changed), whose actor is the
 *       organization member who did it. A row with no builder document has only this.</li>
 * </ul>
 * The label is a display name (a marketer reads "Sarah Chen (marketer)"), never the synthetic enterprise login; a row with no record yet has no label.
 */
@Service
public class OrgResumeAuthors {

    private final ResumeRepository resumes;
    private final MktResumeEventRepository events;
    private final OrgMemberRepository members;
    private final UserRepository users;
    private final ResumeActors actors;

    public OrgResumeAuthors(ResumeRepository resumes, MktResumeEventRepository events, OrgMemberRepository members, UserRepository users, ResumeActors actors) {
        this.resumes = resumes;
        this.events = events;
        this.members = members;
        this.users = users;
        this.actors = actors;
    }

    private record Stamp(Instant at, String label) {}

    /** The label of whoever last changed each row, by org_resume id (rows nobody is known to have changed are absent). */
    @Transactional(readOnly = true)
    public Map<Long, String> modifiedBy(Long orgId, Collection<OrgResume> rows) {
        Map<Long, String> out = new HashMap<>();
        if (orgId == null || rows == null || rows.isEmpty()) return out;
        List<Long> ids = rows.stream().map(OrgResume::getId).toList();
        Map<Long, List<MktResumeEvent>> log = new HashMap<>();
        for (MktResumeEvent e : events.forResumes(orgId, ids)) log.computeIfAbsent(e.getResumeId(), k -> new ArrayList<>()).add(e);

        Map<Long, Resume> docs = new HashMap<>();
        List<Long> docIds = rows.stream().map(OrgResume::getResumeId).filter(java.util.Objects::nonNull).toList();
        if (!docIds.isEmpty()) for (Resume r : resumes.findAllById(docIds)) docs.put(r.getId(), r);

        // one name lookup for every login and every acting member
        Set<Long> memberIds = new HashSet<>();
        Set<String> logins = new HashSet<>();
        for (OrgResume r : rows) {
            List<MktResumeEvent> evs = log.getOrDefault(r.getId(), List.of());
            if (!evs.isEmpty() && evs.get(evs.size() - 1).getActorMemberId() != null) memberIds.add(evs.get(evs.size() - 1).getActorMemberId());
            Resume d = r.getResumeId() == null ? null : docs.get(r.getResumeId());
            if (d != null && d.getUpdatedByLogin() != null) logins.add(d.getUpdatedByLogin());
        }
        Map<Long, String> loginOfMember = new HashMap<>();
        if (!memberIds.isEmpty()) {
            List<OrgMember> seats = members.findByOrgIdAndIdIn(orgId, memberIds);
            Map<Long, User> byId = new HashMap<>();
            Set<Long> userIds = new HashSet<>();
            for (OrgMember s : seats) if (s.getUserId() != null) userIds.add(s.getUserId());
            if (!userIds.isEmpty()) for (User u : users.findAllById(userIds)) byId.put(u.getId(), u);
            for (OrgMember s : seats) {
                User u = byId.get(s.getUserId());
                if (u != null) {
                    loginOfMember.put(s.getId(), u.getLogin());
                    logins.add(u.getLogin());
                }
            }
        }
        var labels = actors.resolve(logins);

        for (OrgResume r : rows) {
            Stamp best = null;
            Resume d = r.getResumeId() == null ? null : docs.get(r.getResumeId());
            if (d != null && d.getUpdatedByLogin() != null && d.getUpdatedAt() != null && labels.containsKey(d.getUpdatedByLogin())) {
                best = new Stamp(d.getUpdatedAt(), labels.get(d.getUpdatedByLogin()).label());
            }
            List<MktResumeEvent> evs = log.getOrDefault(r.getId(), List.of());
            if (!evs.isEmpty()) {
                MktResumeEvent last = evs.get(evs.size() - 1);
                String login = last.getActorMemberId() == null ? null : loginOfMember.get(last.getActorMemberId());
                if (login != null && labels.containsKey(login) && (best == null || last.getOccurredAt().isAfter(best.at()))) {
                    best = new Stamp(last.getOccurredAt(), labels.get(login).label());
                }
            }
            if (best != null) out.put(r.getId(), best.label());
        }
        return out;
    }

    /** One row's label, or null. */
    public String modifiedBy(Long orgId, OrgResume row) {
        return modifiedBy(orgId, List.of(row)).get(row.getId());
    }
}
