package com.dossier.api.service.ent.mkt.tailor;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dossier.api.domain.Resume;
import com.dossier.api.domain.User;
import com.dossier.api.domain.ent.mkt.MktOpportunity;
import com.dossier.api.domain.ent.talent.ClientRequirement;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.ent.talent.OrgResume;
import com.dossier.api.domain.ent.talent.RequirementSkill;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.domain.org.OrgMember;
import com.dossier.api.repository.ResumeRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.ent.mkt.MktOpportunityRepository;
import com.dossier.api.repository.ent.mkt.MktOpportunityRow;
import com.dossier.api.repository.ent.talent.ClientRequirementRepository;
import com.dossier.api.repository.ent.talent.ConsultantProfileRepository;
import com.dossier.api.repository.ent.talent.OrgResumeRepository;
import com.dossier.api.repository.ent.talent.RequirementSkillRepository;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.service.ResumeDocService;
import com.dossier.api.service.ResumeTailorService;
import com.dossier.api.service.dto.BuiltResumeDTO;
import com.dossier.api.service.dto.ResumeDTO;
import com.dossier.api.service.dto.ResumeDocDTO;
import com.dossier.api.service.ent.authz.AuthorizationService;
import com.dossier.api.service.ent.licenses.OrgLicenseGate;
import com.dossier.api.service.ent.mkt.MktScope;
import com.dossier.api.service.ent.mkt.opportunities.MktOpportunitiesService;
import com.dossier.api.service.entitlement.FeatureKeys;
import com.dossier.api.service.org.OrgAuditService;
import com.dossier.api.service.org.OrgMembership;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

/** Marketer tailoring (MKT-TAILOR-BUILD.md): the gates, the score on a proposal, and saving the kept changes as a new resume chosen for the job. */
class MktTailorServiceTest {

    static final Long ORG = 7L;
    static final Long MATCH = 5L;
    static final Long CONSULTANT = 21L;
    static final Long SEAT = 22L;
    static final Long USER = 23L;
    static final Instant NOW = Instant.parse("2026-11-11T12:00:00Z");
    static final ObjectMapper OM = new ObjectMapper();

    MktScope scope = mock(MktScope.class);
    MktOpportunityRepository opportunities = mock(MktOpportunityRepository.class);
    ConsultantProfileRepository consultants = mock(ConsultantProfileRepository.class);
    OrgMemberRepository members = mock(OrgMemberRepository.class);
    UserRepository users = mock(UserRepository.class);
    OrgResumeRepository orgResumes = mock(OrgResumeRepository.class);
    ResumeRepository resumes = mock(ResumeRepository.class);
    ClientRequirementRepository requirements = mock(ClientRequirementRepository.class);
    RequirementSkillRepository skills = mock(RequirementSkillRepository.class);
    ResumeTailorService tailor = mock(ResumeTailorService.class);
    ResumeDocService docs = mock(ResumeDocService.class);
    OrgLicenseGate licenses = mock(OrgLicenseGate.class);
    MktOpportunitiesService opportunityService = mock(MktOpportunitiesService.class);
    OrgAuditService audit = mock(OrgAuditService.class);
    MktTailorService service = new MktTailorService(scope, mock(AuthorizationService.class), opportunities, consultants, members, users, orgResumes, resumes, requirements, skills, tailor, docs, licenses, opportunityService, audit);

    OrgMembership me = new OrgMembership(ORG, 70L, 700L, "rahul", OrgRole.MARKETER, OrgMemberStatus.ACTIVE, OrgStatus.ACTIVE);
    MktOpportunityRow row;
    User owner;
    Resume resume;
    OrgResume source;

    static final String STRUCTURED = "{\"summary\":\"Backend engineer.\",\"skills\":[\"Java\"],\"experience\":[{\"title\":\"Senior Engineer\",\"company\":\"Acme\",\"bullets\":[\"Built APIs\",\"Cut latency\"]}]}";

    @BeforeEach
    void world() throws Exception {
        MktScope.View view = new MktScope.View(ORG, 70L, true, Set.of());
        lenient().when(scope.resolve(any(), anyString())).thenReturn(view);
        row = row("ASSIGNED");
        lenient().when(opportunities.findRow(ORG, MATCH)).thenAnswer(i -> Optional.of(row));
        lenient().when(opportunities.findByOrgIdAndMatchId(ORG, MATCH)).thenReturn(Optional.of(new MktOpportunity()));
        ConsultantProfile c = new ConsultantProfile();
        c.setId(CONSULTANT);
        c.setOrgId(ORG);
        c.setMemberId(SEAT);
        c.setStatus("ACTIVE");
        c.setDisplayName("Anika Rao");
        lenient().when(consultants.findByOrgIdAndId(ORG, CONSULTANT)).thenReturn(Optional.of(c));
        OrgMember seat = new OrgMember();
        seat.setId(SEAT);
        seat.setOrgId(ORG);
        seat.setUserId(USER);
        seat.setStatus(OrgMemberStatus.ACTIVE);
        lenient().when(members.findByOrgIdAndId(ORG, SEAT)).thenReturn(Optional.of(seat));
        owner = new User();
        owner.setId(USER);
        owner.setLogin("ent#7#anika");
        owner.setOrgId(ORG);
        owner.setActivated(true);
        lenient().when(users.findById(USER)).thenReturn(Optional.of(owner));
        lenient().when(licenses.has(ORG, CONSULTANT, FeatureKeys.AI_RESUME_TAILORING)).thenReturn(true);
        ClientRequirement job = new ClientRequirement();
        job.setId(500L);
        job.setOrgId(ORG);
        job.setTitle("Platform Engineer");
        job.setDescriptionText("We run Java services on Kubernetes with Kafka.");
        lenient().when(requirements.findByOrgIdAndId(ORG, 500L)).thenReturn(Optional.of(job));
        RequirementSkill s1 = new RequirementSkill();
        s1.setSkill("Java");
        RequirementSkill s2 = new RequirementSkill();
        s2.setSkill("Kubernetes");
        lenient().when(skills.findByOrgIdAndRequirementIdIn(eq(ORG), any())).thenReturn(List.of(s1, s2));
        source = new OrgResume();
        source.setId(31L);
        source.setOrgId(ORG);
        source.setConsultantId(CONSULTANT);
        source.setResumeId(900L);
        source.setKind("ORG_MANAGED");
        source.setApprovalStatus("APPROVED");
        source.setName("Anika - Java");
        source.setPrimaryForOrg(true);
        lenient().when(orgResumes.findByOrgIdAndConsultantId(ORG, CONSULTANT)).thenReturn(List.of(source));
        resume = new Resume();
        resume.setId(900L);
        resume.setUser(owner);
        resume.setParsedJson(STRUCTURED);
        lenient().when(resumes.findById(900L)).thenReturn(Optional.of(resume));
    }

    MktOpportunityRow row(String matchStatus) {
        return new MktOpportunityRow(MATCH, CONSULTANT, "Anika Rao", 500L, "Platform Engineer", "Austin", "HYBRID", "OPEN", 3L, "Northbeam", 80, "fits", matchStatus, NOW, NOW, 901L, "NO_RESPONSE", 9L, null, null, null, NOW, 70L, "ASSIGNED");
    }

    ResumeTailorService.Result okResult() {
        ResumeTailorService.Proposal p = new ResumeTailorService.Proposal(77L, 900L, "Anika - Java", List.of(
            new ResumeTailorService.Change("e0b0", "Senior Engineer · Acme", "Built APIs", "Built APIs on Kubernetes"),
            new ResumeTailorService.Change("skills", "Skills (reordered)", "Java", "Java")
        ), List.of("Kafka"));
        return new ResumeTailorService.Result(ResumeTailorService.Status.OK, p, false, 10, 100, NOW);
    }

    @Test
    void aProposalCarriesTheKeywordScoreAndWhatEachChangeAdds() {
        when(tailor.proposeFor(eq(owner), eq(resume), anyString(), eq("Platform Engineer"), eq("Northbeam"))).thenReturn(okResult());
        MktTailorService.Proposal p = service.propose(me, MATCH, null);
        assertThat(p.status()).isEqualTo("OK");
        assertThat(p.source().orgResumeId()).isEqualTo(31L);
        assertThat(p.keywords()).extracting(MktTailorService.Keyword::term).containsExactly("Java", "Kubernetes", "Kafka");
        assertThat(p.scoreBefore()).isEqualTo(33); // Java of three terms
        assertThat(p.changes()).singleElement().satisfies(c -> assertThat(c.adds()).containsExactly("Kubernetes")); // the skills reorder is left out
        assertThat(p.additions()).containsExactly("Kafka");
    }

    @Test
    void withoutTheAddOnOnTheConsultantsLicenceNoAiRuns() {
        when(licenses.has(ORG, CONSULTANT, FeatureKeys.AI_RESUME_TAILORING)).thenReturn(false);
        assertThatThrownBy(() -> service.propose(me, MATCH, null)).hasMessageContaining("licence doesn't include AI resume tailoring");
        verify(tailor, never()).proposeFor(any(), any(), any(), any(), any());
    }

    @Test
    void anUnassignedJobOrAConsultantWithoutAnOrganizationAccountIsRefused() {
        row = row("SUGGESTED");
        assertThatThrownBy(() -> service.propose(me, MATCH, null)).hasMessageContaining("once the job is assigned");
        row = row("ASSIGNED");
        owner.setOrgId(null); // a personal account behind the seat (decision O4)
        assertThatThrownBy(() -> service.propose(me, MATCH, null)).hasMessageContaining("organization account");
        verify(tailor, never()).proposeFor(any(), any(), any(), any(), any());
    }

    @Test
    void savingCopiesTheResumeWritesTheKeptChangesAndChoosesItForTheJob() throws Exception {
        JsonNode stored = OM.readTree("{\"bullets\":[{\"ref\":\"e0b0\",\"text\":\"Built APIs on Kubernetes\"}],\"suggestions\":[\"Kafka\"]}");
        when(tailor.stored(77L, USER)).thenReturn(Optional.of(new ResumeTailorService.StoredProposal(77L, 900L, ResumeTailorService.hashOf(resume), stored)));
        ResumeDTO created = new ResumeDTO();
        created.setId(950L);
        when(docs.createBuilt(any(), eq("Platform Engineer"), eq("Anika - Java - Platform Engineer"), any())).thenReturn(new BuiltResumeDTO(created, null));
        ResumeDocDTO current = new ResumeDocDTO();
        current.setDoc(OM.readTree("""
            {"version":2,"sections":[
              {"id":"s1","kind":"EXPERIENCE","items":[{"id":"r0","title":"Senior Engineer","org":"Acme","bullets":[{"id":"b1","text":"Built APIs"},{"id":"b2","text":"Cut latency"}]}]},
              {"id":"s2","kind":"SKILLS","items":[{"id":"k0","skills":["Java"]}]}]}
            """));
        current.setDocVersion(4);
        when(docs.get(950L)).thenReturn(current);
        OrgResume made = new OrgResume();
        made.setId(40L);
        made.setName("Anika - Java - Platform Engineer");
        when(orgResumes.findFirstByOrgIdAndResumeIdOrderByIdAsc(ORG, 950L)).thenReturn(Optional.of(made));

        MktTailorService.Applied a = service.apply(me, MATCH, 77L, new MktTailorService.ApplyRequest(List.of("e0b0"), List.of("Kafka"), null));

        ArgumentCaptor<JsonNode> body = ArgumentCaptor.forClass(JsonNode.class);
        verify(docs).put(eq(950L), eq("\"4\""), body.capture());
        assertThat(body.getValue().at("/doc/sections/0/items/0/bullets/0/text").asText()).isEqualTo("Built APIs on Kubernetes");
        assertThat(body.getValue().at("/doc/sections/1/items/0/skills").toString()).isEqualTo("[\"Java\",\"Kafka\"]");
        verify(opportunityService).pinResume(me, MATCH, 40L);
        verify(audit).record(eq(me), eq(MktTailorService.AUDIT_TAILOR), any(), eq("ent#7#anika"), eq("40"), anyString());
        assertThat(a.scoreBefore()).isEqualTo(33);
        assertThat(a.scoreAfter()).isEqualTo(100); // Kubernetes from the kept change, Kafka ticked as true
    }

    @Test
    void anAdditionTheAiDidNotSuggestOrAResumeThatChangedIsRefused() throws Exception {
        JsonNode stored = OM.readTree("{\"bullets\":[],\"suggestions\":[\"Kafka\"]}");
        when(tailor.stored(77L, USER)).thenReturn(Optional.of(new ResumeTailorService.StoredProposal(77L, 900L, ResumeTailorService.hashOf(resume), stored)));
        assertThatThrownBy(() -> service.apply(me, MATCH, 77L, new MktTailorService.ApplyRequest(List.of(), List.of("Rust"), null))).hasMessageContaining("only the missing keywords");
        when(tailor.stored(77L, USER)).thenReturn(Optional.of(new ResumeTailorService.StoredProposal(77L, 900L, "stale-hash", stored)));
        assertThatThrownBy(() -> service.apply(me, MATCH, 77L, new MktTailorService.ApplyRequest(List.of("e0b0"), List.of(), null))).hasMessageContaining("changed since");
        verify(docs, never()).createBuilt(any(), any(), any(), any());
    }
}
