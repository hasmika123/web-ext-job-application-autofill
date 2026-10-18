package com.dossier.api.service.pricing;

/** The draft org catalog of docs/enterprise-v2/21 section 6 and the individual shorthand of docs/subscriptions/03 section 8. */
final class Draft {

    static final String USD = "USD";

    private Draft() {}

    static InMemoryCatalog org() {
        InMemoryCatalog c = new InMemoryCatalog();
        c.add("BASE", "BASE_LICENSE", Audience.ORG, BillingInterval.MONTH, USD, 1499, 0);
        c.add("JM", "FEATURE", Audience.ORG, BillingInterval.MONTH, USD, 499, 75);
        c.add("RT", "FEATURE", Audience.ORG, BillingInterval.MONTH, USD, 799, 125);
        c.add("INB", "FEATURE", Audience.ORG, BillingInterval.MONTH, USD, 499, 60);
        c.add("MKT", "FEATURE", Audience.ORG, BillingInterval.MONTH, USD, 699, 75);
        c.add("INT", "FEATURE", Audience.ORG, BillingInterval.MONTH, USD, 999, 150);
        c.add("ALR", "FEATURE", Audience.ORG, BillingInterval.MONTH, USD, 199, 0);
        c.add("CREDIT", "FEATURE", Audience.ORG, BillingInterval.MONTH, USD, 499, 75);
        return c;
    }

    /** Individual MONTH rows plus derived YEAR rows at the given global discount (negative: no YEAR rows). */
    static InMemoryCatalog individual(int yearDiscountBp) {
        InMemoryCatalog c = new InMemoryCatalog();
        c.addWithYear("PRO", "PLAN_BASE", Audience.INDIVIDUAL, USD, 1999, 300, yearDiscountBp);
        c.addWithYear("AUTOPILOT", "PLAN_BASE", Audience.INDIVIDUAL, USD, 3999, 600, yearDiscountBp);
        c.addWithYear("CREDITS", "ADDON", Audience.INDIVIDUAL, USD, 499, 75, yearDiscountBp);
        c.addWindow("PRO", "PLAN_BASE", Audience.INDIVIDUAL, BillingInterval.QUARTER, USD, 4999, 800); // $8 per quarter (CLAUDE.md), not 3 x $3
        c.addWindow("CREDITS", "ADDON", Audience.INDIVIDUAL, BillingInterval.QUARTER, USD, 1497, 225);
        return c;
    }
}
