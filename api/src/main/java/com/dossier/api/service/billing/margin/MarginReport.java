package com.dossier.api.service.billing.margin;

import java.util.ArrayList;
import java.util.List;

/** Every check of one evaluation, with the failures split into the ones a reason can override and the ones nothing can. */
public record MarginReport(List<MarginCheck> checks, List<PresetFinding> presetFindings) {
    public MarginReport {
        checks = List.copyOf(checks);
        presetFindings = List.copyOf(presetFindings);
    }

    public List<MarginCheck> failures() {
        return checks.stream().filter(c -> !c.pass()).toList();
    }

    /** Failures that cannot be overridden: discount rows, tier rows. */
    public List<MarginCheck> hardFailures() {
        return checks.stream().filter(c -> !c.pass() && !c.overridable()).toList();
    }

    public boolean ok() {
        return failures().isEmpty() && presetFindings.stream().noneMatch(PresetFinding::hard);
    }

    public MarginReport plus(MarginReport other) {
        List<MarginCheck> c = new ArrayList<>(checks);
        c.addAll(other.checks);
        List<PresetFinding> p = new ArrayList<>(presetFindings);
        p.addAll(other.presetFindings);
        return new MarginReport(c, p);
    }
}
