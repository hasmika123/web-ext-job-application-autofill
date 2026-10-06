package com.dossier.api.service.jobs;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;

/**
 * The three job-board shapes (Phase 13.6a). Fixtures copy the field names and value formats of real
 * responses captured 2026-09-22; the text is made up.
 */
class JobBoardParsersTest {

    private final ObjectMapper om = new ObjectMapper();

    private JsonNode json(String s) throws Exception {
        return om.readTree(s.replace('\'', '"'));
    }

    @Test
    void greenhouseListReadsFirstPublishedAndSkipsPostingsWithoutIt() throws Exception {
        JsonNode root = json(
            "{'jobs':[" +
            "{'id':8172508,'title':' Backend Engineer ','location':{'name':'Remote - US'},'absolute_url':'https://acme.com/jobs?gh_jid=8172508'," +
            "'company_name':'Acme','first_published':'2026-09-21T13:32:53-04:00','updated_at':'2026-09-22T10:00:00-04:00'}," +
            "{'id':1,'title':'Old','location':{'name':'Dublin'},'absolute_url':'https://acme.com/jobs?gh_jid=1','company_name':'Acme'," +
            "'first_published':null,'updated_at':'2026-09-22T10:00:00-04:00'}]," +
            "'meta':{'total':2}}"
        );
        List<FetchedPosting> out = JobBoardParsers.greenhouseList(root, "Seed name");
        assertThat(out).hasSize(1);
        FetchedPosting p = out.get(0);
        assertThat(p.externalId()).isEqualTo("8172508");
        assertThat(p.title()).isEqualTo("Backend Engineer");
        assertThat(p.company()).isEqualTo("Acme");
        assertThat(p.location()).isEqualTo("Remote - US");
        assertThat(p.remote()).isTrue();
        assertThat(p.publishedAt()).isEqualTo(Instant.parse("2026-09-21T17:32:53Z"));
        assertThat(p.description()).isEmpty();
    }

    @Test
    void greenhouseDetailUnescapesItsHtml() throws Exception {
        FetchedPosting listed = JobBoardParsers.greenhouseList(
            json("{'jobs':[{'id':5,'title':'PM','location':{'name':'NYC'},'absolute_url':'https://x/5','company_name':'','first_published':'2026-09-21T00:00:00Z'}]}"),
            "Seed name"
        ).get(0);
        assertThat(listed.company()).isEqualTo("Seed name");
        JsonNode detail = json(
            "{'content':'&lt;h2&gt;&lt;strong&gt;Who we are&lt;/strong&gt;&lt;/h2&gt;\\n&lt;p&gt;We build &amp;amp; ship.&lt;/p&gt;&lt;ul&gt;&lt;li&gt;Java&lt;/li&gt;&lt;li&gt;Kafka&lt;/li&gt;&lt;/ul&gt;'," +
            "'departments':[{'id':1,'name':'Engineering'}]}"
        );
        FetchedPosting p = JobBoardParsers.greenhouseDetail(listed, detail);
        assertThat(p.description()).isEqualTo("Who we are\nWe build & ship.\n• Java\n• Kafka");
        assertThat(p.department()).isEqualTo("Engineering");
    }

    @Test
    void leverReadsEpochMillisListsAndWorkplace() throws Exception {
        JsonNode root = json(
            "[{'id':'ac97','text':'Data Engineer','createdAt':1790000000000," +
            "'categories':{'commitment':'Full-time','location':'London, United Kingdom','team':'Data','allLocations':['London, United Kingdom','Remote (UK)']}," +
            "'workplaceType':'remote','hostedUrl':'https://jobs.lever.co/acme/ac97','applyUrl':'https://jobs.lever.co/acme/ac97/apply'," +
            "'descriptionPlain':'The role\\n\\u00a0\\nBuild pipelines.','lists':[{'text':'What you bring','content':'<li>SQL</li><li>Spark</li>'}]," +
            "'additionalPlain':'Benefits.'}," +
            "{'id':'x','text':'No date','hostedUrl':'https://jobs.lever.co/acme/x'}]"
        );
        List<FetchedPosting> out = JobBoardParsers.lever(root, "Acme");
        assertThat(out).hasSize(1);
        FetchedPosting p = out.get(0);
        assertThat(p.company()).isEqualTo("Acme");
        assertThat(p.location()).isEqualTo("London, United Kingdom; Remote (UK)");
        assertThat(p.workplaceType()).isEqualTo("REMOTE");
        assertThat(p.remote()).isTrue();
        assertThat(p.employmentType()).isEqualTo("Full-time");
        assertThat(p.department()).isEqualTo("Data");
        assertThat(p.applyUrl()).endsWith("/apply");
        assertThat(p.publishedAt()).isEqualTo(Instant.ofEpochMilli(1790000000000L));
        assertThat(p.description()).contains("Build pipelines.").contains("What you bring\n• SQL\n• Spark").endsWith("Benefits.");
    }

    @Test
    void ashbyReadsLocationsAndSkipsUnlistedJobs() throws Exception {
        JsonNode root = json(
            "{'apiVersion':'1','jobs':[" +
            "{'id':'34413f8d','title':' Security Engineer, Cloud','department':'Engineering','employmentType':'FullTime','location':'New York, NY (HQ)'," +
            "'secondaryLocations':[{'location':'Remote (US)'},{'location':'Miami, FL'}],'isRemote':true,'workplaceType':'Hybrid'," +
            "'publishedAt':'2026-09-21T17:12:35.753+00:00','isListed':true,'jobUrl':'https://jobs.ashbyhq.com/acme/34413f8d'," +
            "'applyUrl':'https://jobs.ashbyhq.com/acme/34413f8d/application','descriptionPlain':'About us\\n\\nWe secure things.'}," +
            "{'id':'hidden','title':'Unlisted','publishedAt':'2026-09-21T00:00:00Z','isListed':false,'jobUrl':'https://jobs.ashbyhq.com/acme/hidden'}]}"
        );
        List<FetchedPosting> out = JobBoardParsers.ashby(root, "Acme");
        assertThat(out).hasSize(1);
        FetchedPosting p = out.get(0);
        assertThat(p.title()).isEqualTo("Security Engineer, Cloud");
        assertThat(p.location()).isEqualTo("New York, NY (HQ); Remote (US); Miami, FL");
        assertThat(p.workplaceType()).isEqualTo("HYBRID");
        assertThat(p.remote()).isTrue(); // from "Remote (US)" among its locations, not from isRemote
        assertThat(p.employmentType()).isEqualTo("FullTime");
        assertThat(p.publishedAt()).isEqualTo(Instant.parse("2026-09-21T17:12:35.753Z"));
        assertThat(p.description()).isEqualTo("About us\n\nWe secure things.");
    }

    @Test
    void workplaceSpellingsNormalise() {
        assertThat(JobBoardParsers.workplace("OnSite")).isEqualTo("ONSITE");
        assertThat(JobBoardParsers.workplace("on-site")).isEqualTo("ONSITE");
        assertThat(JobBoardParsers.workplace("Remote")).isEqualTo("REMOTE");
        assertThat(JobBoardParsers.workplace("hybrid")).isEqualTo("HYBRID");
        assertThat(JobBoardParsers.workplace("unspecified")).isNull();
    }

    @Test
    void htmlBecomesReadableText() {
        assertThat(HtmlText.toText("<p>A&nbsp;&mdash;&#8217;s <b>bold</b></p><script>x()</script><br>Next", 100)).isEqualTo("A —’s bold\nNext");
        assertThat(HtmlText.toText("<p>" + "x".repeat(50) + "</p>", 10)).hasSize(10);
        assertThat(HtmlText.toText(null, 10)).isEmpty();
    }
}
