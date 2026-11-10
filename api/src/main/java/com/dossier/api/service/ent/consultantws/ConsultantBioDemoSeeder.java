package com.dossier.api.service.ent.consultantws;

import com.dossier.api.domain.Bio;
import com.dossier.api.domain.User;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.org.OrgMember;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.BioRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.ent.talent.ConsultantProfileRepository;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.service.ent.EnterpriseDemoSeeder;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The extension fills an application from the person's own profile (the {@code bio} row the personal app and the extension share). A seeded demo
 * consultant has a Career Profile in the workspace but no bio, so "Prepare selected openings" and the drawer's fill had nothing to put on the page
 * ("Your Kiwiply profile is empty"). This gives the walkthrough consultants (Anika Rao, Ben Okafor) a bio built from their consultant contact details:
 * name, email, phone, city and state, plus the two work-authorization answers the stand-in employer page asks. Nothing sensitive (no date of birth,
 * no identity or bank numbers). Idempotent: a bio that already holds anything is left alone.
 */
@Service
public class ConsultantBioDemoSeeder {

    private static final Logger LOG = LoggerFactory.getLogger(ConsultantBioDemoSeeder.class);
    static final Set<String> CONSULTANTS = Set.of(com.dossier.api.service.ent.DemoRoster.anika(), com.dossier.api.service.ent.DemoRoster.ben());

    private final OrganizationRepository orgs;
    private final ConsultantProfileRepository consultants;
    private final OrgMemberRepository members;
    private final UserRepository users;
    private final BioRepository bios;
    private final ObjectMapper json;

    public ConsultantBioDemoSeeder(OrganizationRepository orgs, ConsultantProfileRepository consultants, OrgMemberRepository members, UserRepository users, BioRepository bios, ObjectMapper json) {
        this.orgs = orgs;
        this.consultants = consultants;
        this.members = members;
        this.users = users;
        this.bios = bios;
        this.json = json;
    }

    @Transactional
    public int seed() {
        Organization acme = orgs.findBySlug(EnterpriseDemoSeeder.ACME_SLUG).orElse(null);
        if (acme == null) return 0;
        int made = 0;
        for (ConsultantProfile c : consultants.findByOrgId(acme.getId())) {
            if (c.getMemberId() == null || !CONSULTANTS.contains(c.getDisplayName())) continue;
            OrgMember m = members.findByOrgIdAndId(acme.getId(), c.getMemberId()).orElse(null);
            if (m == null || m.getUserId() == null) continue;
            User u = users.findById(m.getUserId()).orElse(null);
            if (u == null) continue;
            List<Bio> have = bios.findByUserId(u.getId());
            Bio bio = have.isEmpty() ? new Bio() : have.get(0);
            String payload = bio.getPayload() == null ? "" : bio.getPayload().trim();
            if (!payload.isEmpty() && !"{}".equals(payload)) continue;
            try {
                bio.setUser(u);
                bio.setPayload(json.writeValueAsString(payloadFor(c, u)));
                bio.setUpdatedAt(Instant.now());
                bios.save(bio);
                made++;
            } catch (Exception e) {
                LOG.warn("Could not seed the demo bio of {}: {}", c.getDisplayName(), e.toString());
            }
        }
        if (made > 0) LOG.info("Consultant bio demo seeded for {} consultant(s)", made);
        return made;
    }

    /** The fields the extension's fill reads (the same ones video 09 wrote for Cora), from the consultant's own contact details. */
    static Map<String, Object> payloadFor(ConsultantProfile c, User u) {
        String name = c.getDisplayName() == null ? "" : c.getDisplayName().trim();
        int sp = name.indexOf(' ');
        String first = sp < 0 ? name : name.substring(0, sp);
        String last = sp < 0 ? "" : name.substring(sp + 1).trim();
        String email = c.getEmail() != null && !c.getEmail().isBlank() ? c.getEmail() : u.getEmail();
        String location = c.getLocationLabel() == null ? "" : c.getLocationLabel();
        String city = location;
        String state = "";
        int comma = location.indexOf(',');
        if (comma > 0) {
            city = location.substring(0, comma).trim();
            state = location.substring(comma + 1).trim();
        }
        if (city.isBlank()) city = "Austin";
        if (state.isBlank()) state = "TX";
        Map<String, Object> p = new LinkedHashMap<>();
        p.put("firstName", first);
        p.put("lastName", last);
        p.put("email", email == null ? "" : email);
        p.put("phone", c.getPhone() == null || c.getPhone().isBlank() ? "(512) 555-0147" : c.getPhone());
        p.put("city", city);
        p.put("state", state);
        p.put("postalCode", "78701");
        p.put("country", "United States");
        p.put("linkedin", "https://www.linkedin.com/in/" + (first + "-" + last).toLowerCase().replaceAll("[^a-z-]", "") + "-example");
        p.put("website", "");
        p.put("authorizedToWork", "Yes");
        p.put("requireSponsorship", "No");
        return p;
    }
}
