package com.dossier.api.service.ent.clients;

import com.dossier.api.domain.ent.talent.ClientAccount;
import com.dossier.api.domain.ent.talent.ClientContact;
import com.dossier.api.domain.ent.talent.ClientNote;
import com.dossier.api.domain.ent.talent.ClientRequirement;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.ent.talent.MarketerCapacity;
import com.dossier.api.domain.ent.talent.TalentPlacement;
import com.dossier.api.repository.ent.talent.ClientAccountRepository;
import com.dossier.api.repository.ent.talent.ClientContactRepository;
import com.dossier.api.repository.ent.talent.ClientNoteRepository;
import com.dossier.api.repository.ent.talent.ClientRequirementRepository;
import com.dossier.api.repository.ent.talent.ConsultantProfileRepository;
import com.dossier.api.repository.ent.talent.MarketerCapacityRepository;
import com.dossier.api.repository.ent.talent.TalentPlacementRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.service.ent.EnterpriseDemoSeeder;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Random;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

/**
 * Demo data for the Clients page, on top of the talent foundation's eight (Acme) and three (Beta) clients: profile facts (location, size
 * band, client-since, an about line) for the clients that have none, relationship notes, and a longer client list (24 for Acme, 6 for Beta)
 * with contacts, requirements and ended placements, so the directory pages, the health badges (healthy, neutral, at risk) and the
 * "new this month" tile have something to show. Same switches as the other demo seeders (the caller checks them); idempotent: a client
 * that has a size band is left alone, clients are added only up to the target count. Names are invented, addresses are on example.com,
 * and nothing here is a phone, birth date, document or bank number.
 */
@Service
public class ClientsDemoSeeder {

    private static final Logger LOG = LoggerFactory.getLogger(ClientsDemoSeeder.class);

    record Profile(String city, String size, String about) {}

    private static final Map<String, Profile> KNOWN = Map.ofEntries(
        Map.entry("TechCorp", new Profile("San Francisco, CA", "1000-5000", "TechCorp is a leading technology company focused on cloud infrastructure, AI and enterprise software solutions.")),
        Map.entry("Global Media", new Profile("New York, NY", "201-1000", "Global Media produces news, streaming and advertising products for audiences in more than forty countries.")),
        Map.entry("FinTech Solutions", new Profile("Charlotte, NC", "201-1000", "FinTech Solutions builds payments and lending platforms for regional banks and credit unions.")),
        Map.entry("HealthPlus", new Profile("Boston, MA", "1000-5000", "HealthPlus runs a network of clinics and the software that connects patients, doctors and insurers.")),
        Map.entry("InnovateLab", new Profile("Austin, TX", "51-200", "InnovateLab is a product studio working on applied machine learning for logistics and retail.")),
        Map.entry("RetailCo", new Profile("Chicago, IL", "5000+", "RetailCo operates stores and an online marketplace, and hires seasonally across operations and data teams.")),
        Map.entry("ACME Internal", new Profile("Denver, CO", "51-200", "Our own staffing practice: roles we fill for internal teams and partner agencies.")),
        Map.entry("Northwind Logistics", new Profile("Seattle, WA", "1000-5000", "Northwind Logistics moves freight by road, rail and sea, and is modernising its planning and tracking systems.")),
        Map.entry("Lumina Retail", new Profile("Portland, OR", "201-1000", "Lumina Retail is a home and lifestyle retailer with forty stores and a fast-growing online shop.")),
        Map.entry("Orchid Health", new Profile("Raleigh, NC", "51-200", "Orchid Health provides virtual care and clinical analytics to employers.")),
        Map.entry("Vertex Capital", new Profile("New York, NY", "201-1000", "Vertex Capital is an investment firm with a technology and risk practice that hires on contract."))
    );

    record Extra(String name, String industry, String domain, String city, String size, String about) {}

    private static final List<Extra> ACME_EXTRA = List.of(
        new Extra("Global Finance Co.", "Financial Services", "globalfinance.example.com", "New York, NY", "1000-5000", "Global Finance Co. offers corporate banking, treasury and trade finance across three continents."),
        new Extra("Retail Solutions", "Retail & E-commerce", "retailsolutions.example.com", "Dallas, TX", "201-1000", "Retail Solutions builds point-of-sale and fulfilment software for mid-size retailers."),
        new Extra("BuildRight Corp.", "Construction", "buildright.example.com", "Phoenix, AZ", "1000-5000", "BuildRight Corp. delivers commercial construction projects and runs its own project-controls team."),
        new Extra("EduNext", "Education", "edunext.example.com", "Boston, MA", "51-200", "EduNext makes learning platforms for universities and corporate training teams."),
        new Extra("GreenEnergy Ltd.", "Energy & Utilities", "greenenergy.example.com", "Denver, CO", "201-1000", "GreenEnergy Ltd. develops solar and storage projects and the grid software that manages them."),
        new Extra("MediaWorks", "Media & Advertising", "mediaworks.example.com", "Los Angeles, CA", "51-200", "MediaWorks is an advertising and content agency with a growing data and analytics group."),
        new Extra("Foodies Group", "Food & Beverage", "foodiesgroup.example.com", "Atlanta, GA", "1000-5000", "Foodies Group runs restaurant brands and a meal-delivery business."),
        new Extra("Pinecrest Insurance", "Insurance", "pinecrest.example.com", "Philadelphia, PA", "1000-5000", "Pinecrest Insurance sells home and auto cover and is replacing its claims platform."),
        new Extra("Orbit Telecom", "Telecommunications", "orbittelecom.example.com", "Dallas, TX", "5000+", "Orbit Telecom operates mobile and broadband networks and a large customer-care operation."),
        new Extra("Skyline Aerospace", "Aerospace", "skylineaero.example.com", "Seattle, WA", "1000-5000", "Skyline Aerospace designs avionics and maintenance systems for regional carriers."),
        new Extra("Harvest Agritech", "Agriculture", "harvestagritech.example.com", "Minneapolis, MN", "51-200", "Harvest Agritech sells sensors and forecasting software to growers."),
        new Extra("Coastal Hospitality", "Hospitality", "coastalhospitality.example.com", "Miami, FL", "201-1000", "Coastal Hospitality manages hotels and resorts along the east coast."),
        new Extra("Summit Biotech", "Biotechnology", "summitbiotech.example.com", "San Diego, CA", "201-1000", "Summit Biotech develops diagnostics and needs data, quality and validation contractors."),
        new Extra("Atlas Manufacturing", "Manufacturing", "atlasmfg.example.com", "Detroit, MI", "1000-5000", "Atlas Manufacturing builds industrial components and is digitising its plants."),
        new Extra("Brightwave Software", "Technology", "brightwave.example.com", "Austin, TX", "51-200", "Brightwave Software makes scheduling and workforce tools for field teams."),
        new Extra("Ledger & Co.", "Financial Services", "ledgerco.example.com", "Chicago, IL", "1-50", "Ledger & Co. is an accounting and advisory boutique with a small finance-systems team.")
    );

    private static final List<Extra> BETA_EXTRA = List.of(
        new Extra("Harborview Foods", "Food & Beverage", "harborviewfoods.example.com", "Portland, OR", "201-1000", "Harborview Foods distributes groceries to restaurants and stores across the northwest."),
        new Extra("Quantum Labs", "Technology", "quantumlabs.example.com", "Boston, MA", "51-200", "Quantum Labs builds research software for labs and universities."),
        new Extra("Summit Realty", "Real Estate", "summitrealty.example.com", "Denver, CO", "51-200", "Summit Realty manages commercial property and a leasing platform.")
    );

    private static final String[] FIRST = { "Jennifer", "Robert", "Amanda", "Daniel", "Sofia", "Marcus", "Elena", "Kenji", "Priya", "Thomas", "Hannah", "Victor", "Grace", "Samuel", "Natalie", "Andre", "Leila", "Peter" };
    private static final String[] LAST = { "Wilson", "Chen", "Foster", "Morales", "Bennett", "Okafor", "Lindgren", "Sato", "Raman", "Keller", "Brooks", "Ivanov", "Adeyemi", "Cole", "Hughes", "Dubois", "Haddad", "Novak" };
    private static final String[] TITLES = { "VP of Talent Acquisition", "Hiring Manager", "Head of Engineering", "Talent Partner", "Director of Operations", "HR Business Partner", "Engineering Manager", "Procurement Lead" };
    private static final String[] ROLE_LABELS = { "HIRING_MANAGER", "RECRUITER", "OTHER" };
    private static final String[] REQUIREMENTS = {
        "Senior Frontend Engineer", "ML Infrastructure Engineer", "Product Manager", "Data Analyst", "DevOps Engineer", "Salesforce Consultant", "QA Automation Engineer",
        "Business Analyst", "Cloud Architect", "UX Designer", "Project Manager", "Data Engineer", "Backend Engineer", "Scrum Master", "Security Analyst"
    };
    private static final String[] NOTE_TEXTS = {
        "Great quarterly business review. Looking to expand into data analytics roles.",
        "Agreed to a shorter submission window for urgent requirements. Follow up after the next planning meeting.",
        "The hiring manager asked for weekly updates on open roles instead of daily e-mails.",
        "Procurement is consolidating vendors next quarter. Worth a call about our preferred-supplier status.",
        "Positive feedback on the last two placements. They may open three more positions in the spring."
    };

    private final OrganizationRepository orgs;
    private final ClientAccountRepository clients;
    private final ClientContactRepository contacts;
    private final ClientNoteRepository notes;
    private final ClientRequirementRepository requirements;
    private final TalentPlacementRepository placements;
    private final ConsultantProfileRepository consultants;
    private final MarketerCapacityRepository capacities;
    private final JdbcTemplate jdbc;

    public ClientsDemoSeeder(
        OrganizationRepository orgs,
        ClientAccountRepository clients,
        ClientContactRepository contacts,
        ClientNoteRepository notes,
        ClientRequirementRepository requirements,
        TalentPlacementRepository placements,
        ConsultantProfileRepository consultants,
        MarketerCapacityRepository capacities,
        JdbcTemplate jdbc
    ) {
        this.orgs = orgs;
        this.clients = clients;
        this.contacts = contacts;
        this.notes = notes;
        this.requirements = requirements;
        this.placements = placements;
        this.consultants = consultants;
        this.capacities = capacities;
        this.jdbc = jdbc;
    }

    /** Seeds both demo organizations (idempotent). Returns how many clients were added in total. */
    public int seed() {
        int added = 0;
        added += seedOrg(EnterpriseDemoSeeder.ACME_SLUG, 24, ACME_EXTRA, 20261020L);
        added += seedOrg(EnterpriseDemoSeeder.BETA_SLUG, 6, BETA_EXTRA, 20261021L);
        return added;
    }

    int seedOrg(String slug, int target, List<Extra> extras, long seed) {
        Long orgId = orgs.findBySlug(slug).map(o -> o.getId()).orElse(null);
        if (orgId == null) return 0;
        List<ClientAccount> existing = clients.findByOrgId(orgId);
        if (existing.isEmpty()) return 0; // the talent demo data is not there (yet)
        Random rnd = new Random(seed);
        Instant now = Instant.now();
        LocalDate today = LocalDate.now(ZoneOffset.UTC);
        List<Long> owners = capacities.findByOrgId(orgId).stream().map(MarketerCapacity::getMemberId).toList();
        List<ConsultantProfile> people = consultants.findByOrgId(orgId);

        // 1. the clients that exist already: profile facts without touching updated_at (it feeds "last activity")
        List<ClientAccount> ordered = new ArrayList<>(existing);
        ordered.sort(java.util.Comparator.comparing(ClientAccount::getId));
        for (int i = 0; i < ordered.size(); i++) {
            ClientAccount c = ordered.get(i);
            if (c.getSizeBand() != null) continue;
            Profile p = KNOWN.get(c.getName());
            if (p == null) continue;
            LocalDate since = today.minusDays(240 + rnd.nextInt(1100));
            // the foundation gave every client to one account manager; spread two of every three over the marketing seats
            Long owner = owners.isEmpty() || i % 3 == 0 ? c.getOwnerMemberId() : owners.get(i % owners.size());
            jdbc.update("update client_account set location = ?, size_band = ?, client_since = ?, about = ?, owner_member_id = ? where org_id = ? and id = ?", p.city(), p.size(), since, p.about(), owner, orgId, c.getId());
        }

        // 2. new clients up to the target
        int toAdd = Math.max(0, target - existing.size());
        int added = 0;
        for (Extra e : extras) {
            if (added >= toAdd) break;
            if (clients.findByOrgIdAndNameIgnoreCase(orgId, e.name()).isPresent()) continue;
            Instant last = lastActivity(now, added, rnd);
            Instant created = added < 6 ? last.minus(rnd.nextInt(4), ChronoUnit.DAYS) : now.minus(40 + rnd.nextInt(400), ChronoUnit.DAYS);
            if (created.isAfter(last)) created = last;
            ClientAccount c = new ClientAccount();
            c.setOrgId(orgId);
            c.setKind("END_CLIENT");
            c.setName(e.name());
            c.setIndustry(e.industry());
            c.setWebsite("https://www." + e.domain());
            c.setStatus(added % 11 == 10 ? "PROSPECT" : "ACTIVE");
            c.setOwnerMemberId(owners.isEmpty() ? null : owners.get(added % owners.size()));
            c.setLocation(e.city());
            c.setSizeBand(e.size());
            c.setClientSince(created.atZone(ZoneOffset.UTC).toLocalDate().minusDays(added < 6 ? 0 : 30 + rnd.nextInt(700)));
            c.setAbout(e.about());
            c.setCreatedAt(created);
            c.setUpdatedAt(last);
            c = clients.saveAndFlush(c);

            for (int k = 0; k < 2 + rnd.nextInt(2); k++) {
                ClientContact x = new ClientContact();
                x.setOrgId(orgId);
                x.setClientId(c.getId());
                String first = FIRST[rnd.nextInt(FIRST.length)];
                String lastName = LAST[rnd.nextInt(LAST.length)];
                x.setName(first + " " + lastName);
                x.setTitle(TITLES[rnd.nextInt(TITLES.length)]);
                x.setRoleLabel(ROLE_LABELS[k % ROLE_LABELS.length]);
                x.setWorkEmail((first + "." + lastName).toLowerCase() + k + "@" + e.domain());
                x.setStatus("ACTIVE");
                x.setCreatedAt(created.plus(k, ChronoUnit.HOURS));
                contacts.save(x);
            }
            int reqs = 1 + rnd.nextInt(5);
            for (int k = 0; k < reqs; k++) {
                ClientRequirement r = new ClientRequirement();
                r.setOrgId(orgId);
                r.setClientId(c.getId());
                r.setTitle(REQUIREMENTS[rnd.nextInt(REQUIREMENTS.length)]);
                r.setLocation(e.city());
                r.setWorkMode(k % 2 == 0 ? "HYBRID" : "REMOTE");
                r.setEmploymentLabel("CONTRACT");
                r.setExperienceLevel(k % 2 == 0 ? "SENIOR" : "MID");
                r.setPositions(1 + rnd.nextInt(3));
                int roll = rnd.nextInt(10);
                r.setStatus(roll < 7 ? "OPEN" : roll < 8 ? "IN_REVIEW" : roll < 9 ? "FILLED" : "ON_HOLD");
                long span = Math.max(1, ChronoUnit.HOURS.between(created, last));
                Instant posted = created.plus((long) (rnd.nextDouble() * span), ChronoUnit.HOURS);
                r.setPostedAt(posted);
                r.setCreatedAt(posted);
                r.setUpdatedAt(posted);
                r.setSource("MANUAL");
                r.setOwnerMemberId(c.getOwnerMemberId());
                if ("FILLED".equals(r.getStatus())) {
                    r.setFilled(r.getPositions());
                    r.setClosedAt(posted.plus(10, ChronoUnit.DAYS).isAfter(last) ? last : posted.plus(10, ChronoUnit.DAYS));
                }
                requirements.save(r);
            }
            if (!people.isEmpty() && added % 3 != 2) {
                for (int k = 0; k < 1 + rnd.nextInt(3); k++) {
                    ConsultantProfile who = people.get(rnd.nextInt(people.size()));
                    LocalDate start = today.minusDays(120 + rnd.nextInt(200));
                    TalentPlacement p = new TalentPlacement();
                    p.setOrgId(orgId);
                    p.setConsultantId(who.getId());
                    p.setClientId(c.getId());
                    p.setRoleTitle(REQUIREMENTS[rnd.nextInt(REQUIREMENTS.length)]);
                    p.setStatus("ENDED");
                    p.setStartDate(start);
                    p.setEndDate(start.plusDays(60 + rnd.nextInt(90)));
                    p.setCreatedAt(start.atStartOfDay().toInstant(ZoneOffset.UTC));
                    p.setUpdatedAt(p.getCreatedAt());
                    placements.save(p);
                }
            }
            added++;
        }

        // 3. relationship notes on clients that have none
        List<Long> authors = owners;
        int n = 0;
        for (ClientAccount c : clients.findByOrgId(orgId)) {
            if (notes.countByOrgIdAndClientId(orgId, c.getId()) > 0) continue;
            int count = 1 + (n % 2);
            for (int k = 0; k < count; k++) {
                ClientNote note = new ClientNote();
                note.setOrgId(orgId);
                note.setClientId(c.getId());
                note.setAuthorMemberId(authors.isEmpty() ? c.getOwnerMemberId() : authors.get((n + k) % authors.size()));
                note.setBody(NOTE_TEXTS[(n + k * 2) % NOTE_TEXTS.length]);
                Instant at = c.getUpdatedAt().minus(k * 9L + 1, ChronoUnit.DAYS);
                if (at.isBefore(c.getCreatedAt())) at = c.getCreatedAt().plus(1, ChronoUnit.HOURS);
                if (at.isAfter(now)) at = now.minus(1, ChronoUnit.HOURS);
                note.setCreatedAt(at);
                notes.save(note);
            }
            n++;
        }
        if (added > 0) LOG.info("Clients demo data for {}: {} clients added", slug, added);
        return added;
    }

    /** A spread of last-activity ages: the first six are recent (so they are "new this month"), then healthy, quiet and silent ones. */
    private static Instant lastActivity(Instant now, int i, Random rnd) {
        int days;
        if (i < 6) days = rnd.nextInt(9);
        else if (i % 4 == 0) days = 46 + rnd.nextInt(60);
        else if (i % 4 == 1) days = 16 + rnd.nextInt(25);
        else days = rnd.nextInt(14);
        return now.minus(days, ChronoUnit.DAYS).minus(rnd.nextInt(20), ChronoUnit.HOURS);
    }
}
