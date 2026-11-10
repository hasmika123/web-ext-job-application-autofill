package com.dossier.api.repository.ent;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.InputStream;
import javax.xml.parsers.DocumentBuilderFactory;
import org.junit.jupiter.api.Test;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.NodeList;

/**
 * The tenancy changelog's hygiene: every changeset that uses raw SQL (which Liquibase can not invert) carries an explicit
 * {@code <rollback>}, and every changeset adds at most one column, so a database that already has one of them still gets
 * the others.
 */
class EntTenancyChangelogTest {

    private static NodeList changeSets() throws Exception {
        try (InputStream in = EntTenancyChangelogTest.class.getResourceAsStream("/config/liquibase/changelog/20261015010000_ent_tenancy.xml")) {
            assertThat(in).isNotNull();
            Document doc = DocumentBuilderFactory.newInstance().newDocumentBuilder().parse(in);
            return doc.getElementsByTagName("changeSet");
        }
    }

    @Test
    void everyRawSqlChangesetHasARollback() throws Exception {
        NodeList sets = changeSets();
        assertThat(sets.getLength()).isGreaterThanOrEqualTo(9);
        for (int i = 0; i < sets.getLength(); i++) {
            Element cs = (Element) sets.item(i);
            boolean raw = cs.getElementsByTagName("sql").getLength() > 0;
            boolean rollback = cs.getElementsByTagName("rollback").getLength() > 0;
            if (raw) assertThat(rollback).as("changeset %s uses raw <sql> and needs a <rollback>", cs.getAttribute("id")).isTrue();
        }
    }

    @Test
    void noChangesetAddsMoreThanOneColumnToATable() throws Exception {
        NodeList sets = changeSets();
        for (int i = 0; i < sets.getLength(); i++) {
            Element cs = (Element) sets.item(i);
            NodeList adds = cs.getElementsByTagName("addColumn");
            for (int j = 0; j < adds.getLength(); j++) {
                int columns = ((Element) adds.item(j)).getElementsByTagName("column").getLength();
                assertThat(columns).as("changeset %s", cs.getAttribute("id")).isEqualTo(1);
            }
        }
    }
}
