package com.dossier.api.service.catalog.dto;

/** The body of a retire call: a retirement is HIGH risk, so it carries a reason of at least ten characters. */
public record RetireRequest(String reason) {}
