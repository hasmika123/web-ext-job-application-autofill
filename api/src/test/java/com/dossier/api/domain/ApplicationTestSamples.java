package com.dossier.api.domain;

import java.util.Random;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicLong;

public class ApplicationTestSamples {

    private static final Random random = new Random();
    private static final AtomicLong longCount = new AtomicLong(random.nextInt() + (2 * Integer.MAX_VALUE));

    public static Application getApplicationSample1() {
        return new Application()
            .id(1L)
            .company("company1")
            .roleTitle("roleTitle1")
            .jobUrl("jobUrl1")
            .atsPlatform("atsPlatform1")
            .source("source1");
    }

    public static Application getApplicationSample2() {
        return new Application()
            .id(2L)
            .company("company2")
            .roleTitle("roleTitle2")
            .jobUrl("jobUrl2")
            .atsPlatform("atsPlatform2")
            .source("source2");
    }

    public static Application getApplicationRandomSampleGenerator() {
        return new Application()
            .id(longCount.incrementAndGet())
            .company(UUID.randomUUID().toString())
            .roleTitle(UUID.randomUUID().toString())
            .jobUrl(UUID.randomUUID().toString())
            .atsPlatform(UUID.randomUUID().toString())
            .source(UUID.randomUUID().toString());
    }
}
