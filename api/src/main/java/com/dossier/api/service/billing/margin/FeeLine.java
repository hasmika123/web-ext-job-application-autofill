package com.dossier.api.service.billing.margin;

/** One named component of the fee on a price (for the admin breakdown); the fee is the sum of its lines. */
public record FeeLine(String key, long cents) {}
