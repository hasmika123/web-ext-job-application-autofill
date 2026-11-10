package com.dossier.api.service.jobs;

import com.dossier.api.domain.JobPosting;
import com.dossier.api.domain.JobSource;
import com.dossier.api.repository.JobPostingRepository;
import com.dossier.api.repository.JobSourceRepository;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Postings for the demo accounts to search (E2E-U4.0). A local or fresh deployment has not run the nightly board read,
 * so the posting store is empty and the demo's job search would be an empty page. This fills it with a believable set
 * of FICTIONAL postings (made-up companies, {@code example.com} links), only when the store holds no posting from the
 * last {@code keepDays}, and replaces its own set when that goes stale. It never touches a real posting, and its source
 * row is disabled so the nightly read never tries to fetch it. The same service every other posting goes through is
 * used ({@link JobSearchText}, the dedup key), so search behaves exactly as it does on real postings.
 */
@Service
public class DemoJobSeeder {

    private static final Logger LOG = LoggerFactory.getLogger(DemoJobSeeder.class);

    /** The board token of the three demo sources: {@code ats / kiwiply-demo}. */
    public static final String TOKEN = "kiwiply-demo";

    static final int SEEDED_POSTINGS = 54; // config-literal-ok: size of the demo set

    private record Role(String title, String dept, List<String> skills, String type) {}

    private static final List<Role> ROLES = List.of(
        new Role("Product Designer", "Design", List.of("Figma", "prototyping", "user research", "design systems"), "Full-time"),
        new Role("Senior Product Designer", "Design", List.of("Figma", "interaction design", "accessibility", "workshop facilitation"), "Full-time"),
        new Role("Staff Product Designer", "Design", List.of("design strategy", "systems thinking", "mentoring", "Figma"), "Full-time"),
        new Role("Design Systems Designer", "Design", List.of("design tokens", "component libraries", "documentation", "Figma"), "Full-time"),
        new Role("UX Researcher", "Research", List.of("interviewing", "survey design", "synthesis", "usability testing"), "Full-time"),
        new Role("Content Designer", "Design", List.of("UX writing", "information architecture", "content strategy"), "Full-time"),
        new Role("Design Intern", "Design", List.of("Figma", "curiosity", "portfolio"), "Internship"),
        new Role("Frontend Engineer", "Engineering", List.of("TypeScript", "React", "accessibility", "testing"), "Full-time"),
        new Role("Senior Frontend Engineer", "Engineering", List.of("TypeScript", "React", "performance", "design systems"), "Full-time"),
        new Role("Senior Backend Engineer", "Engineering", List.of("Java", "Spring", "MySQL", "distributed systems"), "Full-time"),
        new Role("Full Stack Engineer", "Engineering", List.of("TypeScript", "Node.js", "PostgreSQL", "AWS"), "Full-time"),
        new Role("Platform Engineer", "Engineering", List.of("Kubernetes", "Terraform", "observability", "AWS"), "Full-time"),
        new Role("iOS Engineer", "Engineering", List.of("Swift", "SwiftUI", "testing"), "Full-time"),
        new Role("Machine Learning Engineer", "Data", List.of("Python", "PyTorch", "MLOps", "SQL"), "Full-time"),
        new Role("Data Analyst", "Data", List.of("SQL", "dashboards", "experimentation", "storytelling"), "Full-time"),
        new Role("Product Manager", "Product", List.of("roadmapping", "discovery", "analytics", "stakeholder management"), "Full-time"),
        new Role("Senior Product Manager", "Product", List.of("strategy", "metrics", "leading without authority"), "Full-time"),
        new Role("Technical Writer", "Documentation", List.of("API docs", "Markdown", "editing"), "Contract"),
        new Role("Customer Success Manager", "Customer", List.of("onboarding", "renewals", "empathy", "CRM"), "Full-time"),
        new Role("Support Engineer", "Customer", List.of("debugging", "SQL", "written communication"), "Part-time")
    );

    private static final List<String> COMPANIES = List.of(
        "Lumen Health", "Northwind Labs", "Brightpath Learning", "Cobalt Payments", "Fernhill Mobility", "Atlas Commerce",
        "Juniper Cloud", "Meridian Software", "Pinecone Robotics", "Tidal Analytics", "Sparrow Finance", "Oakline Logistics",
        "Copperleaf Studio", "Vantage Care", "Nimbus Data", "Ridgeline Energy", "Marlowe Games", "Fable and Fern"
    );

    private static final List<String> CITIES = List.of(
        "Austin, TX", "Denver, CO", "New York, NY", "Seattle, WA", "Chicago, IL", "Boston, MA", "San Francisco, CA", "London, UK", "Toronto, Canada"
    );

    private static final String[] WORKPLACE = { "REMOTE", "HYBRID", "ONSITE", "REMOTE", "HYBRID" };
    private static final String[] PLATFORMS = { "greenhouse", "lever", "ashby" };

    private final JobPostingRepository postings;
    private final JobSourceRepository sources;
    private final JobBoardProperties props;
    private final JobSearchDataService searchData;

    public DemoJobSeeder(JobPostingRepository postings, JobSourceRepository sources, JobBoardProperties props, JobSearchDataService searchData) {
        this.postings = postings;
        this.sources = sources;
        this.props = props;
        this.searchData = searchData;
    }

    /** Forget what a demo account hid in search (a demo reset starts the visitor from a clean page). */
    @Transactional
    public void wipeUser(Long userId) {
        searchData.deleteAllForUser(userId);
    }

    /**
     * Make sure there is something to search: nothing happens when the store has a posting published within
     * {@code keepDays}; otherwise the demo set (and only that) is replaced with a fresh one dated relative to now.
     *
     * @return how many postings were added (0 when the store already had live postings)
     */
    @Transactional
    public int seedIfStale() {
        Instant now = Instant.now();
        if (postings.countByPublishedAtAfter(now.minus(Duration.ofDays(props.getKeepDays()))) > 0) return 0;
        List<JobSource> demo = new ArrayList<>();
        for (String platform : PLATFORMS) demo.add(source(platform));
        for (JobSource s : demo) postings.deleteAll(postings.findBySourceId(s.getId())); // the demo's own stale set only

        int added = 0;
        for (int i = 0; i < SEEDED_POSTINGS; i++) {
            Role role = ROLES.get(i % ROLES.size());
            String company = COMPANIES.get((i * 7 + i / ROLES.size()) % COMPANIES.size());
            String workplace = WORKPLACE[(i * 3 + i / ROLES.size()) % WORKPLACE.length];
            String city = CITIES.get((i * 5) % CITIES.size());
            String location = "REMOTE".equals(workplace) ? "Remote (US)" : city;
            JobSource src = demo.get(i % demo.size());
            String key = JobIngestService.dedupKey(company, role.title(), location);
            if (postings.existsByDedupKey(key)) continue;

            JobPosting p = new JobPosting();
            p.setSource(src);
            p.setExternalId("demo-" + (i + 1));
            p.setTitle(role.title());
            p.setCompany(company);
            p.setLocation(location);
            p.setWorkplaceType(workplace);
            p.setRemote("REMOTE".equals(workplace));
            p.setEmploymentType(role.type());
            p.setDepartment(role.dept());
            p.setUrl("https://jobs.example.com/" + company.toLowerCase().replaceAll("[^a-z]+", "-") + "/" + (1000 + i)); // config-literal-ok: demo job id
            p.setApplyUrl(p.getUrl() + "/apply");
            p.setDescriptionText(description(company, role, location, workplace));
            p.setPublishedAt(now.minus(Duration.ofHours(3 + (i * 5L) % 150))); // config-literal-ok: spreads the demo postings over about six days
            p.setDedupKey(key);
            p.setSearchText(JobSearchText.of(p.getTitle(), p.getCompany(), p.getLocation(), p.getDescriptionText()));
            postings.save(p);
            added++;
        }
        LOG.info("Seeded {} demo job postings", added);
        return added;
    }

    private JobSource source(String platform) {
        Optional<JobSource> found = sources.findOneByAtsAndBoardTokenIgnoreCase(platform, TOKEN);
        if (found.isPresent()) return found.get();
        JobSource s = new JobSource(platform, TOKEN, "Demo postings (sample, not read from the web)", JobSource.ADMIN);
        s.setEnabled(false); // the nightly read must never try to fetch a board that does not exist
        return sources.save(s);
    }

    static String description(String company, Role role, String location, String workplace) {
        String where = "REMOTE".equals(workplace) ? "fully remote within the US" : "based in " + location + (workplace.equals("HYBRID") ? " (hybrid, three days in the office)" : " (on-site)");
        return (
            "About the role\n" +
            company + " is hiring a " + role.title() + " for our " + role.dept() + " team. This role is " + where + ". " +
            "You will work with a small, friendly group that ships every week and cares about the people who use what we build.\n\n" +
            "What you will do\n" +
            "- Own a slice of the product from first idea to launch and the follow-up after it.\n" +
            "- Work closely with teammates in " + (role.dept().equals("Engineering") ? "design and product" : "engineering and product") + " and write down what you learn.\n" +
            "- Raise the bar for quality and keep the team's tools and documents tidy.\n\n" +
            "What you bring\n" +
            "- Experience with " + String.join(", ", role.skills()) + ".\n" +
            "- Clear writing and a habit of asking good questions.\n" +
            "- Curiosity about " + company + "'s customers.\n\n" +
            "Benefits\n" +
            "Health, dental and vision cover, a learning budget, flexible hours and paid parental leave. " +
            "This is a demo posting made up for Kiwiply's sample account; it is not a real job."
        );
    }
}
