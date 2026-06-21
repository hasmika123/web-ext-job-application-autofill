package com.dossier.api.domain;

import java.util.Random;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicLong;

public class ResumeTestSamples {

    private static final Random random = new Random();
    private static final AtomicLong longCount = new AtomicLong(random.nextInt() + (2 * Integer.MAX_VALUE));

    public static Resume getResumeSample1() {
        return new Resume().id(1L).label("label1").r2ObjectKey("r2ObjectKey1");
    }

    public static Resume getResumeSample2() {
        return new Resume().id(2L).label("label2").r2ObjectKey("r2ObjectKey2");
    }

    public static Resume getResumeRandomSampleGenerator() {
        return new Resume().id(longCount.incrementAndGet()).label(UUID.randomUUID().toString()).r2ObjectKey(UUID.randomUUID().toString());
    }
}
