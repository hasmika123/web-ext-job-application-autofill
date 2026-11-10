package com.dossier.api.service.ent.mkt.opportunities;

import static com.dossier.api.service.ent.mkt.opportunities.FromExtensionWorld.ME;
import static com.dossier.api.service.ent.mkt.opportunities.FromExtensionWorld.NOW;
import static com.dossier.api.service.ent.mkt.opportunities.FromExtensionWorld.ORG;
import static com.dossier.api.service.ent.mkt.opportunities.FromExtensionWorld.request;
import static com.dossier.api.service.ent.mkt.opportunities.FromExtensionWorld.with;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;

import com.dossier.api.domain.ent.mkt.MktOpportunity;
import com.dossier.api.domain.ent.talent.ClientRequirement;
import com.dossier.api.domain.ent.talent.JobDataEvent;
import com.dossier.api.service.ent.IdempotencyService.Outcome;
import com.dossier.api.service.ent.jobs.UrlKeys;
import com.dossier.api.service.ent.mkt.MktScope;
import com.dossier.api.service.ent.mkt.opportunities.MktFromExtensionDTO.ConsultantResult;
import com.dossier.api.service.ent.mkt.opportunities.MktFromExtensionDTO.Request;
import com.dossier.api.service.ent.mkt.opportunities.MktFromExtensionDTO.Response;
import com.dossier.api.service.org.OrgException;
import com.dossier.api.service.privacy.SensitiveContentException;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/**
 * "Save for consultant" without a database (docs/enterprise-v2/60 section 4): the real identity, assignment, ledger and idempotency code over
 * in-memory repositories ({@link FromExtensionWorld}). The ledger assertions use the world's transaction manager, which keeps ledger rows pending
 * until commit and drops them on rollback.
 */
class MktFromExtensionServiceTest {

    static final String KEY = "0b9d5c1e-1111-4222-8333-444455556666";
    static final String KEY_2 = "0b9d5c1e-1111-4222-8333-444455557777";

    FromExtensionWorld w;

    @BeforeEach
    void wire() {
        w = new FromExtensionWorld();
        w.consultant(10);
        w.consultant(11);
        w.consultant(12);
    }

    Response run(String key, Request r) {
        return w.service.fromExtension(w.me, key, r).body();
    }

    ClientRequirement onlyJob() {
        assertThat(w.world.jobs).hasSize(1);
        return w.world.jobs.values().iterator().next();
    }

    // ---- the happy path --------------------------------------------------------------------------------------------------------

    @Test
    void aNewJobForOneConsultantStoresTheJobTheEmployerTheSkillsAndTheAssignment() {
        Response out = run(KEY, request(List.of(10L)));

        ClientRequirement job = onlyJob();
        assertThat(out.jobId()).isEqualTo(job.getId());
        assertThat(out.existingJob()).isFalse();
        assertThat(out.results()).hasSize(1);
        ConsultantResult r = out.results().get(0);
        assertThat(r.consultantId()).isEqualTo(10L);
        assertThat(r.opportunityId()).isNotNull();
        assertThat(r.existing()).isFalse();
        assertThat(r.reason()).isNull();

        // the employer: found-or-created by name
        assertThat(w.clientStore.values()).extracting(c -> c.getName()).containsExactly("Acme Corp");
        assertThat(job.getClientId()).isEqualTo(w.clientStore.keySet().iterator().next());

        // the job: facts, rates in minor units, identity, provenance, MINIMAL
        assertThat(job.getTitle()).isEqualTo("Senior Java Engineer");
        assertThat(job.getLocation()).isEqualTo("Austin, TX");
        assertThat(job.getWorkMode()).isEqualTo("HYBRID");
        assertThat(job.getEmploymentLabel()).isEqualTo("Contract");
        assertThat(job.getPayLabel()).isEqualTo("$70-80/hr");
        assertThat(job.getRateMinMinor()).isEqualTo(7000L);
        assertThat(job.getRateMaxMinor()).isEqualTo(8000L);
        assertThat(job.getRateUnit()).isEqualTo("HOUR");
        assertThat(job.getStatus()).isEqualTo("OPEN");
        assertThat(job.getSource()).isEqualTo("EXTENSION");
        assertThat(job.getCaptureSource()).isEqualTo("EXTENSION");
        assertThat(job.getCaptureMethod()).isEqualTo("USER_CLICK");
        assertThat(job.getCapturedByMemberId()).isEqualTo(ME);
        assertThat(job.getCapturedAt()).isEqualTo(NOW);
        assertThat(job.getExtensionVersion()).isEqualTo("1.4.2");
        assertThat(job.getDetailLevel()).isEqualTo("MINIMAL");
        assertThat(job.getDetailLevelChangedBy()).isEqualTo(ME);
        assertThat(job.getCapturePayloadHash()).matches("[0-9a-f]{64}");
        assertThat(job.getJobUrl()).isEqualTo("https://boards.greenhouse.io/acme/jobs/4012345");
        assertThat(job.getUrlKeyHash()).isEqualTo(UrlKeys.keyHash("https://boards.greenhouse.io/acme/jobs/4012345", "4012345"));
        assertThat(job.getAtsPlatform()).isEqualTo("greenhouse");
        assertThat(job.getExternalJobId()).isEqualTo("4012345");
        assertThat(job.getPostedOn()).isEqualTo(LocalDate.parse("2026-10-10"));
        // the description is the marketer's own summary, never a posting text
        assertThat(job.getDescriptionText()).isEqualTo("Strong fit: lead with the payments work. Client wants a start by Nov 1.");

        assertThat(w.skillRows).extracting(s -> s.getSkill()).containsExactly("Java", "Spring", "AWS");
        assertThat(w.skillRows).allSatisfy(s -> assertThat(s.getRequirementId()).isEqualTo(job.getId()));

        // the match and the opportunity: ASSIGNED, with the marketer's note, priority and due date; the resume gate is waived for extension jobs
        assertThat(w.world.matchStore.values()).singleElement().satisfies(m -> {
            assertThat(m.getStatus()).isEqualTo("ASSIGNED");
            assertThat(m.getConsultantId()).isEqualTo(10L);
        });
        MktOpportunity opp = w.world.oppStore.values().iterator().next();
        assertThat(opp.getState()).isEqualTo("ASSIGNED");
        assertThat(opp.getMarketerNote()).isEqualTo(job.getDescriptionText());
        assertThat(opp.getPriority()).isEqualTo("HIGH");
        assertThat(opp.getDueOn()).isEqualTo(LocalDate.parse("2026-10-20"));
    }

    @Test
    void theResumeGateIsWaivedBecauseTheJobIsAnExtensionJob() {
        w.world.approved.clear(); // no consultant has an approved resume
        ConsultantResult r = run(KEY, request(List.of(10L))).results().get(0);
        assertThat(r.reason()).isNull();
        assertThat(r.opportunityId()).isNotNull();
    }

    @Test
    void severalConsultantsEachGetTheirOwnOpportunityAndOneLedgerAssignedRow() {
        Response out = run(KEY, request(List.of(10L, 11L, 12L)));
        assertThat(out.results()).extracting(ConsultantResult::consultantId).containsExactly(10L, 11L, 12L);
        assertThat(out.results()).allSatisfy(r -> {
            assertThat(r.existing()).isFalse();
            assertThat(r.reason()).isNull();
        });
        assertThat(out.results()).extracting(ConsultantResult::opportunityId).doesNotContainNull().doesNotHaveDuplicates();
        assertThat(w.world.matchStore).hasSize(3);

        assertThat(w.committed("CAPTURED")).hasSize(1);
        assertThat(w.committed("ASSIGNED")).hasSize(3);
        assertThat(w.committed("ASSIGNED")).extracting(JobDataEvent::getNote).containsExactly("assigned to consultant 10", "assigned to consultant 11", "assigned to consultant 12");
        assertThat(w.pending).isEmpty();
    }

    @Test
    void theCapturedLedgerRowNamesFieldsAndNeverValuesAndIsWrittenWithTheJob() {
        run(KEY, request(List.of(10L)));
        JobDataEvent e = w.committed("CAPTURED").get(0);
        assertThat(e.getRequirementId()).isEqualTo(onlyJob().getId());
        assertThat(e.getOrgId()).isEqualTo(ORG);
        assertThat(e.getActorMemberId()).isEqualTo(ME);
        assertThat(e.getActorKind()).isEqualTo("EXTENSION");
        assertThat(e.getOccurredAt()).isEqualTo(NOW);
        assertThat(e.getDetailLevelAfter()).isEqualTo("MINIMAL");
        assertThat(e.getFields()).isEqualTo("jobUrl,title,company,location,workMode,employmentType,payLabel,payMin,payMax,payPeriod,externalJobId,atsPlatform,postedOn,skills,keyInfo");
        assertThat(e.getFields()).doesNotContain("Senior Java Engineer").doesNotContain("Acme");
        assertThat(e.getSourceRef()).isEqualTo("https://boards.greenhouse.io/acme/jobs/4012345");
        assertThat(e.getRequestId()).matches("[0-9a-f]{32}").isNotEqualTo(KEY);
    }

    @Test
    void oneAuditRowPerCallWithCountsOnly() {
        run(KEY, request(List.of(10L, 11L)));
        org.mockito.Mockito.verify(w.world.audit).record(
            eq(w.me), eq("MARKETER_JOB_CAPTURE"), eq("REQUIREMENT"), org.mockito.ArgumentMatchers.isNull(), eq(String.valueOf(onlyJob().getId())),
            eq("{\"created\":true,\"consultants\":2,\"assigned\":2}")
        );
    }

    // ---- idempotency, existing job, existing opportunity ----------------------------------------------------------------------------

    @Test
    void theSameKeyAndRequestReplaysTheStoredReplyAndWritesNothingTwice() {
        Outcome<Response> first = w.service.fromExtension(w.me, KEY, request(List.of(10L)));
        int ledgerRows = w.committed.size();
        Outcome<Response> second = w.service.fromExtension(w.me, KEY, request(List.of(10L)));

        assertThat(first.replayed()).isFalse();
        assertThat(second.replayed()).isTrue();
        assertThat(second.body()).isEqualTo(first.body());
        assertThat(w.world.jobs).hasSize(1);
        assertThat(w.world.matchStore).hasSize(1);
        assertThat(w.committed).hasSize(ledgerRows);
    }

    @Test
    void theSameKeyWithAnotherRequestIsRefused() {
        run(KEY, request(List.of(10L)));
        assertThatThrownBy(() -> run(KEY, request(List.of(11L)))).isInstanceOfSatisfying(OrgException.class, e -> {
            assertThat(e.getStatus()).isEqualTo(422);
            assertThat(e.getCode()).isEqualTo("IDEMPOTENCY_KEY_REUSED");
        });
    }

    @Test
    void aMissingKeyIs400AndNothingIsWritten() {
        assertThatThrownBy(() -> run(null, request(List.of(10L)))).isInstanceOfSatisfying(OrgException.class, e -> {
            assertThat(e.getStatus()).isEqualTo(400);
            assertThat(e.getCode()).isEqualTo("IDEMPOTENCY_KEY_MISSING");
        });
        assertThat(w.world.jobs).isEmpty();
        assertThat(w.committed).isEmpty();
    }

    @Test
    void theSameJobSavedAgainForAnotherConsultantIsAnExistingJobWithNoSecondCapturedRow() {
        Response first = run(KEY, request(List.of(10L)));
        Response second = run(KEY_2, request(List.of(11L)));

        assertThat(second.jobId()).isEqualTo(first.jobId());
        assertThat(second.existingJob()).isTrue();
        assertThat(second.results().get(0).existing()).isFalse();
        assertThat(w.world.jobs).hasSize(1);
        assertThat(w.committed("CAPTURED")).hasSize(1);
        assertThat(w.committed("ASSIGNED")).hasSize(2);
        assertThat(w.skillRows).hasSize(3); // not added again
    }

    @Test
    void theSameJobFoundByPlatformAndExternalIdWhenTheLinkDiffers() {
        Response first = run(KEY, request(List.of(10L)));
        Request otherLink = with(request(List.of(11L)), b -> {
            b.jobUrl = "https://example.org/careers?gh_jid=4012345&utm=1";
            return b;
        });
        Response second = run(KEY_2, otherLink);
        assertThat(second.jobId()).isEqualTo(first.jobId());
        assertThat(second.existingJob()).isTrue();
    }

    @Test
    void theSameJobForTheSameConsultantAgainIsExistingTrueAndAssignsNothingNew() {
        Response first = run(KEY, request(List.of(10L)));
        Response second = run(KEY_2, request(List.of(10L)));

        ConsultantResult r = second.results().get(0);
        assertThat(r.existing()).isTrue();
        assertThat(r.reason()).isNull();
        assertThat(r.opportunityId()).isEqualTo(first.results().get(0).opportunityId());
        assertThat(w.world.matchStore).hasSize(1);
        assertThat(w.committed("ASSIGNED")).hasSize(1); // the second save changed nothing, so the ledger says nothing
    }

    @Test
    void aDeclinedOpportunityIsReopenedByASecondSave() {
        run(KEY, request(List.of(10L)));
        w.world.oppStore.values().iterator().next().setState("DECLINED");
        ConsultantResult r = run(KEY_2, request(List.of(10L))).results().get(0);
        assertThat(r.existing()).isFalse();
        assertThat(w.world.oppStore.values().iterator().next().getState()).isEqualTo("ASSIGNED");
        assertThat(w.committed("ASSIGNED")).extracting(JobDataEvent::getNote).contains("reassigned to consultant 10");
    }

    // ---- per-consultant results ------------------------------------------------------------------------------------------------

    @Test
    void aConsultantOutsideTheCallersScopeIsReportedNotAWholeCall404() {
        w.view = new MktScope.View(ORG, ME, false, Set.of(10L));
        Response out = run(KEY, request(List.of(10L, 11L)));

        assertThat(out.results().get(0).reason()).isNull();
        assertThat(out.results().get(1)).isEqualTo(new ConsultantResult(11L, null, false, "NOT_IN_SCOPE"));
        assertThat(w.world.matchStore.values()).extracting(m -> m.getConsultantId()).containsExactly(10L);
    }

    @Test
    void anIdThatDoesNotExistLooksLikeOneOutsideTheScope() {
        Response out = run(KEY, request(List.of(10L, 999L)));
        assertThat(out.results().get(1)).isEqualTo(new ConsultantResult(999L, null, false, "NOT_IN_SCOPE"));
    }

    @Test
    void anInactiveConsultantIsReportedAndNothingIsWrittenForThem() {
        w.world.consultant(13, "ACTIVE", "PAUSED");
        w.world.consultant(14, "INACTIVE", "ACTIVE");
        Response out = run(KEY, request(List.of(10L, 13L, 14L)));

        assertThat(out.results().get(0).reason()).isNull();
        assertThat(out.results().get(1)).isEqualTo(new ConsultantResult(13L, null, false, "CONSULTANT_INACTIVE"));
        assertThat(out.results().get(2)).isEqualTo(new ConsultantResult(14L, null, false, "CONSULTANT_INACTIVE"));
        assertThat(w.world.matchStore).hasSize(1);
        assertThat(w.committed("ASSIGNED")).hasSize(1);
    }

    @Test
    void aMatchOfAnotherCaptureSourceKeepsItsResumeGateAndIsReportedPerConsultant() {
        ClientRequirement manual = w.world.job(500, "OPEN", "MANUAL");
        manual.setOrgId(ORG);
        manual.setUrlKeyHash(UrlKeys.keyHash("https://boards.greenhouse.io/acme/jobs/4012345", "4012345"));
        w.world.approved.remove(11L); // 11 has no approved resume, 10 has
        Response out = run(KEY, request(List.of(10L, 11L)));
        assertThat(out.existingJob()).isTrue();
        assertThat(out.results().get(0).reason()).isNull();
        assertThat(out.results().get(1)).isEqualTo(new ConsultantResult(11L, null, false, "RESUME_NOT_APPROVED"));
    }

    @Test
    void aClosedExistingJobIs409AndNothingIsWritten() {
        ClientRequirement closed = w.world.job(500, "CLOSED", "EXTENSION");
        closed.setUrlKeyHash(UrlKeys.keyHash("https://boards.greenhouse.io/acme/jobs/4012345", "4012345"));
        assertThatThrownBy(() -> run(KEY, request(List.of(10L)))).isInstanceOfSatisfying(OrgException.class, e -> {
            assertThat(e.getStatus()).isEqualTo(409);
            assertThat(e.getCode()).isEqualTo("JOB_NOT_OPEN");
        });
        assertThat(w.world.matchStore).isEmpty();
        assertThat(w.committed).isEmpty();
        assertThat(w.rollbacks).isEqualTo(1);
    }

    // ---- the ledger and the transaction ----------------------------------------------------------------------------------------

    @Test
    void aFailureInTheMiddleLeavesEveryCommittedRowWholeAndARetryCompletesTheRest() {
        lenient().when(w.world.consultants.findByOrgIdAndId(eq(ORG), eq(11L))).thenThrow(new IllegalStateException("boom"));

        assertThatThrownBy(() -> run(KEY, request(List.of(10L, 11L)))).isInstanceOf(IllegalStateException.class).hasMessage("boom");

        assertThat(w.rollbacks).isEqualTo(1);
        assertThat(w.commits).isZero();
        assertThat(w.pending).isEmpty();
        assertThat(w.records).isEmpty(); // no stored reply, so the same key can be retried
        // The job commits in its own transaction with its CAPTURED row AND its skills; consultant 10's match, overlay, event and ASSIGNED row commit
        // in theirs. Nothing is half-written: every row that survived has the rows that describe it.
        assertThat(w.committed("CAPTURED")).hasSize(1);
        assertThat(w.skillRows).hasSize(3);
        assertThat(w.committed("ASSIGNED")).hasSize(1);
        assertThat(w.world.matchStore).hasSize(1);
        assertThat(w.world.oppStore).hasSize(1);
        assertThat(w.world.eventKinds()).containsExactly("ASSIGNED");
        assertThat(w.world.matchStore.values().iterator().next().getConsultantId()).isEqualTo(10L);

        org.mockito.Mockito.doReturn(Optional.of(w.world.people.get(11L))).when(w.world.consultants).findByOrgIdAndId(ORG, 11L);
        Response retry = run(KEY, request(List.of(10L, 11L)));
        assertThat(retry.existingJob()).isTrue();
        assertThat(retry.results()).extracting(ConsultantResult::consultantId).containsExactly(10L, 11L);
        assertThat(retry.results().get(0).existing()).isTrue(); // consultant 10 was already assigned: a replay writes nothing for them
        assertThat(retry.results().get(1).existing()).isFalse();
        assertThat(w.committed("CAPTURED")).hasSize(1); // still exactly one
        assertThat(w.skillRows).hasSize(3); // skills are not written again for an existing job
        assertThat(w.committed("ASSIGNED")).hasSize(2); // one per consultant, never two for the same
        assertThat(w.world.matchStore).hasSize(2);
        assertThat(w.world.oppStore).hasSize(2);
        assertThat(w.world.eventKinds()).containsExactly("ASSIGNED", "ASSIGNED");
        assertThat(w.records).hasSize(1);
    }

    @Test
    void aCreatedMatchAndOverlayAlwaysCarryTheirLedgerRowAndEventFromTheirOwnTransaction() {
        run(KEY, request(List.of(10L)));
        // both were written while the nested insert ran, so they never depend on the idempotency transaction
        assertThat(w.committed("ASSIGNED")).hasSize(1);
        assertThat(w.world.eventKinds()).containsExactly("ASSIGNED");
        assertThat(w.pending).isEmpty();
    }

    @Test
    void aClosedJobFoundByTheLinkCreatesNoEmployerRow() {
        ClientRequirement closed = w.world.job(500, "CLOSED", "EXTENSION");
        closed.setUrlKeyHash(UrlKeys.keyHash("https://boards.greenhouse.io/acme/jobs/4012345", "4012345"));
        assertThatThrownBy(() -> run(KEY, request(List.of(10L)))).isInstanceOf(OrgException.class);
        assertThat(w.clientStore).isEmpty();
    }

    @Test
    void aSuccessfulCallWritesItsLedgerRowsInOneCommit() {
        run(KEY, request(List.of(10L, 11L)));
        assertThat(w.rollbacks).isZero();
        assertThat(w.commits).isEqualTo(1);
        assertThat(w.pending).isEmpty();
        assertThat(w.committed).extracting(JobDataEvent::getEventType).containsExactly("CAPTURED", "ASSIGNED", "ASSIGNED");
    }

    @Test
    void theGateComesFirst() {
        lenient().when(w.scope.resolve(org.mockito.ArgumentMatchers.any(), eq("opportunities.manage"))).thenThrow(new com.dossier.api.service.org.OrgNotFoundException());
        assertThatThrownBy(() -> w.service.fromExtension(w.me, KEY, new byte[] { '{', '}' })).isInstanceOf(com.dossier.api.service.org.OrgNotFoundException.class);
        assertThatThrownBy(() -> w.service.fromExtension(w.me, KEY, request(List.of(10L)))).isInstanceOf(com.dossier.api.service.org.OrgNotFoundException.class);
        assertThat(w.world.jobs).isEmpty();
    }

    // ---- validation ------------------------------------------------------------------------------------------------------------

    void assertInvalid(Request r, String field) {
        assertThatThrownBy(() -> run(KEY, r)).isInstanceOfSatisfying(OrgException.class, e -> {
            assertThat(e.getStatus()).isEqualTo(400);
            assertThat(e.getCode()).isEqualTo("VALIDATION");
            assertThat(e.getMessage()).startsWith(field + ":");
        });
        assertThat(w.world.jobs).isEmpty();
        assertThat(w.committed).isEmpty();
    }

    @Test
    void theLinkMustBeHttpsAndAPublicHost() {
        for (String url : List.of("http://boards.greenhouse.io/acme/jobs/1", "ftp://example.com/x", "https://127.0.0.1/job/1", "https://localhost/job/1", "https://10.0.0.5/job/1",
            "https://[::1]/job/1", "javascript:alert(1)", "https://exa mple.com/x", "")) {
            assertInvalid(with(request(List.of(10L)), b -> {
                b.jobUrl = url;
                return b;
            }), "jobUrl");
        }
        assertInvalid(with(request(List.of(10L)), b -> {
            b.jobUrl = null;
            return b;
        }), "jobUrl");
        assertInvalid(with(request(List.of(10L)), b -> {
            b.jobUrl = "https://example.com/" + "a".repeat(1000);
            return b;
        }), "jobUrl");
    }

    @Test
    void theFieldLimitsAreEnforced() {
        assertInvalid(with(request(List.of(10L)), b -> { b.title = " "; return b; }), "title");
        assertInvalid(with(request(List.of(10L)), b -> { b.title = "t".repeat(301); return b; }), "title");
        assertInvalid(with(request(List.of(10L)), b -> { b.company = null; return b; }), "company");
        assertInvalid(with(request(List.of(10L)), b -> { b.company = "c".repeat(201); return b; }), "company");
        assertInvalid(with(request(List.of(10L)), b -> { b.location = "l".repeat(301); return b; }), "location");
        assertInvalid(with(request(List.of(10L)), b -> { b.workMode = "ANYWHERE"; return b; }), "workMode");
        assertInvalid(with(request(List.of(10L)), b -> { b.employmentType = "e".repeat(21); return b; }), "employmentType");
        assertInvalid(with(request(List.of(10L)), b -> { b.payLabel = "p".repeat(81); return b; }), "payLabel");
        assertInvalid(with(request(List.of(10L)), b -> { b.payPeriod = "DAY"; return b; }), "payPeriod");
        assertInvalid(with(request(List.of(10L)), b -> { b.payMin = -1; return b; }), "payMin");
        assertInvalid(with(request(List.of(10L)), b -> { b.payMin = 90; b.payMax = 80; return b; }), "payMax");
        assertInvalid(with(request(List.of(10L)), b -> { b.externalJobId = "x".repeat(201); return b; }), "externalJobId");
        assertInvalid(with(request(List.of(10L)), b -> { b.atsPlatform = "a".repeat(41); return b; }), "atsPlatform");
        assertInvalid(with(request(List.of(10L)), b -> { b.skills = List.of("1", "2", "3", "4", "5", "6", "7", "8", "9"); return b; }), "skills");
        assertInvalid(with(request(List.of(10L)), b -> { b.skills = List.of("s".repeat(61)); return b; }), "skills");
        assertInvalid(with(request(List.of(10L)), b -> { b.keyInfo = null; return b; }), "keyInfo");
        assertInvalid(with(request(List.of(10L)), b -> { b.keyInfo = "k".repeat(1001); return b; }), "keyInfo");
        assertInvalid(with(request(List.of(10L)), b -> { b.priority = "URGENT"; return b; }), "priority");
        assertInvalid(with(request(List.of(10L)), b -> { b.extensionVersion = "v".repeat(21); return b; }), "extensionVersion");
        assertInvalid(request(List.of()), "consultantIds");
        assertInvalid(request(null), "consultantIds");
        assertInvalid(request(java.util.stream.LongStream.rangeClosed(1, 21).boxed().toList()), "consultantIds");
        assertInvalid(request(List.of(-3L)), "consultantIds");
    }

    @Test
    void aMinimalRequestIsAcceptedAndPriorityDefaultsToMedium() {
        Request min = new Request("https://example.com/jobs/77", "Engineer", "Initech", null, null, null, null, null, null, null, null, null, null, null, "Call them first.", null, null, List.of(10L), null);
        Response out = run(KEY, min);
        assertThat(out.results().get(0).reason()).isNull();
        ClientRequirement job = onlyJob();
        assertThat(job.getRateMinMinor()).isNull();
        assertThat(job.getExtensionVersion()).isNull();
        assertThat(w.world.oppStore.values().iterator().next().getPriority()).isEqualTo("MEDIUM");
        assertThat(w.skillRows).isEmpty();
    }

    @Test
    void duplicateSkillsAndConsultantIdsAreFoldedAndTheOptionalTextIsTrimmed() {
        Request r = with(request(List.of(10L, 10L, 11L)), b -> {
            b.skills = List.of("Java", " java ", "Spring");
            b.location = "  Austin, TX ";
            return b;
        });
        Response out = run(KEY, r);
        assertThat(out.results()).hasSize(2);
        assertThat(w.skillRows).extracting(s -> s.getSkill()).containsExactly("Java", "Spring");
        assertThat(onlyJob().getLocation()).isEqualTo("Austin, TX");
    }

    @Test
    void sensitiveTextInAnyFreeTextFieldIs422AndNothingIsWritten() {
        String ssn = "my ssn is 123-45-6789";
        List<Request> bad = List.of(
            with(request(List.of(10L)), b -> { b.keyInfo = ssn; return b; }),
            with(request(List.of(10L)), b -> { b.title = ssn; return b; }),
            with(request(List.of(10L)), b -> { b.company = ssn; return b; }),
            with(request(List.of(10L)), b -> { b.location = ssn; return b; }),
            with(request(List.of(10L)), b -> { b.payLabel = ssn; return b; }),
            with(request(List.of(10L)), b -> { b.skills = List.of("Java", ssn); return b; })
        );
        for (Request r : bad) {
            assertThatThrownBy(() -> run(KEY, r)).isInstanceOfSatisfying(SensitiveContentException.class, e -> {
                assertThat(e.getStatus()).isEqualTo(422);
                assertThat(e.getCode()).isEqualTo("SENSITIVE_CONTENT");
            });
        }
        assertThat(w.world.jobs).isEmpty();
        assertThat(w.clientStore).isEmpty();
        assertThat(w.committed).isEmpty();
    }

    // ---- the hash ---------------------------------------------------------------------------------------------------------------

    @Test
    void thePayloadHashIsOfTheCanonicalJsonOfTheFieldsReceived() throws Exception {
        Request r = new Request("https://example.com/jobs/77", "Engineer", "Initech", null, null, null, null, null, null, null, null, null, null, null, "Note", null, null, List.of(10L, 11L), null);
        String canonical = "{\"company\":\"Initech\",\"consultantIds\":[10,11],\"jobUrl\":\"https://example.com/jobs/77\",\"keyInfo\":\"Note\",\"title\":\"Engineer\"}";
        String expected = java.util.HexFormat.of().formatHex(java.security.MessageDigest.getInstance("SHA-256").digest(canonical.getBytes(java.nio.charset.StandardCharsets.UTF_8)));
        assertThat(MktFromExtensionDTO.payloadHash(r)).isEqualTo(expected);
        run(KEY, r);
        assertThat(onlyJob().getCapturePayloadHash()).isEqualTo(expected);
    }

    @Test
    void thePayloadHashDoesNotDependOnTheOrderOfTheKeysTheClientSent() {
        String a = "{\"jobUrl\":\"https://example.com/jobs/77\",\"title\":\"Engineer\",\"company\":\"Initech\",\"keyInfo\":\"Note\",\"consultantIds\":[10]}";
        String b = "{\"consultantIds\":[10],\"keyInfo\":\"Note\",\"company\":\"Initech\",\"title\":\"Engineer\",\"jobUrl\":\"https://example.com/jobs/77\", \"location\": null}";
        assertThat(MktFromExtensionDTO.payloadHash(MktFromExtensionDTO.parse(a.getBytes()))).isEqualTo(MktFromExtensionDTO.payloadHash(MktFromExtensionDTO.parse(b.getBytes())));
    }

    @Test
    void anyChangedFieldChangesTheHash() {
        Request base = request(List.of(10L));
        String h = MktFromExtensionDTO.payloadHash(base);
        assertThat(MktFromExtensionDTO.payloadHash(with(base, b -> { b.title = "Other"; return b; }))).isNotEqualTo(h);
        assertThat(MktFromExtensionDTO.payloadHash(with(base, b -> { b.skills = List.of("Java"); return b; }))).isNotEqualTo(h);
        assertThat(MktFromExtensionDTO.payloadHash(with(base, b -> { b.consultantIds = List.of(11L); return b; }))).isNotEqualTo(h);
        assertThat(MktFromExtensionDTO.payloadHash(base)).isEqualTo(h);
    }

    // ---- no network ---------------------------------------------------------------------------------------------------------------

    @Test
    void theFromExtensionPathHasNoHttpClient() throws Exception {
        List<Class<?>> path = List.of(
            MktFromExtensionService.class, MktFromExtensionDTO.class, com.dossier.api.service.ent.jobs.JobIdentityService.class, com.dossier.api.service.ent.jobs.JobIdentityTx.class,
            com.dossier.api.service.ent.jobs.OpportunityAssignmentService.class, UrlKeys.class, com.dossier.api.service.ent.jobs.JobDataLedger.class,
            com.dossier.api.service.ent.jobs.IdempotentCreate.class, com.dossier.api.web.rest.ent.mkt.MktFromExtensionResource.class
        );
        List<String> forbidden = List.of(
            "java/net/http", "HttpClient", "RestTemplate", "RestClient", "WebClient", "HttpURLConnection", "URLConnection", "okhttp", "apache/http", "org/apache/hc", "feign",
            "Socket", "openStream", "openConnection"
        );
        for (Class<?> c : path) {
            String res = "/" + c.getName().replace('.', '/') + ".class";
            byte[] bytes;
            try (java.io.InputStream in = c.getResourceAsStream(res)) {
                bytes = in.readAllBytes();
            }
            String pool = new String(bytes, java.nio.charset.StandardCharsets.ISO_8859_1);
            for (String f : forbidden) assertThat(pool).as("%s must not reference %s", c.getSimpleName(), f).doesNotContain(f);
        }
        // and none of the service's collaborators is a client of any kind
        for (java.lang.reflect.Field f : MktFromExtensionService.class.getDeclaredFields()) {
            assertThat(f.getType().getName().toLowerCase()).as(f.getName()).doesNotContain("http").doesNotContain("client").doesNotContain("rest");
        }
    }

    @Test
    void theRequestHasNoFieldForStateAppliedAtOrADescription() {
        assertThat(java.util.Arrays.stream(Request.class.getRecordComponents()).map(java.lang.reflect.RecordComponent::getName).toList())
            .containsExactlyElementsOf(MktFromExtensionDTO.FIELDS)
            .doesNotContain("state", "appliedAt", "jobDescription", "description", "descriptionText");
    }
}
