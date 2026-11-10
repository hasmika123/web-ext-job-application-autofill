package com.dossier.api.service.ent.members;

import com.dossier.api.service.dto.ent.MemberActionDTO;
import java.util.ArrayList;
import java.util.List;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

/** The ordered chain of {@link OffboardingHook} beans (a missing bean is skipped); the order is the one each hook's {@code getOrder()} declares. */
@Component
public class OffboardingHooks {

    private final List<OffboardingHook> hooks;

    @Autowired
    public OffboardingHooks(ObjectProvider<OffboardingHook> beans) {
        this(beans.orderedStream().toList());
    }

    /** For tests: the hooks, in the order given (production order comes from {@code getOrder()}). */
    public OffboardingHooks(List<OffboardingHook> hooks) {
        this.hooks = List.copyOf(hooks);
    }

    /** The keys in the order they run. */
    public List<String> keys() {
        return hooks.stream().map(OffboardingHook::key).toList();
    }

    public List<MemberActionDTO.HookLine> preview(Long orgId, Long memberId) {
        List<MemberActionDTO.HookLine> lines = new ArrayList<>();
        for (OffboardingHook h : hooks) lines.addAll(h.preview(orgId, memberId));
        return lines;
    }

    /** Runs every hook in order; returns the lines the preview shows for the same person, taken just before the apply. */
    public List<MemberActionDTO.HookLine> apply(OffboardingHook.Context context) {
        List<MemberActionDTO.HookLine> lines = preview(context.orgId(), context.memberId());
        for (OffboardingHook h : hooks) h.apply(context);
        return lines;
    }
}
