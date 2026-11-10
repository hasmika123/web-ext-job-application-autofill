package com.dossier.api.repository.ent;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;
import javax.xml.parsers.DocumentBuilderFactory;
import org.junit.jupiter.api.Test;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.Node;
import org.w3c.dom.NodeList;

/**
 * The job identity changelog's repair sets: {@code pipeline_application_link} is built by one non-transactional changeSet guarded only by
 * {@code tableExists}, so a database where it stopped half-way would never get the missing pieces. Sets 12 and up each guard ONE piece on its own
 * (MARK_RAN when present), and the raw SQL one carries a rollback.
 */
class Phase1JobIdentityChangelogTest {

    private static List<Element> repairSets() throws Exception {
        try (InputStream in = Phase1JobIdentityChangelogTest.class.getResourceAsStream("/config/liquibase/changelog/20261105010000_phase1_job_identity.xml")) {
            assertThat(in).isNotNull();
            Document doc = DocumentBuilderFactory.newInstance().newDocumentBuilder().parse(in);
            NodeList sets = doc.getElementsByTagName("changeSet");
            List<Element> out = new ArrayList<>();
            for (int i = 0; i < sets.getLength(); i++) {
                Element cs = (Element) sets.item(i);
                String id = cs.getAttribute("id");
                if (id.matches("phase1-job-identity-(1[2-9]|[2-9][0-9])-.*")) out.add(cs);
            }
            return out;
        }
    }

    private static int children(Element cs, String... names) {
        int n = 0;
        for (Node c = cs.getFirstChild(); c != null; c = c.getNextSibling()) {
            if (c instanceof Element e) for (String name : names) if (e.getTagName().equals(name)) n++;
        }
        return n;
    }

    @Test
    void theLinkTableHasOneGuardedRepairSetPerPiece() throws Exception {
        List<Element> sets = repairSets();
        assertThat(sets).hasSize(8);
        for (Element cs : sets) {
            String id = cs.getAttribute("id");
            Element pre = (Element) cs.getElementsByTagName("preConditions").item(0);
            assertThat(pre).as("%s has preconditions", id).isNotNull();
            assertThat(pre.getAttribute("onFail")).as("%s skips when the piece exists", id).isEqualTo("MARK_RAN");
            assertThat(cs.getAttribute("runInTransaction")).as("%s", id).isEqualTo("false");
            assertThat(children(cs, "sql", "addForeignKeyConstraint", "addUniqueConstraint", "createIndex", "createTable")).as("%s does one thing", id).isEqualTo(1);
            assertThat(children(cs, "rollback")).as("%s has a rollback", id).isEqualTo(1);
        }
    }

    @Test
    void everyPieceIsGuardedByItsOwnExistenceCheck() throws Exception {
        for (Element cs : repairSets()) {
            String id = cs.getAttribute("id");
            Element pre = (Element) cs.getElementsByTagName("preConditions").item(0);
            boolean checksItself = pre.getElementsByTagName("columnExists").getLength() > 0
                || pre.getElementsByTagName("foreignKeyConstraintExists").getLength() > 0
                || pre.getElementsByTagName("indexExists").getLength() > 0;
            assertThat(checksItself).as("%s checks for the piece it adds", id).isTrue();
        }
    }
}
