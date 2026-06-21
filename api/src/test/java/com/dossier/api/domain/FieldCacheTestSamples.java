package com.dossier.api.domain;

import java.util.Random;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;

public class FieldCacheTestSamples {

    private static final Random random = new Random();
    private static final AtomicLong longCount = new AtomicLong(random.nextInt() + (2 * Integer.MAX_VALUE));
    private static final AtomicInteger intCount = new AtomicInteger(random.nextInt() + (2 * Short.MAX_VALUE));

    public static FieldCache getFieldCacheSample1() {
        return new FieldCache().id(1L).fieldKey("fieldKey1").contextHash("contextHash1").hitCount(1);
    }

    public static FieldCache getFieldCacheSample2() {
        return new FieldCache().id(2L).fieldKey("fieldKey2").contextHash("contextHash2").hitCount(2);
    }

    public static FieldCache getFieldCacheRandomSampleGenerator() {
        return new FieldCache()
            .id(longCount.incrementAndGet())
            .fieldKey(UUID.randomUUID().toString())
            .contextHash(UUID.randomUUID().toString())
            .hitCount(intCount.incrementAndGet());
    }
}
