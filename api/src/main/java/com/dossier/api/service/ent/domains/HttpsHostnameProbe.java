package com.dossier.api.service.ent.domains;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import javax.net.ssl.SSLException;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

/**
 * Probes {@code https://{host}/api/public/tenant} from the API (10 seconds, the JDK's trusted roots, no redirects). Any HTTP answer below 500 after a passing
 * TLS handshake means the edge holds a valid certificate for the name and serves it. A TLS failure or no answer is not live.
 */
@Component
@ConditionalOnProperty(name = "dossier.ent.domains.probe", havingValue = "system", matchIfMissing = true)
public class HttpsHostnameProbe implements HostnameProbe {

    static final Duration TIMEOUT = Duration.ofSeconds(10);

    private final HttpClient client = HttpClient.newBuilder().connectTimeout(TIMEOUT).followRedirects(HttpClient.Redirect.NEVER).build();

    @Override
    public Result probe(String host) {
        try {
            HttpRequest req = HttpRequest.newBuilder(URI.create("https://" + host + "/api/public/tenant")).timeout(TIMEOUT).GET().build();
            HttpResponse<Void> res = client.send(req, HttpResponse.BodyHandlers.discarding());
            return new Result(res.statusCode() < 500, res.statusCode(), res.statusCode() < 500 ? null : "HTTP_" + res.statusCode());
        } catch (SSLException e) {
            return new Result(false, null, "TLS");
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return new Result(false, null, "INTERRUPTED");
        } catch (Exception e) {
            Throwable cause = e.getCause();
            return new Result(false, null, cause instanceof SSLException ? "TLS" : "UNREACHABLE");
        }
    }
}
