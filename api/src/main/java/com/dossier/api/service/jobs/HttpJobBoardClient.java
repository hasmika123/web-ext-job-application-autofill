package com.dossier.api.service.jobs;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * The real {@link JobBoardClient}: plain GETs against the three public job-board APIs, one request
 * at a time with a pause between them, a named User-Agent, and a size cap. No auth, no scraping —
 * these endpoints exist so job boards can be embedded and syndicated.
 *
 * <p>Greenhouse's list carries no descriptions, so only the fresh postings get a second request
 * ({@code /jobs/{id}}); on a big board that's a handful of calls, not hundreds. If a detail read
 * fails the posting is still kept, without its description.
 */
@Component
public class HttpJobBoardClient implements JobBoardClient {

    private static final Logger LOG = LoggerFactory.getLogger(HttpJobBoardClient.class);
    private static final String USER_AGENT = "Kiwiply-job-matches/1.0 (+https://kiwiply.com)";
    /** The biggest real board seen (Lever, ~300 postings with descriptions) is ~6 MB. */
    private static final int MAX_BYTES = 25 * 1024 * 1024;

    private final HttpClient http = HttpClient.newBuilder()
        .connectTimeout(Duration.ofSeconds(10))
        .followRedirects(HttpClient.Redirect.NORMAL)
        .build();
    private final ObjectMapper om = new ObjectMapper();
    private final JobBoardProperties props;

    public HttpJobBoardClient(JobBoardProperties props) {
        this.props = props;
    }

    @Override
    public Result fetch(String ats, String boardToken, String companyName, Instant since) throws BoardException {
        String token = URLEncoder.encode(boardToken, StandardCharsets.UTF_8);
        switch (ats) {
            case JobBoardParsers.GREENHOUSE -> {
                String base = "https://boards-api.greenhouse.io/v1/boards/" + token + "/jobs";
                List<FetchedPosting> all = JobBoardParsers.greenhouseList(get(base), companyName);
                List<FetchedPosting> fresh = new ArrayList<>();
                for (FetchedPosting p : all) {
                    if (p.publishedAt().isBefore(since)) continue;
                    try {
                        fresh.add(JobBoardParsers.greenhouseDetail(p, get(base + "/" + URLEncoder.encode(p.externalId(), StandardCharsets.UTF_8))));
                    } catch (BoardException e) {
                        LOG.debug("Greenhouse detail {}/{} failed: {}", boardToken, p.externalId(), e.getMessage());
                        fresh.add(p);
                    }
                }
                return new Result(all.size(), fresh);
            }
            case JobBoardParsers.LEVER -> {
                List<FetchedPosting> all = JobBoardParsers.lever(get("https://api.lever.co/v0/postings/" + token + "?mode=json"), companyName);
                return new Result(all.size(), all.stream().filter(p -> !p.publishedAt().isBefore(since)).toList());
            }
            case JobBoardParsers.ASHBY -> {
                List<FetchedPosting> all = JobBoardParsers.ashby(get("https://api.ashbyhq.com/posting-api/job-board/" + token), companyName);
                return new Result(all.size(), all.stream().filter(p -> !p.publishedAt().isBefore(since)).toList());
            }
            default -> throw new BoardException("Unknown ATS " + ats, false);
        }
    }

    private JsonNode get(String url) throws BoardException {
        pause();
        HttpRequest req = HttpRequest.newBuilder(URI.create(url))
            .timeout(Duration.ofSeconds(30))
            .header("User-Agent", USER_AGENT)
            .header("Accept", "application/json")
            .GET()
            .build();
        try {
            HttpResponse<InputStream> res = http.send(req, HttpResponse.BodyHandlers.ofInputStream());
            try (InputStream in = res.body()) {
                if (res.statusCode() == 404) throw new BoardException("Board not found (404)", true);
                if (res.statusCode() != 200) throw new BoardException("HTTP " + res.statusCode(), false);
                byte[] body = in.readNBytes(MAX_BYTES + 1);
                if (body.length > MAX_BYTES) throw new BoardException("Response over " + (MAX_BYTES >> 20) + " MB", false);
                return om.readTree(body);
            }
        } catch (IOException e) {
            throw new BoardException("Couldn't read the board: " + e.getClass().getSimpleName(), false);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new BoardException("Interrupted", false);
        }
    }

    private void pause() {
        if (props.getRequestDelayMs() <= 0) return;
        try {
            Thread.sleep(props.getRequestDelayMs());
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }
}
