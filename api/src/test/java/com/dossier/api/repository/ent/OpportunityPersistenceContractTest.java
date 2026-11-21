package com.dossier.api.repository.ent;

import static org.assertj.core.api.Assertions.assertThat;

import com.dossier.api.domain.ent.pipeline.JobOpportunity;
import com.dossier.api.domain.ent.pipeline.OpportunityMatch;
import com.dossier.api.repository.ent.pipeline.JobOpportunityRepository;
import com.dossier.api.repository.ent.pipeline.OpportunityMatchRepository;
import java.io.InputStream;
import java.lang.reflect.Method;
import java.util.List;
import java.util.Set;
import javax.xml.parsers.DocumentBuilderFactory;
import org.junit.jupiter.api.Test;
import org.springframework.data.repository.Repository;
import org.w3c.dom.Document;
import org.w3c.dom.Element;

/**
 * The public persistence contract for the canonical organization matching seam. The integration test proves MySQL behaviour;
 * this fast contract keeps the table names, migration registration and org-first repository boundary visible without Docker.
 */
class OpportunityPersistenceContractTest {

    private static final String CHANGELOG = "/config/liquibase/changelog/20261121030000_ent_opportunity_matching.xml";

    @Test
    void theEntitiesUseTheCanonicalTables() throws Exception {
        assertThat(JobOpportunity.class.getAnnotation(jakarta.persistence.Entity.class)).isNotNull();
        assertThat(JobOpportunity.class.getAnnotation(jakarta.persistence.Table.class).name()).isEqualTo("job_opportunity");
        assertThat(JobOpportunity.class.getDeclaredField("createdByMemberId")).isNotNull();
        assertThat(JobOpportunity.class.getDeclaredField("updatedByMemberId")).isNotNull();
        assertThat(OpportunityMatch.class.getAnnotation(jakarta.persistence.Entity.class)).isNotNull();
        assertThat(OpportunityMatch.class.getAnnotation(jakarta.persistence.Table.class).name()).isEqualTo("opportunity_match");
        assertThat(OpportunityMatch.class.getDeclaredField("createdByMemberId")).isNotNull();
        assertThat(OpportunityMatch.class.getDeclaredField("updatedByMemberId")).isNotNull();
    }

    @Test
    void theRepositoriesAreBareAndOrgFirst() throws Exception {
        assertThat(JobOpportunityRepository.class.getInterfaces()).containsExactly(Repository.class);
        assertThat(OpportunityMatchRepository.class.getInterfaces()).containsExactly(Repository.class);

        for (Class<?> repository : List.of(JobOpportunityRepository.class, OpportunityMatchRepository.class)) {
            for (Method method : repository.getDeclaredMethods()) {
                if (Set.of("save", "saveAndFlush", "flush").contains(method.getName())) continue;
                assertThat(method.getParameters()).as(repository.getSimpleName() + "." + method.getName()).isNotEmpty();
                assertThat(method.getParameters()[0].isNamePresent()).as("compiled with -parameters").isTrue();
                assertThat(method.getParameters()[0].getName()).as(repository.getSimpleName() + "." + method.getName()).isEqualTo("orgId");
            }
        }
    }

    @Test
    void theMigrationIsRegisteredAndHasTheTwoDuplicateGuards() throws Exception {
        Document document;
        try (InputStream in = getClass().getResourceAsStream(CHANGELOG)) {
            assertThat(in).isNotNull();
            document = DocumentBuilderFactory.newInstance().newDocumentBuilder().parse(in);
        }

        assertThat(document.getElementsByTagName("createTable").getLength()).isEqualTo(2);
        assertThat(document.getElementsByTagName("createIndex").getLength()).isGreaterThanOrEqualTo(5);
        assertThat(document.getElementsByTagName("addForeignKeyConstraint").getLength()).isGreaterThanOrEqualTo(7);

        Element opportunity = (Element) document.getElementsByTagName("createTable").item(0);
        Element match = (Element) document.getElementsByTagName("createTable").item(1);
        assertThat(opportunity.getAttribute("tableName")).isEqualTo("job_opportunity");
        assertThat(match.getAttribute("tableName")).isEqualTo("opportunity_match");
        assertThat(document.getElementsByTagName("sql").getLength()).isGreaterThanOrEqualTo(3);
    }
}
