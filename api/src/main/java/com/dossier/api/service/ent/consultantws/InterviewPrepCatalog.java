package com.dossier.api.service.ent.consultantws;

import com.dossier.api.domain.ent.consultantws.CwsPrepSession;
import java.util.List;
import java.util.Optional;

/**
 * The static default content of the Interview Prep page: the four preparation modules, their fixed practice questions and the
 * eight-item "Before Interview Checklist". It lives in code for now; it should move to admin configuration later (everything is
 * admin-configured, CLAUDE.md), at which point only this class is replaced. Question text is copied into a saved session from here, never
 * taken from the client.
 */
public final class InterviewPrepCatalog {

    private InterviewPrepCatalog() {}

    public static final String QUESTION_BANK = "question-bank";
    public static final String TECHNICAL = "technical";
    public static final String COMPANY = "company";
    public static final String BEHAVIORAL = "behavioral";

    public static final String PRACTICE = "PRACTICE";
    public static final String RESEARCH = "RESEARCH";

    public record Q(String id, String text) {}

    public record ModuleDef(String key, String title, String description, String kind, String action, List<String> chips, String titleSuffix, List<Q> questions) {}

    public record CheckDef(String key, String label) {}

    /** Shown for Technical Topics when the consultant has no skills on their profile yet. */
    public static final List<String> DEFAULT_TECHNICAL_CHIPS = List.of("Java", "Spring Boot", "Microservices", "System Design");

    public static final List<ModuleDef> MODULES = List.of(
        new ModuleDef(
            QUESTION_BANK,
            "Job-Specific Question Bank",
            "Practice questions tailored to your target roles, job descriptions, and required skills.",
            CwsPrepSession.QUESTION_BANK,
            PRACTICE,
            List.of("Role-based", "Real interview questions", "Updated weekly"),
            "Question Bank",
            List.of(
                new Q("qb-1", "Walk me through your background and why this role fits it."),
                new Q("qb-2", "Which requirement in the job description are you strongest on? Give a concrete example."),
                new Q("qb-3", "Which requirement is your biggest gap, and how would you close it?"),
                new Q("qb-4", "Describe a project that is most similar to what this role would do."),
                new Q("qb-5", "What would you do in your first 30 days?")
            )
        ),
        new ModuleDef(
            TECHNICAL,
            "Technical Topics",
            "Prepare for technical interviews with curated topics, coding problems, and scenario-based questions.",
            CwsPrepSession.TECHNICAL,
            PRACTICE,
            DEFAULT_TECHNICAL_CHIPS,
            "Tech Questions",
            List.of(
                new Q("tech-1", "Explain how you would design a service that has to handle ten times its current traffic."),
                new Q("tech-2", "Describe how you debug a production issue you cannot reproduce locally."),
                new Q("tech-3", "How do you decide between a monolith and microservices for a new system?"),
                new Q("tech-4", "Walk through how you test and review code before it ships."),
                new Q("tech-5", "Explain a technical trade-off you made and what you gave up.")
            )
        ),
        new ModuleDef(
            COMPANY,
            "Company Research",
            "Learn about target companies, recent news, culture, products, and interview process.",
            CwsPrepSession.COMPANY,
            RESEARCH,
            List.of("Company overview", "Recent news", "Culture & values"),
            "Company Research",
            List.of()
        ),
        new ModuleDef(
            BEHAVIORAL,
            "Behavioral Questions",
            "Practice common behavioral questions using the STAR method and get AI-powered feedback.",
            CwsPrepSession.BEHAVIORAL,
            PRACTICE,
            List.of("Leadership", "Teamwork", "Problem solving", "Adaptability"),
            "Behavioral Practice",
            List.of(
                new Q("beh-1", "Tell me about a time you led without formal authority."),
                new Q("beh-2", "Describe a disagreement with a teammate and how you resolved it."),
                new Q("beh-3", "Tell me about a time you solved a hard problem under a deadline."),
                new Q("beh-4", "Describe a time you had to adapt quickly to a change."),
                new Q("beh-5", "Tell me about a mistake you made and what you learned.")
            )
        )
    );

    public static final List<CheckDef> CHECKLIST = List.of(
        new CheckDef("review-jd", "Review job description and key requirements"),
        new CheckDef("research-company", "Research the company and recent news"),
        new CheckDef("practice-questions", "Practice common and role-specific questions"),
        new CheckDef("star-examples", "Prepare examples using the STAR method"),
        new CheckDef("test-environment", "Test your technical environment (if virtual)"),
        new CheckDef("questions-to-ask", "Prepare thoughtful questions to ask"),
        new CheckDef("confirm-details", "Confirm interview time, location and attendees"),
        new CheckDef("rest", "Get a good night's rest")
    );

    public static Optional<ModuleDef> module(String key) {
        return MODULES.stream().filter(m -> m.key().equals(key)).findFirst();
    }

    public static boolean isCheckKey(String key) {
        return CHECKLIST.stream().anyMatch(c -> c.key().equals(key));
    }

    /** The history kinds a consultant can record (every module's kind). */
    public static boolean isKind(String kind) {
        return MODULES.stream().anyMatch(m -> m.kind().equals(kind));
    }
}
