package com.massmutual.expensesmanager;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.fail;

import com.fasterxml.jackson.databind.JsonNode;
import com.massmutual.expensesmanager.support.ApiClient;
import com.massmutual.expensesmanager.support.TestDatabase;
import java.math.BigDecimal;
import java.nio.file.Path;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@DirtiesContext
class ScreenshotFiguresIT {

    private static final String PASSWORD = "123456";
    private static final String JOHN_SMITH = "John Smith";
    private static final String MICHAEL_DAVIS = "Michael Davis";
    private static final String SARAH_LEE = "Sarah Lee";

    private static final List<ExpectedReport> USER_EXPENSE_REPORTS = List.of(
            new ExpectedReport("12/2024 EX", "London Trip", "Draft", "42.00",
                    LocalDateTime.of(2024, 5, 23, 15, 18, 38), JOHN_SMITH),
            new ExpectedReport("11/2024 EX", "Hotel", "Draft", "0.00", atNine(2024, 4, 15), JOHN_SMITH),
            new ExpectedReport("10/2024 EX", "Home Office", "Draft", "0.00", atNine(2024, 4, 10), JOHN_SMITH),
            new ExpectedReport("9/2024 EX", "Business Trip Expenses", "Approved", "500.00",
                    atNine(2024, 4, 1), JOHN_SMITH),
            new ExpectedReport("8/2024 EX", "Office Supplies Purchase", "Declined", "80.00",
                    atNine(2024, 3, 28), JOHN_SMITH),
            new ExpectedReport("3/2024 EX", "Transportation Expenses", "Submitted", "50.00",
                    atNine(2024, 3, 9), JOHN_SMITH),
            new ExpectedReport("2/2024 EX", "Business Travel Expenses", "Submitted", "600.00",
                    atNine(2024, 3, 5), JOHN_SMITH),
            new ExpectedReport("1/2024 EX", "Client Meetings Expenses", "Submitted", "137.05",
                    atNine(2024, 3, 2), JOHN_SMITH));

    private static final List<ExpectedReport> USER_EARNING_REPORTS = List.of(
            new ExpectedReport("10/2024 EA", "Sales Commission", "Submitted", "1000.00",
                    atNine(2024, 4, 5), JOHN_SMITH),
            new ExpectedReport("9/2024 EA", "Consulting Fees", "Submitted", "500.00", atNine(2024, 4, 1), JOHN_SMITH),
            new ExpectedReport("4/2024 EA", "Miscellaneous Income", "Draft", "900.00", atNine(2024, 3, 9), JOHN_SMITH),
            new ExpectedReport("3/2024 EA", "Service Income", "Draft", "0.00", atNine(2024, 3, 5), JOHN_SMITH),
            new ExpectedReport("2/2024 EA", "Investment Income", "Submitted", "200.00",
                    atNine(2024, 3, 3), JOHN_SMITH),
            new ExpectedReport("1/2024 EA", "Salary Payments", "Submitted", "3000.00",
                    atNine(2024, 3, 1), JOHN_SMITH));

    private static final List<String> ADMIN_EXPENSE_CODES = List.of(
            "9/2024 EX", "8/2024 EX", "7/2024 EX", "6/2024 EX", "5/2024 EX",
            "4/2024 EX", "3/2024 EX", "2/2024 EX", "1/2024 EX");

    private static final List<ExpectedReport> ADMIN_VISIBLE_EXPENSE_REPORTS = List.of(
            new ExpectedReport("9/2024 EX", "Business Trip Expenses", "Approved", "500.00",
                    atNine(2024, 4, 1), JOHN_SMITH),
            new ExpectedReport("8/2024 EX", "Office Supplies Purchase", "Declined", "80.00",
                    atNine(2024, 3, 28), JOHN_SMITH),
            new ExpectedReport("7/2024 EX", "Household Expenses", "Submitted", "250.00",
                    atNine(2024, 4, 1), MICHAEL_DAVIS),
            new ExpectedReport("6/2024 EX", "Educational Expenses", "Submitted", "200.00",
                    atNine(2024, 3, 23), SARAH_LEE));

    @TempDir
    static Path dir;

    @DynamicPropertySource
    static void database(DynamicPropertyRegistry registry) {
        TestDatabase.register(registry, () -> dir);
    }

    @LocalServerPort
    int port;

    private final List<ApiClient> clients = new ArrayList<>();
    private ApiClient user;
    private ApiClient admin;

    @BeforeEach
    void signIn() {
        user = signedIn("em_user1");
        admin = signedIn("em_admin");
    }

    @AfterEach
    void closeClients() {
        clients.forEach(ApiClient::close);
        clients.clear();
    }

    @Test
    @DisplayName("User_View_Dashboard.png: balance, month cards, type shares and report status summary")
    void userDashboardMatchesScreenshot() {
        JsonNode dashboard = getOk(user, "/api/dashboard/user");

        assertDecimal(dashboard.path("balance"), "3412.95", "balance");
        assertDecimal(dashboard.path("currentMonthSpent"), "0.00", "currentMonthSpent");
        assertDecimal(dashboard.path("lastMonthSpent"), "500.00", "lastMonthSpent");
        assertDecimal(dashboard.path("monthChangePercent"), "100.00", "monthChangePercent");
        assertDecimal(dashboard.path("currentMonthEarnings"), "0.00", "currentMonthEarnings");
        assertPeriod(dashboard.path("currentMonth"), LocalDate.of(2024, 5, 1), LocalDate.of(2024, 5, 31),
                "currentMonth");
        assertPeriod(dashboard.path("lastMonth"), LocalDate.of(2024, 4, 1), LocalDate.of(2024, 4, 30),
                "lastMonth");

        JsonNode expenseShares = dashboard.path("expenseTypeShares");
        assertThat(labels(expenseShares)).as("expenseTypeShares labels")
                .containsExactly("Travel", "Restaurant", "Other", "Kilometers");
        assertShare(expenseShares.get(0), "69.93", "900.00", 3);
        assertShare(expenseShares.get(1), "25.64", "330.00", 3);
        assertShare(expenseShares.get(2), "3.88", "50.00", 2);
        assertShare(expenseShares.get(3), "0.55", "7.05", 1);

        JsonNode earningShares = dashboard.path("earningTypeShares");
        assertThat(labels(earningShares)).as("earningTypeShares labels, one per donut segment")
                .containsExactly("Salary", "Service", "Investment");
        assertTypeTotal(earningShares.get(0), "4000.00", 2);
        assertTypeTotal(earningShares.get(1), "500.00", 1);
        assertTypeTotal(earningShares.get(2), "200.00", 1);

        JsonNode statusCounts = dashboard.path("statusCounts");
        assertCount(statusCounts.path("draft"), 5, "statusCounts.draft");
        assertCount(statusCounts.path("submitted"), 7, "statusCounts.submitted");
        assertCount(statusCounts.path("approved"), 1, "statusCounts.approved");
        assertCount(statusCounts.path("declined"), 1, "statusCounts.declined");

        JsonNode draftBanner = dashboard.path("draftBanner");
        assertThat(draftBanner.isBoolean()).as("draftBanner is a boolean: %s", draftBanner).isTrue();
        assertThat(draftBanner.booleanValue()).as("draftBanner").isTrue();
    }

    @Test
    @DisplayName("User_View_New_Report.png: John Smith's expense reports")
    void userExpenseReportsMatchScreenshot() {
        assertReports(getOk(user, "/api/reports?kind=expense"), USER_EXPENSE_REPORTS);
    }

    @Test
    @DisplayName("User_View_Report_List.png: John Smith's earning reports and the expanded 9/2024 EA row")
    void userEarningReportsMatchScreenshot() {
        JsonNode reports = getOk(user, "/api/reports?kind=earning");
        assertReports(reports, USER_EARNING_REPORTS);

        JsonNode detail = getOk(user, "/api/reports/earning/" + id(reports, "9/2024 EA"));
        assertThat(detail.path("lines").size()).as("9/2024 EA line count").isEqualTo(1);
        assertLine(line(detail, "Consulting Service for Client A"), LocalDate.of(2024, 3, 28),
                "Fee earned for providing consulting services to Client A.", "Service", "500.00");
    }

    @Test
    @DisplayName("Admin_View_Report_List.png: administrator counters and the non-Draft expense reports")
    void adminDashboardAndExpenseReportsMatchScreenshot() {
        JsonNode dashboard = getOk(admin, "/api/dashboard/admin");
        assertCount(dashboard.path("totalReports"), 17, "totalReports");
        assertCount(dashboard.path("waiting"), 15, "waiting");
        assertDecimal(dashboard.path("approvedRate"), "5.88", "approvedRate");

        JsonNode reports = getOk(admin, "/api/reports?kind=expense");
        assertThat(codes(reports)).as("administrator expense report codes")
                .containsExactlyElementsOf(ADMIN_EXPENSE_CODES);
        ADMIN_VISIBLE_EXPENSE_REPORTS.forEach(expected -> assertReport(report(reports, expected.code()), expected));
    }

    @Test
    @DisplayName("Admin_View_Report_Details.png: lines of 9/2024 EX as the administrator sees them")
    void adminReportDetailMatchesScreenshot() {
        JsonNode reports = getOk(admin, "/api/reports?kind=expense");
        JsonNode detail = getOk(admin, "/api/reports/expense/" + id(reports, "9/2024 EX"));

        assertText(detail.path("code"), "9/2024 EX", "9/2024 EX code");
        assertText(detail.path("status"), "Approved", "9/2024 EX status");
        assertDecimal(detail.path("totalEur"), "500.00", "9/2024 EX totalEur");
        assertThat(detail.path("lines").size()).as("9/2024 EX line count").isEqualTo(2);

        JsonNode dining = line(detail, "Dining Expenses");
        assertLine(dining, LocalDate.of(2024, 4, 2), "Meals during the business trip.", "Restaurant", "200.00");
        assertDecimal(dining.path("vat"), "46.00", "Dining Expenses vat");
        JsonNode invoice = dining.path("invoice");
        assertThat(invoice.isNull() || invoice.isMissingNode())
                .as("Dining Expenses has no invoice: %s", invoice).isTrue();

        assertLine(line(detail, "Hotel Accommodation"), LocalDate.of(2024, 4, 2),
                "Stay at a business hotel during a trip.", "Travel", "300.00");
    }

    @Test
    @DisplayName("User_View_Report_Details.png and User_View_New_Expense_Detail.png: the 12/2024 EX Draft")
    void userDraftReportDetailMatchesScreenshot() {
        // Drafts never reach the administrator's list, so the owner reads this one.
        JsonNode reports = getOk(user, "/api/reports?kind=expense");
        JsonNode detail = getOk(user, "/api/reports/expense/" + id(reports, "12/2024 EX"));

        assertText(detail.path("code"), "12/2024 EX", "12/2024 EX code");
        assertText(detail.path("title"), "London Trip", "12/2024 EX title");
        assertText(detail.path("status"), "Draft", "12/2024 EX status");
        assertText(detail.path("createdByName"), JOHN_SMITH, "12/2024 EX createdByName");
        assertDateTime(detail.path("createdOn"), LocalDateTime.of(2024, 5, 23, 15, 18, 38), "12/2024 EX createdOn");
        assertDecimal(detail.path("totalEur"), "42.00", "12/2024 EX totalEur");
        assertThat(detail.path("lines").size()).as("12/2024 EX line count").isEqualTo(1);

        JsonNode flight = line(detail, "Flight tickets");
        assertLine(flight, LocalDate.of(2024, 5, 21), "Tickets for flight to London", "Travel", "42.00");
        assertDecimal(flight.path("vat"), "9.66", "Flight tickets vat");
    }

    private ApiClient signedIn(String username) {
        ApiClient client = new ApiClient(port);
        clients.add(client);
        ApiClient.Response login = client.login(username, PASSWORD);
        assertThat(login.status()).as("login as %s: %s", username, login).isEqualTo(200);
        return client;
    }

    private static LocalDateTime atNine(int year, int month, int day) {
        return LocalDateTime.of(year, month, day, 9, 0);
    }

    private static JsonNode getOk(ApiClient client, String path) {
        ApiClient.Response response = client.get(path);
        assertThat(response.status()).as("GET %s: %s", path, response).isEqualTo(200);
        return response.json();
    }

    private static void assertReports(JsonNode reports, List<ExpectedReport> expected) {
        assertThat(codes(reports)).as("report codes")
                .containsExactlyElementsOf(expected.stream().map(ExpectedReport::code).toList());
        for (int i = 0; i < expected.size(); i++) {
            assertReport(reports.get(i), expected.get(i));
        }
    }

    private static void assertReport(JsonNode report, ExpectedReport expected) {
        String code = expected.code();
        assertText(report.path("title"), expected.title(), code + " title");
        assertText(report.path("status"), expected.status(), code + " status");
        assertDecimal(report.path("totalEur"), expected.totalEur(), code + " totalEur");
        assertDateTime(report.path("createdOn"), expected.createdOn(), code + " createdOn");
        assertText(report.path("submittedBy"), expected.submittedBy(), code + " submittedBy");
    }

    private static List<String> codes(JsonNode reports) {
        assertThat(reports.isArray()).as("report list is an array: %s", reports).isTrue();
        List<String> codes = new ArrayList<>();
        reports.forEach(report -> codes.add(report.path("code").asText()));
        return codes;
    }

    private static JsonNode report(JsonNode reports, String code) {
        for (JsonNode report : reports) {
            if (code.equals(report.path("code").asText())) {
                return report;
            }
        }
        return fail("No report %s among %s", code, codes(reports));
    }

    private static long id(JsonNode reports, String code) {
        JsonNode id = report(reports, code).path("id");
        assertThat(id.isIntegralNumber()).as("%s id: %s", code, id).isTrue();
        return id.longValue();
    }

    private static JsonNode line(JsonNode detail, String title) {
        List<JsonNode> matches = new ArrayList<>();
        detail.path("lines").forEach(line -> {
            if (title.equals(line.path("title").asText())) {
                matches.add(line);
            }
        });
        assertThat(matches).as("lines titled %s in %s", title, detail.path("lines")).hasSize(1);
        return matches.get(0);
    }

    private static void assertLine(JsonNode line, LocalDate date, String description, String typeLabel,
            String amountInEuros) {
        String title = line.path("title").asText();
        assertDate(line.path("date"), date, title + " date");
        assertText(line.path("description"), description, title + " description");
        assertText(line.path("typeLabel"), typeLabel, title + " typeLabel");
        assertDecimal(line.path("amountInEuros"), amountInEuros, title + " amountInEuros");
    }

    private static List<String> labels(JsonNode shares) {
        assertThat(shares.isArray()).as("type shares are an array: %s", shares).isTrue();
        List<String> labels = new ArrayList<>();
        shares.forEach(share -> labels.add(share.path("label").asText()));
        return labels;
    }

    private static void assertShare(JsonNode share, String sharePercent, String sum, long count) {
        assertTypeTotal(share, sum, count);
        assertDecimal(share.path("sharePercent"), sharePercent, share.path("label").asText() + " sharePercent");
    }

    private static void assertTypeTotal(JsonNode share, String sum, long count) {
        String label = share.path("label").asText();
        assertDecimal(share.path("sum"), sum, label + " sum");
        assertCount(share.path("count"), count, label + " count");
    }

    private static void assertPeriod(JsonNode period, LocalDate from, LocalDate to, String description) {
        assertDate(period.path("from"), from, description + ".from");
        assertDate(period.path("to"), to, description + ".to");
    }

    private static void assertText(JsonNode node, String expected, String description) {
        assertThat(node.textValue()).as("%s: %s", description, node).isEqualTo(expected);
    }

    // Missing and null nodes report a decimalValue of zero, so the type check guards the 0.00 figures.
    private static void assertDecimal(JsonNode node, String expected, String description) {
        assertThat(node.isNumber()).as("%s is a number: %s", description, node).isTrue();
        assertThat(node.decimalValue()).as(description).isEqualByComparingTo(new BigDecimal(expected));
    }

    private static void assertCount(JsonNode node, long expected, String description) {
        assertThat(node.isIntegralNumber()).as("%s is an integer: %s", description, node).isTrue();
        assertThat(node.longValue()).as(description).isEqualTo(expected);
    }

    private static void assertDate(JsonNode node, LocalDate expected, String description) {
        assertThat(node.isTextual()).as("%s is a date: %s", description, node).isTrue();
        assertThat(LocalDate.parse(node.textValue())).as(description).isEqualTo(expected);
    }

    private static void assertDateTime(JsonNode node, LocalDateTime expected, String description) {
        assertThat(node.isTextual()).as("%s is a timestamp: %s", description, node).isTrue();
        assertThat(LocalDateTime.parse(node.textValue())).as(description).isEqualTo(expected);
    }

    private record ExpectedReport(String code, String title, String status, String totalEur,
            LocalDateTime createdOn, String submittedBy) {
    }
}
