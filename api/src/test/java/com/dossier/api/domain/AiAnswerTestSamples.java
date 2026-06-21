package com.dossier.api.domain;

import java.util.Random;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;

public class AiAnswerTestSamples {

    private static final Random random = new Random();
    private static final AtomicLong longCount = new AtomicLong(random.nextInt() + (2 * Integer.MAX_VALUE));
    private static final AtomicInteger intCount = new AtomicInteger(random.nextInt() + (2 * Short.MAX_VALUE));

    public static AiAnswer getAiAnswerSample1() {
        return new AiAnswer().id(1L).questionHash("questionHash1").model("model1").tokens(1);
    }

    public static AiAnswer getAiAnswerSample2() {
        return new AiAnswer().id(2L).questionHash("questionHash2").model("model2").tokens(2);
    }

    public static AiAnswer getAiAnswerRandomSampleGenerator() {
        return new AiAnswer()
            .id(longCount.incrementAndGet())
            .questionHash(UUID.randomUUID().toString())
            .model(UUID.randomUUID().toString())
            .tokens(intCount.incrementAndGet());
    }
}
