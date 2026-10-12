package com.dossier.api.web.rest;

import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.containsInAnyOrder;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.hasItem;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.assertj.core.api.Assertions.assertThat;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.AppSetting;
import com.dossier.api.domain.Application;
import com.dossier.api.domain.JobPosting;
import com.dossier.api.domain.JobSource;
import com.dossier.api.domain.User;
import com.dossier.api.domain.enumeration.ApplicationStatus;
import com.dossier.api.repository.AppSettingRepository;
import com.dossier.api.repository.ApplicationRepository;
import com.dossier.api.repository.JobFeedbackRepository;
import com.dossier.api.repository.JobPostingRepository;
import com.dossier.api.repository.JobSourceRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.service.ResumeBuilderSettings;
import com.dossier.api.service.jobs.JobSearchText;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Job search over the real schema (E2E-U4.0): MySQL FULLTEXT, the short-word fallback, filters, sort and paging, facets,
 * "try this instead", the cap, hide / save, and that one user's choices never touch another's. InnoDB FULLTEXT only sees
 * COMMITTED rows, so this class does not run inside a rolled-back transaction: it commits its own rows (every company
 * starts with "Zq", and every query filters on that) and removes them afterwards.
 */
@IntegrationTest
@AutoConfigureMockMvc
@WithMockUser(username = "user")
@Transactional(propagation = Propagation.NOT_SUPPORTED)
class JobSearchResourceIT {

    private static final String SEARCH = "/api/jobs/search";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JobPostingRepository postings;

    @Autowired
    private JobSourceRepository sources;

    @Autowired
    private JobFeedbackRepository feedback;

    @Autowired
    private ApplicationRepository applications;

    @Autowired
    private UserRepository users;

    @Autowired
    private AppSettingRepository appSettings;

    @Autowired
    private ResumeBuilderSettings settings;

    private JobSource source;
    private User me;
    private User other;
    private final List<JobPosting> made = new ArrayList<>();
    private JobPosting p1, p2, p3, p4, p5, p6, p7, p8;

    @BeforeEach
    void data() {
        clean();
        me = users.findOneByLogin("user").orElseThrow();
        other = users.findOneByLogin("admin").orElseThrow();
        source = sources.save(new JobSource("greenhouse", "zq-" + UUID.randomUUID().toString().substring(0, 8), "Zq test board", JobSource.ADMIN));
        p1 = make("Senior Product Designer", "Zqlumen Health", "Austin, TX", "HYBRID", "Full-time", 5, "We use Figma, prototyping and accessibility every day.");
        p2 = make("Product Designer", "Zqnorth Labs", "Remote (US)", "REMOTE", "Full-time", 30, "Growth experiments and onboarding.");
        p3 = make("Design Systems Designer", "Zqnorth Labs", "Remote (US)", "REMOTE", "Contract", 60, "Tokens and component libraries.");
        p4 = make("UX Researcher", "Zqatlas Commerce", "Denver, CO", "ONSITE", "Full-time", 20, "Interviews and usability testing.");
        p5 = make("Product Manager", "Zqatlas Commerce", "New York, NY", "HYBRID", "Full-time", 100, "Roadmap and discovery.");
        p6 = make("Engineering Manager, Product", "Zqjuniper Cloud", "Seattle, WA", "ONSITE", "Full-time", 2, "Lead a team of engineers.");
        p7 = make("C++ Engineer", "Zqjuniper Cloud", "Seattle, WA", "ONSITE", "Part-time", 150, "Low latency systems.");
        p8 = make("Design Intern", "Zqjuniper Cloud", "Remote (US)", "REMOTE", "Internship", 10, "Learn with the design team.");
    }

    @AfterEach
    void clean() {
        settings.invalidate();
        for (String key : List.of("jobs.search.maxResults", "jobs.search.relaxBelow")) appSettings.findById(key).ifPresent(appSettings::delete);
        settings.invalidate();
        for (User u : users.findAll()) {
            applications.deleteAll(applications.findByUserId(u.getId()).stream().filter(a -> a.getCompany().startsWith("Zq")).toList());
            feedback.deleteByUser(u.getId());
        }
        for (JobSource s : sources.findAll()) {
            if (s.getCompanyName().equals("Zq test board")) {
                postings.deleteAll(postings.findBySourceId(s.getId()));
                sources.delete(s);
            }
        }
        made.clear();
    }

    private JobPosting make(String title, String company, String location, String workplace, String type, int hoursAgo, String description) {
        JobPosting p = new JobPosting();
        p.setSource(source);
        p.setExternalId(UUID.randomUUID().toString().substring(0, 12));
        p.setTitle(title);
        p.setCompany(company);
        p.setLocation(location);
        p.setWorkplaceType(workplace);
        p.setRemote("REMOTE".equals(workplace));
        p.setEmploymentType(type);
        p.setUrl("https://jobs.example.com/" + p.getExternalId());
        p.setApplyUrl(p.getUrl() + "/apply");
        p.setDescriptionText(description);
        p.setPublishedAt(Instant.now().minus(hoursAgo, ChronoUnit.HOURS));
        p.setDedupKey(UUID.randomUUID().toString().replace("-", ""));
        p.setSearchText(JobSearchText.of(title, company, location, description));
        JobPosting saved = postings.saveAndFlush(p);
        made.add(saved);
        return saved;
    }

    private ResultActions search(String... kv) throws Exception {
        MockHttpServletRequestBuilder b = get(SEARCH).param("company", "Zq");
        for (int i = 0; i + 1 < kv.length; i += 2) b = b.param(kv[i], kv[i + 1]);
        return mockMvc.perform(b);
    }

    private static String t(JobPosting p) {
        return p.getTitle();
    }

    // ---- text ------------------------------------------------------------------------------------------

    @Test
    void wordsMatchByPrefixAndAreAndEd() throws Exception {
        search("q", "design").andExpect(status().isOk()).andExpect(jsonPath("$.items[*].title", containsInAnyOrder(t(p1), t(p2), t(p3), t(p8))));
        search("q", "senior designer").andExpect(jsonPath("$.items[*].title", contains(t(p1))));
        search("q", "zzzznotaword").andExpect(jsonPath("$.total").value(0));
    }

    @Test
    void aQuotedPhraseStaysTogetherAndADashLeavesAWordOut() throws Exception {
        search("q", "\"product designer\"").andExpect(jsonPath("$.items[*].title", containsInAnyOrder(t(p1), t(p2))));
        search("q", "product -manager").andExpect(jsonPath("$.items[*].title", containsInAnyOrder(t(p1), t(p2))));
        search("q", "product -designer").andExpect(jsonPath("$.items[*].title", containsInAnyOrder(t(p5), t(p6))));
    }

    @Test
    void onlyWordsToLeaveOutStillWork() throws Exception {
        search("q", "-manager").andExpect(jsonPath("$.total").value(6));
    }

    @Test
    void shortWordsFallBackToWordStartMatching() throws Exception {
        search("q", "ux").andExpect(jsonPath("$.items[*].title", contains(t(p4))));
        search("q", "c++").andExpect(jsonPath("$.items[*].title", contains(t(p7))));
        // a short word beside an indexed one narrows it
        search("q", "ux researcher").andExpect(jsonPath("$.items[*].title", contains(t(p4))));
    }

    @Test
    void theDescriptionIsSearchedToo() throws Exception {
        search("q", "figma").andExpect(jsonPath("$.items[*].title", contains(t(p1))));
    }

    // ---- filters, sort, paging -------------------------------------------------------------------------

    @Test
    void filtersNarrowTheResults() throws Exception {
        search("remote", "REMOTE").andExpect(jsonPath("$.items[*].title", containsInAnyOrder(t(p2), t(p3), t(p8))));
        search("remote", "HYBRID").andExpect(jsonPath("$.total").value(2));
        search("type", "CONTRACT").andExpect(jsonPath("$.items[*].title", contains(t(p3))));
        search("type", "INTERNSHIP,PART_TIME").andExpect(jsonPath("$.items[*].title", containsInAnyOrder(t(p7), t(p8))));
        search("loc", "austin").andExpect(jsonPath("$.items[*].title", contains(t(p1))));
        search("posted", "1").andExpect(jsonPath("$.items[*].title", containsInAnyOrder(t(p1), t(p4), t(p6), t(p8))));
        mockMvc.perform(get(SEARCH).param("company", "Zqatlas")).andExpect(jsonPath("$.items[*].title", containsInAnyOrder(t(p4), t(p5))));
    }

    @Test
    void newestFirstAndPaging() throws Exception {
        search("sort", "newest").andExpect(jsonPath("$.items[*].title", contains(t(p6), t(p1), t(p8), t(p4), t(p2), t(p3), t(p5), t(p7))));
        search("sort", "newest", "size", "3", "page", "1")
            .andExpect(jsonPath("$.items[*].title", contains(t(p4), t(p2), t(p3))))
            .andExpect(jsonPath("$.total").value(8))
            .andExpect(jsonPath("$.page").value(1))
            .andExpect(jsonPath("$.size").value(3));
    }

    @Test
    void bestMatchWithNoTextIsNewestFirstForSomeoneWithNothingToCompare() throws Exception {
        search().andExpect(jsonPath("$.items[0].title").value(t(p6))).andExpect(jsonPath("$.total").value(8));
    }

    @Test
    void sizeIsClampedAndASortOutsideTheWhitelistIsRefused() throws Exception {
        search("size", "500").andExpect(jsonPath("$.size").value(30)); // jobs.search.maxSize
        search("sort", "salary").andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("SORT_INVALID"));
        search("remote", "sideways").andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.code").value("JOB_SEARCH_INVALID")).andExpect(jsonPath("$.path").value("remote"));
        search("type", "WEEKENDS").andExpect(status().isUnprocessableEntity());
        search("posted", "5").andExpect(status().isUnprocessableEntity());
        search("q", "x".repeat(121)).andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("QUERY_TOO_LONG"));
    }

    @Test
    void theResultCapStopsPagingAndSaysSo() throws Exception {
        for (int i = 0; i < 100; i++) make("Bulk Tester " + i, "Zqbulk Co", "Remote (US)", "REMOTE", "Full-time", 1, "bulk row");
        appSettings.saveAndFlush(new AppSetting("jobs.search.maxResults", "100", "it", Instant.now()));
        settings.invalidate();
        search("size", "20", "page", "4").andExpect(jsonPath("$.items", hasSize(20))).andExpect(jsonPath("$.total").value(100)).andExpect(jsonPath("$.capped").value(true));
        search("size", "20", "page", "5").andExpect(jsonPath("$.items", hasSize(0))).andExpect(jsonPath("$.capped").value(true));
    }

    // ---- facets and "try this instead" ---------------------------------------------------------------

    @Test
    void facetsCountEachChoiceIgnoringItsOwnFilter() throws Exception {
        search()
            .andExpect(jsonPath("$.facets.remote.REMOTE").value(3))
            .andExpect(jsonPath("$.facets.remote.HYBRID").value(2))
            .andExpect(jsonPath("$.facets.remote.ONSITE").value(3))
            .andExpect(jsonPath("$.facets.type.FULL_TIME").value(5))
            .andExpect(jsonPath("$.facets.type.CONTRACT").value(1))
            .andExpect(jsonPath("$.facets.type.PART_TIME").value(1))
            .andExpect(jsonPath("$.facets.type.INTERNSHIP").value(1))
            .andExpect(jsonPath("$.facets.postedBuckets['1']").value(4))
            .andExpect(jsonPath("$.facets.postedBuckets['3']").value(6))
            .andExpect(jsonPath("$.facets.postedBuckets['7']").value(8));
        // with the remote filter on, the remote facet still shows the alternatives; the type facet follows the filter
        search("remote", "REMOTE")
            .andExpect(jsonPath("$.facets.remote.HYBRID").value(2))
            .andExpect(jsonPath("$.facets.type.FULL_TIME").value(1))
            .andExpect(jsonPath("$.facets.type.CONTRACT").value(1));
    }

    @Test
    void fewResultsOfferCheaperSearchesWithTheirCounts() throws Exception {
        search("q", "design", "remote", "ONSITE")
            .andExpect(jsonPath("$.total").value(0))
            .andExpect(jsonPath("$.suggestions[0].label").value("Any workplace"))
            .andExpect(jsonPath("$.suggestions[0].total").value(4))
            .andExpect(jsonPath("$.suggestions[0].params.q").value("design"))
            .andExpect(jsonPath("$.suggestions[0].params.remote").doesNotExist());
        // two words: dropping the last is offered
        search("q", "senior zzzznotaword")
            .andExpect(jsonPath("$.suggestions[?(@.label == 'Search \"senior\"')].total").value(1));
        // plenty of results: nothing to suggest
        search().andExpect(jsonPath("$.suggestions", hasSize(0)));
    }

    // ---- hide and save --------------------------------------------------------------------------------

    @Test
    void aHiddenJobAndAHiddenCompanyNeverShowAgainAndUndoBringsThemBack() throws Exception {
        mockMvc.perform(post("/api/jobs/" + p2.getId() + "/feedback").contentType(MediaType.APPLICATION_JSON).content("{\"signal\":\"HIDE\"}")).andExpect(status().isCreated());
        search().andExpect(jsonPath("$.total").value(7)).andExpect(jsonPath("$.items[*].title", not(hasItem(t(p2)))));
        // hiding twice is the same as once
        mockMvc.perform(post("/api/jobs/" + p2.getId() + "/feedback").contentType(MediaType.APPLICATION_JSON).content("{\"signal\":\"HIDE\"}")).andExpect(status().isCreated());
        mockMvc.perform(delete("/api/jobs/" + p2.getId() + "/feedback/HIDE")).andExpect(status().isNoContent());
        search().andExpect(jsonPath("$.total").value(8));

        mockMvc.perform(post("/api/jobs/" + p6.getId() + "/feedback").contentType(MediaType.APPLICATION_JSON).content("{\"signal\":\"HIDE_COMPANY\"}")).andExpect(status().isCreated());
        search().andExpect(jsonPath("$.total").value(5)); // Zqjuniper Cloud: p6, p7, p8
        mockMvc.perform(delete("/api/jobs/" + p6.getId() + "/feedback/HIDE_COMPANY")).andExpect(status().isNoContent());
        search().andExpect(jsonPath("$.total").value(8));
        mockMvc.perform(post("/api/jobs/" + p1.getId() + "/feedback").contentType(MediaType.APPLICATION_JSON).content("{\"signal\":\"LIKE\"}")).andExpect(status().isUnprocessableEntity());
    }

    @Test
    void savingPutsItOnTheBoardOnceAndMarksItSaved() throws Exception {
        String first = mockMvc.perform(post("/api/jobs/" + p1.getId() + "/save")).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        mockMvc.perform(post("/api/jobs/" + p1.getId() + "/save")).andExpect(status().isOk());
        List<Application> mine = applications.findByUserId(me.getId()).stream().filter(a -> p1.getId().equals(a.getPostingId())).toList();
        assertThat(mine).hasSize(1);
        assertThat(mine.get(0).getStatus()).isEqualTo(ApplicationStatus.SAVED);
        assertThat(mine.get(0).getCompany()).isEqualTo("Zqlumen Health");
        assertThat(first).contains("applicationId");
        search("q", "senior").andExpect(jsonPath("$.items[0].saved").value(true));
        search("q", "intern").andExpect(jsonPath("$.items[0].saved").value(false));
    }

    @Test
    void hidingASavedJobPutsItsApplicationAwayAndSaysWhich() throws Exception {
        mockMvc.perform(post("/api/jobs/" + p1.getId() + "/save")).andExpect(status().isOk());
        Long appId = applications.findByUserId(me.getId()).stream().filter(a -> p1.getId().equals(a.getPostingId())).findFirst().orElseThrow().getId();
        mockMvc
            .perform(post("/api/jobs/" + p1.getId() + "/feedback").contentType(MediaType.APPLICATION_JSON).content("{\"signal\":\"HIDE\"}"))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.archivedApplicationId").value(appId.intValue()));
        assertThat(applications.findById(appId).orElseThrow().getArchived()).isTrue();
    }

    @Test
    void aJobTheUserAlreadyAppliedToDropsOutOfSearch() throws Exception {
        mockMvc.perform(post("/api/jobs/" + p1.getId() + "/save")).andExpect(status().isOk());
        Application a = applications.findByUserId(me.getId()).stream().filter(x -> p1.getId().equals(x.getPostingId())).findFirst().orElseThrow();
        a.setStatus(ApplicationStatus.APPLIED);
        applications.saveAndFlush(a);
        search().andExpect(jsonPath("$.total").value(7)).andExpect(jsonPath("$.items[*].title", not(hasItem(t(p1)))));
    }

    // ---- one posting ---------------------------------------------------------------------------------

    @Test
    void detailCarriesTheDescriptionLinksAndSimilarJobs() throws Exception {
        mockMvc
            .perform(get("/api/jobs/" + p1.getId()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.card.title").value(t(p1)))
            .andExpect(jsonPath("$.card.employmentType").value("FULL_TIME"))
            .andExpect(jsonPath("$.card.remote").value(false))
            .andExpect(jsonPath("$.card.source.platform").value("greenhouse"))
            .andExpect(jsonPath("$.descriptionText").value(p1.getDescriptionText()))
            .andExpect(jsonPath("$.url").value(p1.getUrl()))
            .andExpect(jsonPath("$.companyJobsCount").value(0));
        mockMvc.perform(get("/api/jobs/" + p2.getId())).andExpect(jsonPath("$.companyJobsCount").value(1));
        mockMvc.perform(get("/api/jobs/" + p2.getId())).andExpect(jsonPath("$.similar[*].id", not(hasItem(p2.getId().intValue()))));
        mockMvc.perform(get("/api/jobs/999999999")).andExpect(status().isNotFound());
    }

    @Test
    void aTrackedJobThatWasPurgedIsGoneNotMissing() throws Exception {
        mockMvc.perform(post("/api/jobs/" + p1.getId() + "/save")).andExpect(status().isOk());
        Long id = p1.getId();
        postings.deleteById(id);
        mockMvc.perform(get("/api/jobs/" + id)).andExpect(status().isGone()).andExpect(jsonPath("$.code").value("JOB_GONE"));
    }

    // ---- titles ---------------------------------------------------------------------------------------

    @Test
    void titleSuggestionsStartOrHaveAWordStartingWithWhatWasTyped() throws Exception {
        mockMvc.perform(get("/api/jobs/suggest").param("q", "prod")).andExpect(jsonPath("$", hasItem("Product Designer"))).andExpect(jsonPath("$", hasItem("Engineering Manager, Product")));
        mockMvc.perform(get("/api/jobs/suggest").param("q", "d")).andExpect(jsonPath("$", hasSize(0))); // under jobs.suggest.minChars
        mockMvc.perform(get("/api/jobs/suggest").param("q", "zzzzzz")).andExpect(jsonPath("$", hasSize(0)));
    }

    // ---- who sees what ----------------------------------------------------------------------------------

    @Test
    void oneUsersChoicesNeverChangeAnothersSearch() throws Exception {
        mockMvc.perform(post("/api/jobs/" + p2.getId() + "/feedback").contentType(MediaType.APPLICATION_JSON).content("{\"signal\":\"HIDE\"}")).andExpect(status().isCreated());
        mockMvc.perform(post("/api/jobs/" + p1.getId() + "/save")).andExpect(status().isOk());
        // the other user (an admin account here) sees every job, none of them saved
        mockMvc
            .perform(get(SEARCH).param("company", "Zq").with(user("admin").roles("ADMIN")))
            .andExpect(jsonPath("$.total").value(8))
            .andExpect(jsonPath("$.items[*].saved", not(hasItem(true))));
        // and cannot undo (or even touch) the first user's hide: it is a quiet no-op for them
        mockMvc.perform(delete("/api/jobs/" + p2.getId() + "/feedback/HIDE").with(user("admin").roles("ADMIN"))).andExpect(status().isNoContent());
        search().andExpect(jsonPath("$.total").value(7));
        assertThat(feedback.findByUserId(other.getId())).isEmpty();
    }

    @Test
    void rankingTermsAreForAdminsOnly() throws Exception {
        search("explain", "1").andExpect(jsonPath("$.items[0].explain").doesNotExist());
        mockMvc
            .perform(get(SEARCH).param("company", "Zq").param("explain", "1").with(user("admin").roles("ADMIN")))
            .andExpect(jsonPath("$.items[0].explain.score").exists())
            .andExpect(jsonPath("$.items[0].explain.recency").exists());
    }

    @Test
    @WithUnauthenticatedMockUser
    void signedOutIsRefused() throws Exception {
        mockMvc.perform(get(SEARCH)).andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/jobs/suggest").param("q", "prod")).andExpect(status().isUnauthorized());
        mockMvc.perform(post("/api/jobs/1/save")).andExpect(status().isUnauthorized());
    }
}
