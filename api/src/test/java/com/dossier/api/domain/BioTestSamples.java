package com.dossier.api.domain;

import java.util.Random;
import java.util.concurrent.atomic.AtomicLong;

public class BioTestSamples {

    private static final Random random = new Random();
    private static final AtomicLong longCount = new AtomicLong(random.nextInt() + (2 * Integer.MAX_VALUE));

    public static Bio getBioSample1() {
        return new Bio().id(1L);
    }

    public static Bio getBioSample2() {
        return new Bio().id(2L);
    }

    public static Bio getBioRandomSampleGenerator() {
        return new Bio().id(longCount.incrementAndGet());
    }
}
