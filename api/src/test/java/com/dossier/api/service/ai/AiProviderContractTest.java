package com.dossier.api.service.ai;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.io.IOException;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.http.HttpTimeoutException;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;

/**
 * What every {@link AiProvider} adapter must do on the wire, against a stubbed {@link HttpClient} (no network):
 * for every task a request is produced and a canned success yields text and usage; an empty answer is EMPTY, a
 * 400 is HTTP_4XX, 429 RATE_LIMITED, 5xx HTTP_5XX, a timeout TIMEOUT, an I/O failure TRANSPORT, and an adapter
 * with no key is UNCONFIGURED. A second adapter (Phase 2) extends this class and inherits the cases.
 */
abstract class AiProviderContractTest {

    protected HttpClient http;
    protected final List<HttpRequest> sent = new ArrayList<>();

    /** An adapter wired to {@link #http}, configured (it has a key). */
    protected abstract AiProvider provider();

    /** An adapter wired to {@link #http} that has no key. */
    protected abstract AiProvider unconfiguredProvider();

    /** A canned 200 body with {@code text} as the answer and usage of 120 input / 30 output tokens. */
    protected abstract String successBody(String text);

    /** A canned 200 body with no answer in it. */
    protected abstract String emptyBody();

    @BeforeEach
    void stubHttp() {
        http = mock(HttpClient.class);
        sent.clear();
    }

    protected void respond(int status, String body) throws Exception {
        @SuppressWarnings("unchecked")
        HttpResponse<String> res = mock(HttpResponse.class);
        when(res.statusCode()).thenReturn(status);
        when(res.body()).thenReturn(body);
        when(http.send(any(HttpRequest.class), any())).thenAnswer(i -> {
            sent.add(i.getArgument(0));
            return res;
        });
    }

    @ParameterizedTest
    @EnumSource(AiTask.class)
    void everyTaskProducesARequestAndParsesASuccess(AiTask task) throws Exception {
        respond(200, successBody("Hello there"));
        AiResult r = provider().generate(task, "some-model", "Question?", "Background.");
        assertThat(sent).hasSize(1);
        assertThat(r.text()).isEqualTo("Hello there");
        assertThat(r.inputTokens() + r.cachedTokens()).isEqualTo(120);
        assertThat(r.outputTokens()).isEqualTo(30);
        assertThat(r.model()).isNotBlank();
    }

    @Test
    void aResumeParseSendsARequestAndReturnsTheJson() throws Exception {
        respond(200, successBody("{\"summary\":\"x\"}"));
        AiResult r = provider().parseResume("some-model", "Jane Doe\nEngineer", null, null);
        assertThat(sent).hasSize(1);
        assertThat(r.text()).isEqualTo("{\"summary\":\"x\"}");
    }

    @Test
    void anEmptyAnswerIsEmpty() throws Exception {
        respond(200, emptyBody());
        assertThat(kindOf(() -> provider().generate(AiTask.PICK, "m", "q", ""))).isEqualTo(AiErrorKind.EMPTY);
    }

    @ParameterizedTest
    @EnumSource(value = HttpStatusCase.class)
    void aHttpErrorCarriesItsStatusAndKind(HttpStatusCase c) throws Exception {
        respond(c.status, "{\"error\":\"nope\"}");
        assertThatThrownBy(() -> provider().generate(AiTask.PICK, "m", "q", ""))
            .isInstanceOfSatisfying(AiProviderException.class, e -> {
                assertThat(e.httpStatus()).isEqualTo(c.status);
                assertThat(AiErrorKind.classify(e)).isEqualTo(c.kind);
            });
    }

    enum HttpStatusCase {
        BAD_REQUEST(400, AiErrorKind.HTTP_4XX),
        FORBIDDEN(403, AiErrorKind.HTTP_4XX),
        NOT_FOUND(404, AiErrorKind.MODEL_NOT_FOUND),
        RATE_LIMIT(429, AiErrorKind.RATE_LIMITED),
        SERVER_ERROR(500, AiErrorKind.HTTP_5XX),
        UNAVAILABLE(503, AiErrorKind.HTTP_5XX);

        final int status;
        final AiErrorKind kind;

        HttpStatusCase(int status, AiErrorKind kind) {
            this.status = status;
            this.kind = kind;
        }
    }

    @Test
    void aTimeoutIsATimeout() throws Exception {
        when(http.send(any(HttpRequest.class), any())).thenThrow(new HttpTimeoutException("request timed out"));
        assertThat(kindOf(() -> provider().generate(AiTask.PICK, "m", "q", ""))).isEqualTo(AiErrorKind.TIMEOUT);
    }

    @Test
    void anIoFailureIsTransport() throws Exception {
        when(http.send(any(HttpRequest.class), any())).thenThrow(new IOException("connection reset"));
        assertThat(kindOf(() -> provider().generate(AiTask.PICK, "m", "q", ""))).isEqualTo(AiErrorKind.TRANSPORT);
    }

    @Test
    void anAdapterWithNoKeyIsUnconfiguredAndSendsNothing() {
        AiProvider p = unconfiguredProvider();
        assertThat(p.isConfigured()).isFalse();
        assertThat(kindOf(() -> p.generate(AiTask.PICK, "m", "q", ""))).isEqualTo(AiErrorKind.UNCONFIGURED);
        assertThat(sent).isEmpty();
    }

    private static AiErrorKind kindOf(Runnable r) {
        try {
            r.run();
        } catch (AiProviderException e) {
            return AiErrorKind.classify(e);
        }
        throw new AssertionError("expected an AiProviderException");
    }
}
