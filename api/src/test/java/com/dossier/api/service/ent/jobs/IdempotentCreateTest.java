package com.dossier.api.service.ent.jobs;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.service.ent.IdempotencyService;
import com.dossier.api.service.ent.IdempotencyService.Outcome;
import com.dossier.api.service.org.OrgMembership;
import java.util.function.Supplier;
import org.junit.jupiter.api.Test;

/** The create-endpoint wrapper always asks for the key (required) and always says POST; the ledger itself is tested with {@code IdempotencyService}. */
class IdempotentCreateTest {

    IdempotencyService idempotency = mock(IdempotencyService.class);
    IdempotentCreate create = new IdempotentCreate(idempotency);
    OrgMembership me = new OrgMembership(7L, 70L, 700L, "marketer", OrgRole.MARKETER, OrgMemberStatus.ACTIVE, OrgStatus.ACTIVE);

    @Test
    @SuppressWarnings("unchecked")
    void theKeyIsRequiredTheMethodIsPostAndTheStatusDefaultsTo200() {
        Supplier<String> work = () -> "made";
        when(idempotency.execute(eq(me), eq("0b9d5c1e-1111-4222-8333-444455556666"), eq(true), eq("POST"), eq("/api/orgs/7/mkt/opportunities/from-extension"), any(), eq(200), eq(String.class), any(Supplier.class)))
            .thenReturn(new Outcome<>("made", 200, false));
        Outcome<String> out = create.run(me, "0b9d5c1e-1111-4222-8333-444455556666", "/api/orgs/7/mkt/opportunities/from-extension", java.util.Map.of("a", 1), String.class, work);
        assertThat(out.body()).isEqualTo("made");
        assertThat(out.replayed()).isFalse();
    }

    @Test
    @SuppressWarnings("unchecked")
    void aMissingKeyIsRefusedByTheLedgerBecauseTheWrapperMarksItRequired() {
        when(idempotency.execute(eq(me), eq(null), eq(true), eq("POST"), eq("/p"), any(), anyInt(), eq(String.class), any(Supplier.class)))
            .thenThrow(com.dossier.api.service.org.OrgException.coded(400, IdempotencyService.CODE_KEY_MISSING, "Send an Idempotency-Key", java.util.Map.of()));
        assertThatThrownBy(() -> create.run(me, null, "/p", null, 201, String.class, () -> "x"))
            .isInstanceOfSatisfying(com.dossier.api.service.org.OrgException.class, e -> assertThat(e.getCode()).isEqualTo("IDEMPOTENCY_KEY_MISSING"));
        verify(idempotency).execute(eq(me), eq(null), eq(true), eq("POST"), eq("/p"), any(), eq(201), eq(String.class), any(Supplier.class));
    }

    @Test
    void theHeaderNamesAreTheContractOnes() {
        assertThat(IdempotentCreate.HEADER).isEqualTo("Idempotency-Key");
        assertThat(IdempotentCreate.REPLAYED_HEADER).isEqualTo("Idempotent-Replayed");
    }
}
