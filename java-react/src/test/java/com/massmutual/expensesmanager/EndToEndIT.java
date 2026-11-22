package com.massmutual.expensesmanager;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.params.provider.Arguments.arguments;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.math.BigDecimal;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.IntStream;
import java.util.stream.Stream;
import java.util.stream.StreamSupport;
import java.util.zip.GZIPInputStream;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.massmutual.expensesmanager.domain.ReportEntity;
import com.massmutual.expensesmanager.repository.EarningReportRepository;
import com.massmutual.expensesmanager.repository.ExpenseReportRepository;
import com.massmutual.expensesmanager.service.ApiException;
import com.massmutual.expensesmanager.service.LegacyMessages;
import com.massmutual.expensesmanager.service.model.FieldViolation;
import com.massmutual.expensesmanager.support.ApiClient;
import com.massmutual.expensesmanager.support.MutableClock;
import com.massmutual.expensesmanager.support.TestDatabase;
import com.massmutual.expensesmanager.web.SpaWebConfig;
import com.zaxxer.hikari.HikariDataSource;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.availability.AvailabilityChangeEvent;
import org.springframework.boot.availability.ReadinessState;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.boot.logging.LogLevel;
import org.springframework.boot.logging.LoggerConfiguration;
import org.springframework.boot.logging.LoggingSystem;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.ApplicationContext;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.context.annotation.Import;
import org.springframework.http.ContentDisposition;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.web.method.HandlerMethod;
import org.springframework.web.servlet.handler.SimpleUrlHandlerMapping;
import org.springframework.web.servlet.mvc.method.annotation.HttpEntityMethodProcessor;
import org.springframework.web.servlet.mvc.method.annotation.RequestResponseBodyMethodProcessor;
import org.springframework.web.servlet.resource.CachingResourceResolver;
import org.springframework.web.servlet.resource.CachingResourceTransformer;
import org.springframework.web.servlet.resource.ResourceHttpRequestHandler;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Import(MutableClock.Beans.class)
@DirtiesContext
class EndToEndIT {

    private static final String USER = "em_user1";
    private static final String ADMIN = "em_admin";
    private static final String PASSWORD = "123456";

    // Seeded expense codes end at 12/2024 EX, so a 2024 clock makes Car Rental 13/2024 EX.
    private static final LocalDateTime JOURNEY_TIME = LocalDateTime.of(2024, 5, 23, 12, 0);

    private static final String RECEIPT_PNG_BASE64 =
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

    @TempDir
    static Path dir;

    @LocalServerPort
    private int port;

    @Autowired
    private MutableClock mutableClock;

    @Autowired
    private ApplicationContext context;

    @DynamicPropertySource
    static void database(DynamicPropertyRegistry registry) {
        TestDatabase.register(registry, () -> dir);
    }

    @BeforeEach
    void fixClock() {
        mutableClock.set(JOURNEY_TIME);
    }

    @Test
    @DisplayName("the built SPA is served uncached at the root and at a deep link, its hashed bundle cached for good")
    void servesSpaAtRootAndDeepLink() throws IOException {
        byte[] indexHtml = classpathIndexHtml();
        try (ApiClient anonymous = new ApiClient(port)) {
            for (String path : List.of("/", "/reports", "/assets/missing.js")) {
                ApiClient.Response response = expectStatus(anonymous.get(path), 200);
                assertThat(response.body()).as("body of GET %s", path).isEqualTo(indexHtml);
                assertThat(response.header("Cache-Control")).as("Cache-Control of GET %s", path).contains("no-store");
            }

            Matcher bundle = Pattern.compile("src=\"(/assets/[^\"]+\\.js)\"")
                    .matcher(new String(indexHtml, StandardCharsets.UTF_8));
            assertThat(bundle.find()).as("hashed bundle referenced by index.html").isTrue();
            ApiClient.Response asset = expectStatus(anonymous.get(bundle.group(1)), 200);
            assertThat(asset.body()).isEqualTo(classpathStatic(bundle.group(1)));
            assertThat(asset.header("Cache-Control")).isEqualTo("max-age=31536000, private, immutable");
            assertThat(asset.headerValues("Pragma")).isEmpty();
            assertThat(asset.headerValues("Expires")).isEmpty();

            int length = asset.body().length;
            ApiClient.Response unsatisfiable = expectStatus(anonymous.sendWithoutCsrf(
                    "GET", bundle.group(1), null, Map.of("Range", "bytes=" + length + "-")), 416);
            assertThat(unsatisfiable.header("Content-Range")).isEqualTo("bytes */" + length);
            assertThat(unsatisfiable.json().path("code").asText()).isEqualTo("REQUESTED_RANGE_NOT_SATISFIABLE");
            assertThat(unsatisfiable.header("Cache-Control")).contains("no-store").doesNotContain("immutable");
        }
    }

    @Test
    @DisplayName("distinct deep links each load the SPA while the resource chain keeps no per-path cache")
    void deepLinksResolveWithoutPerPathCache() throws IOException {
        byte[] indexHtml = classpathIndexHtml();
        try (ApiClient anonymous = new ApiClient(port)) {
            for (String path : List.of("/" + UUID.randomUUID(), "/reports/" + UUID.randomUUID(),
                    "/admin/reports/expense/" + UUID.randomUUID())) {
                ApiClient.Response response = expectStatus(anonymous.get(path), 200);
                assertThat(response.body()).as("body of GET %s", path).isEqualTo(indexHtml);
            }
        }

        Object spaHandler = context.getBean("resourceHandlerMapping", SimpleUrlHandlerMapping.class)
                .getUrlMap().get("/**");
        assertThat(spaHandler).isInstanceOf(ResourceHttpRequestHandler.class);
        ResourceHttpRequestHandler handler = (ResourceHttpRequestHandler) spaHandler;
        assertThat(handler.getResourceResolvers())
                .anySatisfy(resolver -> assertThat(resolver.getClass().getEnclosingClass())
                        .isEqualTo(SpaWebConfig.class))
                .doesNotHaveAnyElementsOfTypes(CachingResourceResolver.class);
        assertThat(handler.getResourceTransformers()).doesNotHaveAnyElementsOfTypes(CachingResourceTransformer.class);
    }

    @Test
    @DisplayName("a gzip client gets the hashed bundle and a large JSON body compressed to the same content")
    void compressesBundleAndLargeJsonForGzipClients() throws IOException {
        Map<String, String> acceptGzip = Map.of("Accept-Encoding", "gzip");
        Matcher bundle = Pattern.compile("src=\"(/assets/[^\"]+\\.js)\"")
                .matcher(new String(classpathIndexHtml(), StandardCharsets.UTF_8));
        assertThat(bundle.find()).as("hashed bundle referenced by index.html").isTrue();
        try (ApiClient anonymous = new ApiClient(port)) {
            ApiClient.Response asset = expectStatus(
                    anonymous.sendWithoutCsrf("GET", bundle.group(1), null, acceptGzip), 200);
            assertGzipped(asset);
            assertThat(gunzip(asset.body())).isEqualTo(classpathStatic(bundle.group(1)));
            assertThat(asset.header("Cache-Control")).isEqualTo("max-age=31536000, private, immutable");
        }

        try (ApiClient user = ApiClient.loggedIn(port, USER, PASSWORD)) {
            // The seeded list alone stays under 2 KB.
            for (int n = 1; n <= 6; n++) {
                expectStatus(user.postJson("/api/reports", newReport("Conference travel and lodging #" + n)), 201);
            }
            String listPath = "/api/reports?kind=expense";
            ApiClient.Response identity = expectStatus(user.get(listPath), 200);
            assertThat(identity.headerValues("Content-Encoding")).isEmpty();
            assertThat(identity.body().length).as("identity body above the 2 KB threshold").isGreaterThan(2048);
            ApiClient.Response compressed = expectStatus(user.sendWithoutCsrf("GET", listPath, null, acceptGzip), 200);
            assertGzipped(compressed);
            assertThat(ApiClient.MAPPER.readTree(gunzip(compressed.body()))).isEqualTo(identity.json());
        }
    }

    @Test
    @DisplayName("a report created, submitted and approved survives a restart that does not reseed")
    void approvedReportSurvivesRestartWithoutReseed(@TempDir Path journeyDir) {
        ConfigurableApplicationContext first = start(journeyDir, MutableClock.Beans.class);
        HikariDataSource firstPool;
        long reportsBefore;
        try (first) {
            first.getBean(MutableClock.class).set(JOURNEY_TIME);
            firstPool = first.getBean(HikariDataSource.class);
            int firstPort = localPort(first);
            try (ApiClient admin = ApiClient.loggedIn(firstPort, ADMIN, PASSWORD);
                    ApiClient user = ApiClient.loggedIn(firstPort, USER, PASSWORD)) {
                assertAdminDashboard(admin, 17, 15, "5.88");
                long carRentalId = createFillAndSubmitCarRental(user);
                assertAdminDashboard(admin, 18, 16, "5.56");

                ObjectNode decision = ApiClient.object();
                decision.put("accept", true);
                String decisionPath = "/api/reports/expense/" + carRentalId + "/decision";
                JsonNode decided = expectStatus(admin.postJson(decisionPath, decision), 200).json();
                assertThat(decided.path("status").asText()).isEqualTo("Approved");

                assertAdminDashboard(admin, 18, 15, "11.11");
            }
            reportsBefore = reportCount(first);
        }
        assertThat(first.isActive()).as("first application closed before the restart").isFalse();
        assertThat(firstPool.isClosed()).as("no pooled connection holds the H2 database open").isTrue();

        try (ConfigurableApplicationContext restarted = start(journeyDir)) {
            try (ApiClient user = ApiClient.loggedIn(localPort(restarted), USER, PASSWORD)) {
                JsonNode rows = expectStatus(user.get("/api/reports?kind=expense"), 200).json();
                List<String> carRentalCodes = StreamSupport.stream(rows.spliterator(), false)
                        .filter(row -> row.path("title").asText().equals("Car Rental"))
                        .map(row -> row.path("code").asText())
                        .toList();
                assertThat(carRentalCodes).containsExactly("13/2024 EX");
            }

            List<String> codes = Stream.concat(
                            restarted.getBean(ExpenseReportRepository.class).findAll().stream(),
                            restarted.getBean(EarningReportRepository.class).findAll().stream())
                    .map(ReportEntity::getCode)
                    .toList();
            assertThat(codes).containsOnlyOnce(seededCodes());
            // A second seed run would add the demo reports again on top of the existing rows.
            assertThat(reportCount(restarted)).isEqualTo(reportsBefore);
        }
    }

    @Test
    @DisplayName("one client's CSRF token is issued on 401, rotated at login, cleared at logout and checked on writes")
    void csrfTokenFollowsLoginAndLogout() {
        try (ApiClient client = new ApiClient(port)) {
            expectStatus(client.me(), 401);
            String anonymousToken = csrfCookie(client, "issued with the anonymous 401");

            expectStatus(client.login(USER, PASSWORD), 200);
            String firstLoginToken = csrfCookie(client, "after the first login");
            assertThat(firstLoginToken).as("token rotated by the first login").isNotEqualTo(anonymousToken);
            assertStaleAndMissingTokensRejected(client, anonymousToken);
            expectStatus(client.postJson("/api/reports", newReport("Taxi Rides")), 201);

            ApiClient.Response logout = expectStatus(client.logout(), 204);
            assertThat(logout.headerValues("Set-Cookie")).as("Set-Cookie headers of the logout response")
                    .anyMatch(cookie -> cookie.startsWith(ApiClient.CSRF_COOKIE + "=;")
                            && cookie.contains("Max-Age=0"));
            assertThat(client.cookie(ApiClient.CSRF_COOKIE)).as("CSRF cookie after logout").isEmpty();

            expectStatus(client.me(), 401);
            String refreshedToken = csrfCookie(client, "issued with the 401 after logout");
            assertThat(refreshedToken).as("token issued after logout").isNotIn(firstLoginToken, anonymousToken);

            expectStatus(client.login(USER, PASSWORD), 200);
            String secondLoginToken = csrfCookie(client, "after the second login");
            assertThat(secondLoginToken).as("token rotated by the second login")
                    .isNotIn(refreshedToken, firstLoginToken, anonymousToken);
            assertStaleAndMissingTokensRejected(client, firstLoginToken, refreshedToken);
            expectStatus(client.postJson("/api/reports", newReport("Parking Fees")), 201);
        }
    }

    static Stream<Arguments> invoiceDownloadKeepsUploadedFilename() {
        return Stream.of(
                arguments("receipt.png", "receipt.png"),
                arguments("a\"b.png", "a\\\"b.png"),
                arguments("a\\b.png", "a\\\\b.png"),
                arguments("reçu-€.png", "recu-_.png"),
                arguments("reçu été.png", "recu ete.png"),
                arguments("receipt\r\n.png", "receipt__.png"),
                arguments("receipt\t.png", "receipt_.png"));
    }

    @ParameterizedTest
    @MethodSource
    @DisplayName("an invoice downloads under the exact filename it was uploaded with, beside a plain ASCII fallback")
    void invoiceDownloadKeepsUploadedFilename(String filename, String quotedAsciiFilename) {
        try (ApiClient user = ApiClient.loggedIn(port, USER, PASSWORD)) {
            long reportId = expectStatus(user.postJson("/api/reports", newReport("Invoice names")), 201)
                    .json().path("id").asLong();
            ObjectNode line = ApiClient.object();
            line.put("expenseTypeId", 2);
            line.put("currencyId", 1);
            line.put("amount", new BigDecimal("10.00"));
            line.put("title", "Receipt");
            line.put("description", "");
            line.put("date", "2024-05-22");
            long lineId = expectStatus(user.postJson("/api/reports/expense/" + reportId + "/lines", line), 201)
                    .json().path("id").asLong();

            byte[] receipt = Base64.getDecoder().decode(RECEIPT_PNG_BASE64);
            String invoicePath = "/api/lines/expense/" + lineId + "/invoice";
            expectStatus(user.putFile(invoicePath, filename, "image/png", receipt), 204);

            ApiClient.Response download = expectStatus(user.get(invoicePath), 200);
            String header = download.header("Content-Disposition");
            assertThat(header).isNotNull().doesNotContain("\r", "\n");
            Matcher plainFilename = Pattern.compile("attachment; filename=\"((?:[^\"\\\\]|\\\\.)*)\"").matcher(header);
            assertThat(plainFilename.lookingAt()).as(header).isTrue();
            assertThat(plainFilename.group(1)).as(header)
                    .isEqualTo(quotedAsciiFilename).matches("[ -~]*").doesNotContain("=?");
            ContentDisposition disposition = ContentDisposition.parse(header);
            assertThat(disposition.isAttachment()).as(header).isTrue();
            assertThat(disposition.getFilename()).as(header).isEqualTo(filename);
            assertThat(download.body()).isEqualTo(receipt);
        }
    }

    @Test
    @DisplayName("until the application is ready, API calls get 503 while the SPA is still served")
    void apiAnswers503UntilReady() throws IOException {
        byte[] indexHtml = classpathIndexHtml();
        try (ApiClient client = new ApiClient(port)) {
            AvailabilityChangeEvent.publish(context, ReadinessState.REFUSING_TRAFFIC);
            try {
                assertStarting(client.me());
                assertThat(client.cookie(ApiClient.CSRF_COOKIE)).as("CSRF cookie issued with the 503").isPresent();
                assertStarting(client.login(USER, PASSWORD));
                ObjectNode credentials = ApiClient.object();
                credentials.put("username", USER);
                credentials.put("password", PASSWORD);
                assertStarting(client.sendWithoutCsrf("POST", "/api/auth/login", credentials));
                assertThat(expectStatus(client.get("/"), 200).body()).isEqualTo(indexHtml);
            } finally {
                AvailabilityChangeEvent.publish(context, ReadinessState.ACCEPTING_TRAFFIC);
            }
            expectStatus(client.login(USER, PASSWORD), 200);
        }
    }

    @Test
    @ExtendWith(OutputCaptureExtension.class)
    @DisplayName("request bodies, the records that echo them and invoice bytes stay out of the TRACE log")
    void requestBodiesAndInvoiceBytesStayOutOfTraceLog(@Autowired LoggingSystem loggingSystem,
            CapturedOutput output) {
        String marker = "BODY_MARKER_" + UUID.randomUUID().toString().replace("-", "");
        Map<String, LogLevel> configuredLevels = new LinkedHashMap<>();
        try {
            for (String logger : List.of("org.springframework.web", RequestResponseBodyMethodProcessor.class.getName(),
                    HttpEntityMethodProcessor.class.getName(), HandlerMethod.class.getName())) {
                LoggerConfiguration configuration = loggingSystem.getLoggerConfiguration(logger);
                configuredLevels.put(logger, configuration == null ? null : configuration.getConfiguredLevel());
                loggingSystem.setLogLevel(logger, LogLevel.TRACE);
            }
            int logStart = output.getAll().length();

            String reportPath;
            try (ApiClient user = ApiClient.loggedIn(port, USER, PASSWORD)) {
                reportPath = "/api/reports/expense/" + expectStatus(
                        user.postJson("/api/reports", newReport(marker + "-T")), 201).json().path("id").asLong();
                ObjectNode rename = ApiClient.object();
                rename.put("title", marker + "-R");
                expectStatus(user.putJson(reportPath, rename), 200);
                ObjectNode unknownKind = ApiClient.object();
                unknownKind.put("kind", marker + "-K");
                unknownKind.put("title", "x");
                expectStatus(user.postJson("/api/reports", unknownKind), 422);

                ObjectNode line = ApiClient.object();
                line.put("expenseTypeId", 2);
                line.put("currencyId", 1);
                line.put("amount", new BigDecimal("4417.41"));
                line.put("title", marker + "-L");
                line.put("description", marker + "-D\r\n2026-01-01T00:00:00.000Z ERROR 1 --- [main] "
                        + marker + ".Forged : forged");
                line.put("date", "2024-05-22");
                long lineId = expectStatus(user.postJson(reportPath + "/lines", line), 201).json().path("id").asLong();
                line.put("amount", new BigDecimal("4418.81"));
                expectStatus(user.putJson("/api/lines/expense/" + lineId, line), 200);

                ObjectNode mileage = ApiClient.object();
                mileage.put("expenseTypeId", 3);
                mileage.put("kilometers", new BigDecimal("4419.19"));
                mileage.put("title", marker + "-M");
                mileage.put("description", "");
                mileage.put("date", "2024-05-22");
                expectStatus(user.postJson(reportPath + "/lines", mileage), 201);

                byte[] receipt = Base64.getDecoder().decode(RECEIPT_PNG_BASE64);
                byte[] invoice = ByteBuffer.allocate(receipt.length + marker.length())
                        .put(receipt).put(marker.getBytes(StandardCharsets.US_ASCII)).array();
                String invoicePath = "/api/lines/expense/" + lineId + "/invoice";
                expectStatus(user.putFile(invoicePath, "receipt.png", "image/png", invoice), 204);
                assertThat(expectStatus(user.get(invoicePath), 200).body()).isEqualTo(invoice);

                expectStatus(user.get(reportPath), 200);
                expectStatus(user.get("/api/dashboard/user"), 200);
                expectStatus(user.post(reportPath + "/submit"), 200);
            }

            try (ApiClient admin = ApiClient.loggedIn(port, ADMIN, PASSWORD)) {
                ObjectNode decision = ApiClient.object();
                decision.put("accept", true);
                expectStatus(admin.postJson(reportPath + "/decision", decision), 200);

                ObjectNode post = ApiClient.object();
                post.put("title", marker + "-B");
                post.put("description", marker + "-P");
                long postId = expectStatus(admin.postJson("/api/blog", post), 201).json().path("id").asLong();
                post.put("title", marker + "-B2");
                post.put("description", marker + "-P2");
                expectStatus(admin.putJson("/api/blog/" + postId, post), 200);
                expectStatus(admin.get("/api/blog"), 200);
            }

            assertThat(output.getAll().substring(logStart))
                    .contains("CreateReportRequest[", "LineView[", "DatedAmount[")
                    .doesNotContain(marker, "4417.41", "4418.81", "4419.19", "-119, 80, 78, 71");
        } finally {
            configuredLevels.forEach(loggingSystem::setLogLevel);
        }
    }

    @Test
    @DisplayName("remember me and logout use the configured session cookie name and path")
    void rememberMeAndLogoutFollowConfiguredSessionCookie(@TempDir Path cookieDir) {
        String sessionCookie = "EMSID";
        ConfigurableApplicationContext configured = new SpringApplicationBuilder(ExpensesManagerApplication.class)
                .run("--server.port=0", TestDatabase.argument(cookieDir),
                        "--server.servlet.session.cookie.name=" + sessionCookie,
                        "--server.servlet.session.cookie.path=/api");
        try {
            int configuredPort = configured.getEnvironment().getRequiredProperty("local.server.port", Integer.class);
            try (ApiClient browser = new ApiClient(configuredPort);
                    ApiClient restartedBrowser = new ApiClient(configuredPort)) {
                ApiClient.Response login = expectStatus(browser.login(USER, PASSWORD, true), 200);
                assertThat(login.headerValues("Set-Cookie"))
                        .noneMatch(header -> header.startsWith(ApiClient.SESSION_COOKIE + "="));
                List<String> remembered = lastSetCookie(login, sessionCookie);
                assertThat(remembered).contains("Max-Age=" + Duration.ofDays(30).toSeconds(), "Path=/api", "HttpOnly",
                        "SameSite=Lax");

                // A browser restart keeps only the cookie that carries a Max-Age.
                JsonNode me = expectStatus(restartedBrowser.sendWithoutCsrf("GET", "/api/auth/me", null,
                        Map.of("Cookie", remembered.getFirst())), 200).json();
                assertThat(me.path("username").asText()).isEqualTo(USER);

                ApiClient.Response logout = expectStatus(browser.logout(), 204);
                assertThat(lastSetCookie(logout, sessionCookie))
                        .startsWith(sessionCookie + "=", "Max-Age=0")
                        .contains("Path=/api");
            }
        } finally {
            configured.close();
        }
    }

    static Stream<Arguments> invalidLineWriteListsEveryViolatedRule() {
        return Stream.of(
                arguments("", null, new FieldViolation("title", LegacyMessages.FIELD_REQUIRED)),
                arguments("Title", "d".repeat(1501),
                        new FieldViolation("description", LegacyMessages.MAX_LENGTH_1500)));
    }

    @ParameterizedTest
    @MethodSource
    @DisplayName("a line create or update answers one 422 listing the text error and every other violated rule")
    void invalidLineWriteListsEveryViolatedRule(String title, String description, FieldViolation textError) {
        try (ApiClient user = ApiClient.loggedIn(port, USER, PASSWORD)) {
            String reportPath = "/api/reports/expense/" + expectStatus(
                    user.postJson("/api/reports", newReport("Line errors")), 201).json().path("id").asLong();
            ObjectNode valid = ApiClient.object();
            valid.put("expenseTypeId", 2);
            valid.put("currencyId", 1);
            valid.put("amount", new BigDecimal("10.00"));
            valid.put("title", "Valid line");
            valid.put("description", "");
            valid.put("date", "2024-05-22");
            long lineId = expectStatus(user.postJson(reportPath + "/lines", valid), 201).json().path("id").asLong();

            ObjectNode invalid = ApiClient.object();
            invalid.put("expenseTypeId", 99);
            invalid.put("currencyId", 99);
            invalid.put("amount", 0);
            invalid.put("title", title);
            invalid.put("description", description);
            invalid.put("date", "2099-01-01");
            for (ApiClient.Response response : List.of(user.postJson(reportPath + "/lines", invalid),
                    user.putJson("/api/lines/expense/" + lineId, invalid))) {
                JsonNode body = expectStatus(response, 422).json();
                assertThat(body.path("code").asText()).isEqualTo(ApiException.VALIDATION_FAILED);
                assertThat(StreamSupport.stream(body.path("fieldErrors").spliterator(), false)
                        .map(error -> new FieldViolation(error.path("field").asText(), error.path("message").asText())))
                        .containsExactlyInAnyOrder(textError,
                                new FieldViolation("date", LegacyMessages.DATE_PAST_OR_CURRENT),
                                new FieldViolation("expenseTypeId", LegacyMessages.FIELD_REQUIRED),
                                new FieldViolation("currencyId", LegacyMessages.FIELD_REQUIRED),
                                new FieldViolation("amount", LegacyMessages.MUST_SET_AMOUNT));
            }

            JsonNode lines = expectStatus(user.get(reportPath), 200).json().path("lines");
            assertThat(lines.size()).isEqualTo(1);
            assertThat(lines.path(0).path("title").asText()).isEqualTo("Valid line");
        }
    }

    private static void assertStarting(ApiClient.Response response) {
        expectStatus(response, 503);
        assertThat(response.header("Retry-After")).isEqualTo("1");
        assertThat(response.header("X-Content-Type-Options")).isEqualTo("nosniff");
        assertThat(response.header("Cache-Control")).contains("no-store");
        assertThat(response.header("Content-Type")).startsWith("application/json");
        JsonNode body = response.json();
        assertThat(body.path("status").asInt()).isEqualTo(503);
        assertThat(body.path("code").asText()).isEqualTo(ApiException.SERVICE_UNAVAILABLE);
        assertThat(body.path("message").asText()).isEqualTo(LegacyMessages.STARTING);
        assertThat(body.has("fieldErrors")).as("fieldErrors outside 422").isFalse();
    }

    private static ConfigurableApplicationContext start(Path databaseDir, Class<?>... extraSources) {
        // Command-line arguments outrank application.properties; builder properties would only be defaults.
        return new SpringApplicationBuilder(ExpensesManagerApplication.class)
                .sources(extraSources)
                .run("--server.port=0", TestDatabase.argument(databaseDir));
    }

    private static int localPort(ApplicationContext application) {
        return application.getEnvironment().getRequiredProperty("local.server.port", Integer.class);
    }

    private static long reportCount(ApplicationContext application) {
        return application.getBean(ExpenseReportRepository.class).count()
                + application.getBean(EarningReportRepository.class).count();
    }

    private static long createFillAndSubmitCarRental(ApiClient user) {
        JsonNode report = expectStatus(user.postJson("/api/reports", newReport("Car Rental")), 201).json();
        assertThat(report.path("code").asText()).isEqualTo("13/2024 EX");
        assertThat(report.path("status").asText()).isEqualTo("Draft");
        assertThat(report.path("id").asLong()).isPositive();
        long reportId = report.path("id").asLong();

        ObjectNode line = ApiClient.object();
        line.put("expenseTypeId", 2);
        line.put("currencyId", 1);
        line.put("amount", new BigDecimal("120.00"));
        line.put("title", "Car rental");
        line.put("description", "");
        line.put("date", "2024-05-22");
        JsonNode createdLine =
                expectStatus(user.postJson("/api/reports/expense/" + reportId + "/lines", line), 201).json();
        assertThat(createdLine.path("amountInEuros").decimalValue()).isEqualByComparingTo("120.00");

        byte[] receipt = Base64.getDecoder().decode(RECEIPT_PNG_BASE64);
        String invoicePath = "/api/lines/expense/" + createdLine.path("id").asLong() + "/invoice";
        expectStatus(user.putFile(invoicePath, "receipt.png", "image/png", receipt), 204);

        ApiClient.Response download = expectStatus(user.get(invoicePath), 200);
        assertThat(download.body()).isEqualTo(receipt);
        assertThat(download.header("Content-Type")).isEqualTo("image/png");
        assertThat(download.header("Content-Disposition")).startsWith("attachment").contains("receipt.png");

        JsonNode submitted = expectStatus(user.post("/api/reports/expense/" + reportId + "/submit"), 200).json();
        assertThat(submitted.path("status").asText()).isEqualTo("Submitted");
        return reportId;
    }

    private static String csrfCookie(ApiClient client, String moment) {
        Optional<String> token = client.cookie(ApiClient.CSRF_COOKIE);
        assertThat(token).as("CSRF cookie %s", moment).isPresent();
        return token.orElseThrow();
    }

    private static void assertStaleAndMissingTokensRejected(ApiClient client, String... staleTokens) {
        String currentToken = csrfCookie(client, "before the rejected writes");
        for (String staleToken : staleTokens) {
            assertForbidden(client.sendWithoutCsrf("POST", "/api/reports", newReport("Stale token"),
                    Map.of(ApiClient.CSRF_HEADER, staleToken)));
        }
        assertForbidden(client.sendWithoutCsrf("POST", "/api/reports", newReport("Missing token")));
        assertThat(client.cookie(ApiClient.CSRF_COOKIE)).as("CSRF cookie after the rejected writes")
                .hasValue(currentToken);
    }

    private static void assertForbidden(ApiClient.Response response) {
        expectStatus(response, 403);
        assertThat(response.json().path("code").asText()).isEqualTo(ApiException.FORBIDDEN);
    }

    private static ApiClient.Response expectStatus(ApiClient.Response response, int status) {
        assertThat(response.status()).as("%s", response).isEqualTo(status);
        return response;
    }

    private static void assertGzipped(ApiClient.Response response) {
        assertThat(response.header("Content-Encoding")).isEqualTo("gzip");
        assertThat(String.join(", ", response.headerValues("Vary"))).containsIgnoringCase("accept-encoding");
    }

    private static byte[] gunzip(byte[] body) throws IOException {
        try (InputStream in = new GZIPInputStream(new ByteArrayInputStream(body))) {
            return in.readAllBytes();
        }
    }

    // A browser stores the last Set-Cookie of a name, so that one decides what it keeps.
    private static List<String> lastSetCookie(ApiClient.Response response, String name) {
        List<String> headers = response.headerValues("Set-Cookie").stream()
                .filter(header -> header.startsWith(name + "="))
                .toList();
        assertThat(headers).as("Set-Cookie %s", name).isNotEmpty();
        return List.of(headers.getLast().split("; "));
    }

    private static void assertAdminDashboard(ApiClient admin, long totalReports, long waiting, String approvedRate) {
        JsonNode dashboard = expectStatus(admin.get("/api/dashboard/admin"), 200).json();
        assertThat(dashboard.path("totalReports").asLong()).isEqualTo(totalReports);
        assertThat(dashboard.path("waiting").asLong()).isEqualTo(waiting);
        assertThat(dashboard.path("approvedRate").decimalValue()).isEqualByComparingTo(approvedRate);
    }

    private static ObjectNode newReport(String title) {
        ObjectNode body = ApiClient.object();
        body.put("kind", "expense");
        body.put("title", title);
        return body;
    }

    private static String[] seededCodes() {
        return Stream.concat(
                        IntStream.rangeClosed(1, 12).mapToObj(n -> n + "/2024 EX"),
                        IntStream.rangeClosed(1, 10).mapToObj(n -> n + "/2024 EA"))
                .toArray(String[]::new);
    }

    private static byte[] classpathIndexHtml() throws IOException {
        return classpathStatic("/index.html");
    }

    private static byte[] classpathStatic(String path) throws IOException {
        try (InputStream in = EndToEndIT.class.getResourceAsStream("/static" + path)) {
            assertThat(in).as("built SPA file at classpath:/static%s", path).isNotNull();
            return in.readAllBytes();
        }
    }
}
