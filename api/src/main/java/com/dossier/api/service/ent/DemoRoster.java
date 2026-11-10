package com.dossier.api.service.ent;

import java.util.Map;

/**
 * Which names the Acme demo tenant is seeded with. By default the long-standing roster (Acme Staffing, Sarah Chen, Omar Haddad, ...) that the
 * stories, journeys and tests know. With {@code DOSSIER_DEMO_ROSTER=india} (a live sales demo for an Indian-run consultancy) the same tenant,
 * the same people and the same logins are seeded under realistic Indian names and a realistic company name, so a demo reads like a real firm.
 *
 * <p>Only display names, e-mail addresses and the host label change; every login key (sarah, omar, anika, ...), role and relationship is the
 * same, so nothing else in the code needs to know. Read once at class load: switch it and seed a fresh demo database.
 */
public final class DemoRoster {

    private DemoRoster() {}

    public static final boolean INDIA = "india".equalsIgnoreCase(System.getenv("DOSSIER_DEMO_ROSTER"));

    /** The Acme tenant's display name, host and e-mail domain. */
    public static final String COMPANY = INDIA ? "Aaruna Technologies" : "Acme Staffing";
    public static final String HOST = INDIA ? "aaruna.localhost" : "acme.localhost";
    public static final String DOMAIN = INDIA ? "aarunatech.com" : "acme.example.com";
    /** The consultancy's own client row (its internal bench projects). */
    public static final String INTERNAL_CLIENT = INDIA ? "Aaruna Internal" : "ACME Internal";

    /** login key -> {first, last} under the India roster. Anika Rao keeps her name. */
    private static final Map<String, String[]> NAMES = Map.ofEntries(
        Map.entry("sarah", new String[] { "Priya", "Sharma" }),
        Map.entry("omar", new String[] { "Rahul", "Mehta" }),
        Map.entry("ben", new String[] { "Vikram", "Iyer" }),
        Map.entry("hana", new String[] { "Neha", "Kapoor" }),
        Map.entry("felix", new String[] { "Arjun", "Nair" }),
        Map.entry("amara", new String[] { "Kavya", "Reddy" }),
        Map.entry("tomas", new String[] { "Rohan", "Desai" }),
        Map.entry("eve", new String[] { "Meera", "Joshi" }),
        Map.entry("sam", new String[] { "Sameer", "Khan" }),
        Map.entry("nina", new String[] { "Divya", "Pillai" }),
        Map.entry("jessica", new String[] { "Pooja", "Verma" }),
        Map.entry("michael", new String[] { "Karthik", "Subramanian" }),
        Map.entry("emily", new String[] { "Sneha", "Kulkarni" }),
        Map.entry("david", new String[] { "Aditya", "Bhat" }),
        Map.entry("samantha", new String[] { "Lakshmi", "Menon" }),
        Map.entry("ryan", new String[] { "Nikhil", "Agarwal" })
    );

    public static String first(String key, String dflt) {
        String[] n = INDIA ? NAMES.get(key) : null;
        return n == null ? dflt : n[0];
    }

    public static String last(String key, String dflt) {
        String[] n = INDIA ? NAMES.get(key) : null;
        return n == null ? dflt : n[1];
    }

    /** "First Last" of a seeded person, under the active roster. */
    public static String full(String key, String first, String last) {
        return first(key, first) + " " + last(key, last);
    }

    /** The two walkthrough consultants, by display name. */
    public static String anika() {
        return full("anika", "Anika", "Rao");
    }

    public static String ben() {
        return full("ben", "Ben", "Okafor");
    }

    /** Name pools for the generated bench under the India roster (no roster member's full name can be drawn: see TalentDemoSeeder). */
    public static final String[] FIRST = {
        "Aarav", "Aditi", "Akash", "Ananya", "Anil", "Anjali", "Arun", "Bhavana", "Deepak", "Deepika", "Gaurav", "Harini", "Harsh", "Ishaan", "Jaya", "Kiran",
        "Krishna", "Lavanya", "Madhav", "Manish", "Meghna", "Mohan", "Nandini", "Naveen", "Nisha", "Pallavi", "Pranav", "Preeti", "Raghav", "Rajesh", "Ramya", "Ravi",
        "Riya", "Sachin", "Sai", "Sanjana", "Santosh", "Shreya", "Siddharth", "Sonal", "Srinivas", "Sunil", "Swati", "Tanvi", "Tarun", "Uday", "Usha", "Varun",
        "Vidya", "Vinay", "Yash", "Zoya", "Abhishek", "Chitra", "Dinesh", "Gayatri", "Hemant", "Jyoti", "Kunal", "Shalini"
    };
    public static final String[] LAST = {
        "Agarwal", "Bansal", "Bhatt", "Chandra", "Chauhan", "Choudhary", "Das", "Dutta", "Gandhi", "Ghosh", "Goyal", "Gupta", "Hegde", "Jain", "Kamath", "Krishnan",
        "Kumar", "Malhotra", "Mishra", "Mukherjee", "Murthy", "Naidu", "Narayan", "Pandey", "Patel", "Patil", "Prasad", "Raghavan", "Rajan", "Rastogi", "Saxena", "Sen",
        "Sethi", "Shah", "Shetty", "Sinha", "Srinivasan", "Thakur", "Tiwari", "Trivedi", "Varma", "Venkatesh", "Yadav", "Bose", "Chopra", "Dixit", "Gowda", "Jha",
        "Kohli", "Mahajan", "Nambiar", "Oberoi", "Puri", "Rathore", "Sood", "Talwar", "Vohra", "Wadhwa", "Arora", "Bhattacharya"
    };
}
