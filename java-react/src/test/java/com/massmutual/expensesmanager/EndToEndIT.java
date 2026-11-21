package com.massmutual.expensesmanager;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.io.InputStream;
import java.math.BigDecimal;
import java.nio.file.Path;
import java.time.LocalDateTime;
import java.util.Base64;
import java.util.List;
import java.util.stream.IntStream;
import java.util.stream.Stream;
import java.util.stream.StreamSupport;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.massmutual.expensesmanager.domain.ReportEntity;
import com.massmutual.expensesmanager.repository.EarningReportRepository;
import com.massmutual.expensesmanager.repository.ExpenseReportRepository;
import com.massmutual.expensesmanager.support.ApiClient;
import com.massmutual.expensesmanager.support.MutableClock;
import com.massmutual.expensesmanager.support.TestDatabase;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.MethodOrderer;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestMethodOrder;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.context.annotation.Import;
import org.springframework.http.ContentDisposition;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Import(MutableClock.Beans.class)
@DirtiesContext
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
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

    private static Long carRentalId;

    @LocalServerPort
    private int port;

    @Autowired
    private MutableClock mutableClock;

    @Autowired
    private ExpenseReportRepository expenseReports;

    @Autowired
    private EarningReportRepository earningReports;

    @DynamicPropertySource
    static void database(DynamicPropertyRegistry registry) {
        TestDatabase.register(registry, () -> dir);
    }

    @BeforeEach
    void fixClock() {
        mutableClock.set(JOURNEY_TIME);
    }

    @Test
    @Order(1)
    @DisplayName("the built SPA is served at the root and at a deep link")
    void servesSpaAtRootAndDeepLink() throws IOException {
        byte[] indexHtml = classpathIndexHtml();
        try (ApiClient anonymous = new ApiClient(port)) {
            for (String path : List.of("/", "/reports")) {
                ApiClient.Response response = expectStatus(anonymous.get(path), 200);
                assertThat(response.body()).as("body of GET %s", path).isEqualTo(indexHtml);
            }
        }
    }

    @Test
    @Order(2)
    @DisplayName("a user creates a report, adds a line with an invoice and submits it")
    void userCreatesFillsAndSubmitsReport() {
        try (ApiClient user = ApiClient.loggedIn(port, USER, PASSWORD)) {
            JsonNode report = expectStatus(user.postJson("/api/reports", newReport("Car Rental")), 201).json();
            assertThat(report.path("code").asText()).isEqualTo("13/2024 EX");
            assertThat(report.path("status").asText()).isEqualTo("Draft");
            assertThat(report.path("id").asLong()).isPositive();
            carRentalId = report.path("id").asLong();

            ObjectNode line = ApiClient.object();
            line.put("expenseTypeId", 2);
            line.put("currencyId", 1);
            line.put("amount", new BigDecimal("120.00"));
            line.put("title", "Car rental");
            line.put("description", "");
            line.put("date", "2024-05-22");
            JsonNode createdLine =
                    expectStatus(user.postJson("/api/reports/expense/" + carRentalId + "/lines", line), 201).json();
            assertThat(createdLine.path("amountInEuros").decimalValue()).isEqualByComparingTo("120.00");

            byte[] receipt = Base64.getDecoder().decode(RECEIPT_PNG_BASE64);
            String invoicePath = "/api/lines/expense/" + createdLine.path("id").asLong() + "/invoice";
            expectStatus(user.putFile(invoicePath, "receipt.png", "image/png", receipt), 204);

            ApiClient.Response download = expectStatus(user.get(invoicePath), 200);
            assertThat(download.body()).isEqualTo(receipt);
            assertThat(download.header("Content-Type")).isEqualTo("image/png");
            assertThat(download.header("Content-Disposition")).startsWith("attachment").contains("receipt.png");

            JsonNode submitted = expectStatus(user.post("/api/reports/expense/" + carRentalId + "/submit"), 200).json();
            assertThat(submitted.path("status").asText()).isEqualTo("Submitted");
        }
    }

    @Test
    @Order(3)
    @DisplayName("an administrator approves the submitted report and the counters follow")
    void adminApprovesSubmittedReport() {
        long reportId = carRentalId();
        try (ApiClient admin = ApiClient.loggedIn(port, ADMIN, PASSWORD)) {
            assertAdminDashboard(admin, 18, 16, "5.56");

            ObjectNode decision = ApiClient.object();
            decision.put("accept", true);
            String decisionPath = "/api/reports/expense/" + reportId + "/decision";
            JsonNode decided = expectStatus(admin.postJson(decisionPath, decision), 200).json();
            assertThat(decided.path("status").asText()).isEqualTo("Approved");

            assertAdminDashboard(admin, 18, 15, "11.11");
        }
    }

    @Test
    @Order(4)
    @DisplayName("one client keeps writing across login, logout and a second login")
    void csrfTokenFollowsLoginAndLogout() {
        try (ApiClient client = new ApiClient(port)) {
            expectStatus(client.login(USER, PASSWORD), 200);
            expectStatus(client.postJson("/api/reports", newReport("Taxi Rides")), 201);
            expectStatus(client.logout(), 204);

            expectStatus(client.login(USER, PASSWORD), 200);
            expectStatus(client.postJson("/api/reports", newReport("Parking Fees")), 201);
        }
    }

    @Test
    @Order(5)
    @DisplayName("restart keeps data and does not reseed")
    void restartKeepsDataAndDoesNotReseed() {
        long reportsBefore = expenseReports.count() + earningReports.count();

        // Command-line arguments outrank application.properties; builder properties would only be defaults.
        ConfigurableApplicationContext restarted = new SpringApplicationBuilder(ExpensesManagerApplication.class)
                .run("--server.port=0", TestDatabase.argument(dir));
        try {
            int restartedPort = restarted.getEnvironment().getRequiredProperty("local.server.port", Integer.class);
            try (ApiClient user = ApiClient.loggedIn(restartedPort, USER, PASSWORD)) {
                JsonNode rows = expectStatus(user.get("/api/reports?kind=expense"), 200).json();
                List<String> carRentalCodes = StreamSupport.stream(rows.spliterator(), false)
                        .filter(row -> row.path("title").asText().equals("Car Rental"))
                        .map(row -> row.path("code").asText())
                        .toList();
                assertThat(carRentalCodes).containsExactly("13/2024 EX");
            }

            ExpenseReportRepository restartedExpenses = restarted.getBean(ExpenseReportRepository.class);
            EarningReportRepository restartedEarnings = restarted.getBean(EarningReportRepository.class);
            List<String> codes = Stream.concat(
                            restartedExpenses.findAll().stream(), restartedEarnings.findAll().stream())
                    .map(ReportEntity::getCode)
                    .toList();
            assertThat(codes).containsOnlyOnce(seededCodes());
            // A second seed run would add the demo reports again on top of the existing rows.
            assertThat(restartedExpenses.count() + restartedEarnings.count()).isEqualTo(reportsBefore);
        } finally {
            restarted.close();
        }
    }

    @ParameterizedTest
    @Order(6)
    @ValueSource(strings = {"receipt.png", "reçu-€.png", "a\"b.png", "a\\b.png", "receipt\r\n.png", "receipt\t.png"})
    @DisplayName("an invoice downloads under the exact filename it was uploaded with")
    void invoiceDownloadKeepsUploadedFilename(String filename) {
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
            ContentDisposition disposition = ContentDisposition.parse(header);
            assertThat(disposition.isAttachment()).as(header).isTrue();
            assertThat(disposition.getFilename()).as(header).isEqualTo(filename);
            assertThat(download.body()).isEqualTo(receipt);
        }
    }

    private static long carRentalId() {
        assertThat(carRentalId).as("Car Rental report id from the user journey").isNotNull();
        return carRentalId;
    }

    private static ApiClient.Response expectStatus(ApiClient.Response response, int status) {
        assertThat(response.status()).as("%s", response).isEqualTo(status);
        return response;
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
        try (InputStream in = EndToEndIT.class.getResourceAsStream("/static/index.html")) {
            assertThat(in).as("built SPA at classpath:/static/index.html").isNotNull();
            return in.readAllBytes();
        }
    }
}
