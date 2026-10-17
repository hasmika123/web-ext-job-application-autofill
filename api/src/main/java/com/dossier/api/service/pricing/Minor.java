package com.dossier.api.service.pricing;

import java.math.BigInteger;

/**
 * The only rounding in the pricing code (docs/enterprise-v2/22 section 1). Money is a {@code long} of minor units
 * (cents, pence, yen); percentages are basis points. No floating point anywhere.
 */
public final class Minor {

    private static final long BP = 10_000L;

    private Minor() {}

    /** {@code amount * num / den} rounded HALF_EVEN to an integer; {@code den > 0}. Exact: overflows fall back to BigInteger. */
    public static long mulDivHalfEven(long amount, long num, long den) {
        if (den <= 0) {
            throw new IllegalArgumentException("den must be > 0");
        }
        long prod;
        try {
            prod = Math.multiplyExact(amount, num);
        } catch (ArithmeticException overflow) {
            return bigMulDivHalfEven(amount, num, den);
        }
        long q = Math.floorDiv(prod, den);
        long r = Math.floorMod(prod, den);
        if (r > Long.MAX_VALUE / 2) { // r * 2 would overflow (den > 2^62)
            return bigMulDivHalfEven(amount, num, den);
        }
        long twice = r * 2;
        if (twice < den) {
            return q;
        }
        if (twice > den) {
            return q + 1;
        }
        return (q % 2 == 0) ? q : q + 1; // exactly half: to even
    }

    private static long bigMulDivHalfEven(long amount, long num, long den) {
        BigInteger prod = BigInteger.valueOf(amount).multiply(BigInteger.valueOf(num));
        BigInteger d = BigInteger.valueOf(den);
        BigInteger[] qr = prod.divideAndRemainder(d);
        BigInteger q = qr[0];
        BigInteger r = qr[1];
        if (r.signum() < 0) { // floor semantics
            q = q.subtract(BigInteger.ONE);
            r = r.add(d);
        }
        int cmp = r.shiftLeft(1).compareTo(d);
        if (cmp > 0 || (cmp == 0 && q.testBit(0))) {
            q = q.add(BigInteger.ONE);
        }
        return q.longValueExact();
    }

    /** {@code amount} reduced by {@code bp} basis points, half-even. {@code bp} in 0..10000. */
    public static long pctOff(long amount, int bp) {
        if (bp < 0 || bp > BP) {
            throw new IllegalArgumentException("bp out of range: " + bp);
        }
        return mulDivHalfEven(amount, BP - bp, BP);
    }

    /** {@code ceil(a / b)} for {@code b > 0}. */
    public static long ceilDiv(long a, long b) {
        if (b <= 0) {
            throw new IllegalArgumentException("b must be > 0");
        }
        return -Math.floorDiv(-a, b);
    }

    public static long add(long a, long b) {
        return Math.addExact(a, b);
    }

    public static long mul(long a, long b) {
        return Math.multiplyExact(a, b);
    }
}
