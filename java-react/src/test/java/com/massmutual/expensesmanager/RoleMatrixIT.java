package com.massmutual.expensesmanager;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.nio.file.Path;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Base64;
import java.util.EnumMap;
import java.util.EnumSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;
import java.util.stream.Stream;

import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.EnumSource;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.core.env.Environment;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.massmutual.expensesmanager.domain.AppUser;
import com.massmutual.expensesmanager.domain.BlogPost;
import com.massmutual.expensesmanager.domain.EarningReport;
import com.massmutual.expensesmanager.domain.Expense;
import com.massmutual.expensesmanager.domain.ExpenseReport;
import com.massmutual.expensesmanager.domain.InvoiceExpense;
import com.massmutual.expensesmanager.domain.ReferenceIds;
import com.massmutual.expensesmanager.domain.ReportEntity;
import com.massmutual.expensesmanager.domain.Role;
import com.massmutual.expensesmanager.repository.AppUserRepository;
import com.massmutual.expensesmanager.repository.BlogPostRepository;
import com.massmutual.expensesmanager.repository.EarningReportRepository;
import com.massmutual.expensesmanager.repository.ExpenseReportRepository;
import com.massmutual.expensesmanager.repository.ExpenseRepository;
import com.massmutual.expensesmanager.repository.InvoiceExpenseRepository;
import com.massmutual.expensesmanager.service.ApiException;
import com.massmutual.expensesmanager.service.LegacyMessages;
import com.massmutual.expensesmanager.support.ApiClient;
import com.massmutual.expensesmanager.support.ApiClient.Response;
import com.massmutual.expensesmanager.support.TestDatabase;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@DirtiesContext
class RoleMatrixIT {

    private static final String DEMO_PASSWORD = "123456";
    private static final String FIXTURE_PASSWORD = "matrix-fixture-pass";
    private static final String EXPENSE = "expense";
    private static final String EARNING = "earning";
    private static final LocalDateTime FIXTURE_TIME = LocalDateTime.of(2024, 5, 1, 9, 0);
    private static final LocalDate LINE_DATE = LocalDate.of(2024, 5, 1);
    private static final String INVOICE_NAME = "invoice.png";
    private static final String INVOICE_TYPE = "image/png";
    private static final byte[] PNG = Base64.getDecoder().decode(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==");
    private static final Set<Account> FIXTURE_ACCOUNTS =
            EnumSet.of(Account.APPROVER, Account.USER_ADMIN, Account.USER_APPROVER);
    private static final List<Account> MATRIX_CALLERS =
            List.of(Account.ANONYMOUS, Account.EM_USER1, Account.EM_ADMIN, Account.APPROVER);
    private static final List<String> SPA_ROUTES = List.of(
            "/login", "/invalid-permissions", "/dashboard", "/reports", "/reports/expense/1", "/reports/earning/1",
            "/admin", "/admin/reports/expense/1", "/admin/reports/earning/1",
            "/blog", "/blog/posts/1", "/tools/usd-to-eur", "/tools/mileage", "/home");

    @TempDir
    static Path dir;

    private static final Map<Account, ApiClient> clients = new EnumMap<>(Account.class);
    private static final Map<Account, Long> userIds = new EnumMap<>(Account.class);
    private static final Map<Account, Map<String, Long>> ownDrafts = new EnumMap<>(Account.class);

    private static int port;
    private static int nextCode = 100;
    private static ExpenseReportRepository expenseReports;
    private static EarningReportRepository earningReports;
    private static ExpenseRepository expenses;

    // Every allowed call mutates a target of its own, so no case depends on another's outcome.
    private static long protectedReportId;
    private static long protectedLineId;
    private static long renameReportId;
    private static long submitReportId;
    private static long deleteReportId;
    private static long lineCreateReportId;
    private static long lineUpdateLineId;
    private static long lineDeleteLineId;
    private static long uploadLineId;
    private static long downloadLineId;
    private static long adminDecisionReportId;
    private static long userAdminDecisionReportId;
    private static long blogPostId;

    enum Account {
        ANONYMOUS(null, null, Set.of()),
        EM_USER1("em_user1", DEMO_PASSWORD, Set.of(Role.User)),
        EM_ADMIN("em_admin", DEMO_PASSWORD, Set.of(Role.Administrator)),
        APPROVER("approver", FIXTURE_PASSWORD, Set.of(Role.Approver)),
        USER_ADMIN("useradmin", FIXTURE_PASSWORD, Set.of(Role.User, Role.Administrator)),
        USER_APPROVER("userapprover", FIXTURE_PASSWORD, Set.of(Role.User, Role.Approver));

        final String username;
        final String password;
        final Set<Role> roles;

        Account(String username, String password, Set<Role> roles) {
            this.username = username;
            this.password = password;
            this.roles = roles;
        }

        boolean signedIn() {
            return username != null;
        }
    }

    record Call(String endpoint, Function<ApiClient, Response> request) {

        Response as(Account account) {
            return request.apply(client(account));
        }

        @Override
        public String toString() {
            return endpoint;
        }
    }

    @DynamicPropertySource
    static void database(DynamicPropertyRegistry registry) {
        TestDatabase.register(registry, () -> dir);
    }

    // Static under the default lifecycle: with PER_CLASS the context would load before @TempDir is set.
    @BeforeAll
    static void setUp(@Autowired Environment environment, @Autowired PasswordEncoder passwordEncoder,
            @Autowired AppUserRepository appUsers, @Autowired ExpenseReportRepository expenseReportRepository,
            @Autowired EarningReportRepository earningReportRepository,
            @Autowired ExpenseRepository expenseRepository, @Autowired InvoiceExpenseRepository invoiceExpenses,
            @Autowired BlogPostRepository blogPosts) {
        port = environment.getRequiredProperty("local.server.port", Integer.class);
        expenseReports = expenseReportRepository;
        earningReports = earningReportRepository;
        expenses = expenseRepository;

        userIds.put(Account.EM_USER1, appUsers.findByUsername(Account.EM_USER1.username).orElseThrow().getId());
        userIds.put(Account.EM_ADMIN, appUsers.findByUsername(Account.EM_ADMIN.username).orElseThrow().getId());
        for (Account account : FIXTURE_ACCOUNTS) {
            AppUser user = appUsers.save(new AppUser(account.username, "Matrix " + account.username,
                    passwordEncoder.encode(account.password), account.roles));
            userIds.put(account, user.getId());
            ownDrafts.put(account, Map.of(
                    EXPENSE, expenseReport(user.getId(), ReferenceIds.STATUS_DRAFT, "Own draft"),
                    EARNING, earningReport(user.getId(), ReferenceIds.STATUS_DRAFT, "Own draft")));
        }

        long owner = userIds.get(Account.EM_USER1);
        protectedReportId = expenseReport(owner, ReferenceIds.STATUS_DRAFT, "Protected");
        protectedLineId = expenseLine(protectedReportId, owner);
        renameReportId = expenseReport(owner, ReferenceIds.STATUS_DRAFT, "Rename target");
        submitReportId = expenseReport(owner, ReferenceIds.STATUS_DRAFT, "Submit target");
        expenseLine(submitReportId, owner);
        deleteReportId = expenseReport(owner, ReferenceIds.STATUS_DRAFT, "Delete target");
        lineCreateReportId = expenseReport(owner, ReferenceIds.STATUS_DRAFT, "Line create target");
        lineUpdateLineId = expenseLine(expenseReport(owner, ReferenceIds.STATUS_DRAFT, "Line update target"), owner);
        lineDeleteLineId = expenseLine(expenseReport(owner, ReferenceIds.STATUS_DRAFT, "Line delete target"), owner);
        uploadLineId = expenseLine(expenseReport(owner, ReferenceIds.STATUS_DRAFT, "Upload target"), owner);
        downloadLineId = expenseLine(expenseReport(owner, ReferenceIds.STATUS_DRAFT, "Download target"), owner);
        adminDecisionReportId = expenseReport(owner, ReferenceIds.STATUS_SUBMITTED, "Admin decision target");
        expenseLine(adminDecisionReportId, owner);
        userAdminDecisionReportId = expenseReport(owner, ReferenceIds.STATUS_SUBMITTED, "User admin decision target");
        expenseLine(userAdminDecisionReportId, owner);

        InvoiceExpense invoice = new InvoiceExpense(downloadLineId);
        invoice.setContent(PNG);
        invoice.setFilename(INVOICE_NAME);
        invoice.setFiletype(INVOICE_TYPE);
        invoice.setDatetime(FIXTURE_TIME);
        invoiceExpenses.save(invoice);

        long adminId = userIds.get(Account.EM_ADMIN);
        BlogPost post = new BlogPost();
        post.setTitle("Matrix fixture post");
        post.setDescription("Fixture");
        post.setCreatedBy(adminId);
        post.setCreatedOn(FIXTURE_TIME);
        post.setUpdatedBy(adminId);
        post.setUpdatedOn(FIXTURE_TIME);
        post.setIsActive(true);
        blogPostId = blogPosts.save(post).getId();

        clients.put(Account.ANONYMOUS, new ApiClient(port));
        for (Account account : Account.values()) {
            if (account.signedIn()) {
                clients.put(account, ApiClient.loggedIn(port, account.username, account.password));
            }
        }
    }

    @AfterAll
    static void closeClients() {
        clients.values().forEach(ApiClient::close);
        clients.clear();
        userIds.clear();
        ownDrafts.clear();
    }

    static Stream<Arguments> readCases() {
        return Stream.of(
                Arguments.of(get("/api/auth/me"), 200, 200, 200),
                Arguments.of(get("/api/reference"), 200, 200, 200),
                Arguments.of(get("/api/blog"), 200, 200, 200),
                Arguments.of(get("/api/blog/" + blogPostId), 200, 200, 200),
                Arguments.of(get("/api/reports?kind=expense"), 200, 200, 200),
                Arguments.of(get("/api/tools/usd-to-eur?amount=100"), 200, 200, 200),
                Arguments.of(get("/api/tools/mileage?km=10"), 200, 200, 200),
                Arguments.of(get(reportPath(protectedReportId)), 200, 200, 403),
                Arguments.of(get(invoicePath(downloadLineId)), 200, 200, 403),
                Arguments.of(get("/api/dashboard/user"), 200, 403, 403),
                Arguments.of(get("/api/dashboard/admin"), 403, 200, 403));
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("readCases")
    @DisplayName("Read endpoints answer each role as the matrix grants")
    void readMatrix(Call call, int emUser1, int emAdmin, int approver) {
        expect(Account.ANONYMOUS, call, 401);
        expect(Account.EM_USER1, call, emUser1);
        expect(Account.EM_ADMIN, call, emAdmin);
        expect(Account.APPROVER, call, approver);
    }

    static Stream<Arguments> writeCases() {
        return Stream.of(
                Arguments.of(createReport(), Account.EM_USER1, 201),
                Arguments.of(renameReport(renameReportId), Account.EM_USER1, 200),
                Arguments.of(submitReport(submitReportId), Account.EM_USER1, 200),
                Arguments.of(deleteReport(deleteReportId), Account.EM_USER1, 204),
                Arguments.of(createLine(lineCreateReportId), Account.EM_USER1, 201),
                Arguments.of(updateLine(lineUpdateLineId), Account.EM_USER1, 200),
                Arguments.of(deleteLine(lineDeleteLineId), Account.EM_USER1, 204),
                Arguments.of(uploadInvoice(uploadLineId), Account.EM_USER1, 204),
                Arguments.of(decide(adminDecisionReportId), Account.EM_ADMIN, 200),
                Arguments.of(createPost(), Account.EM_ADMIN, 201),
                Arguments.of(updatePost(blogPostId), Account.EM_ADMIN, 200));
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("writeCases")
    @DisplayName("Write endpoints deny every caller but the granted role")
    void writeMatrix(Call call, Account allowed, int success) {
        // Denied callers go first, so their status never depends on the allowed call having changed the target.
        for (Account caller : MATRIX_CALLERS) {
            if (caller != allowed) {
                expect(caller, call, caller == Account.ANONYMOUS ? 401 : 403);
            }
        }
        expect(allowed, call, success);
    }

    static Stream<Call> protectedDraftWrites() {
        return Stream.of(
                renameReport(protectedReportId),
                deleteReport(protectedReportId),
                submitReport(protectedReportId),
                createLine(protectedReportId),
                updateLine(protectedLineId),
                deleteLine(protectedLineId),
                uploadInvoice(protectedLineId));
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("protectedDraftWrites")
    @DisplayName("User plus Administrator cannot write another user's Draft")
    void userAdministratorCannotWriteOthersDraft(Call call) {
        expect(Account.USER_ADMIN, call, 403);

        ExpenseReport report = expenseReports.findById(protectedReportId).orElseThrow();
        assertThat(report.getStatusId()).isEqualTo(ReferenceIds.STATUS_DRAFT);
        assertThat(report.getTitle()).isEqualTo("Protected");
        assertThat(expenses.findByReportId(protectedReportId))
                .extracting(Expense::getId)
                .containsExactly(protectedLineId);
    }

    @Test
    @DisplayName("User plus Administrator reads another user's Draft and decides a Submitted report")
    void userAdministratorReadsAndDecides() {
        expect(Account.USER_ADMIN, get(reportPath(protectedReportId)), 200);
        Response decided = expect(Account.USER_ADMIN, decide(userAdminDecisionReportId), 200);
        assertThat(decided.json().path("status").asText()).isEqualTo("Approved");
    }

    @Test
    @DisplayName("A User cannot read another user's report")
    void userCannotReadOthersReport() {
        long michaelsReport = expenseReports.findAll().stream()
                .filter(report -> "7/2024 EX".equals(report.getCode()))
                .map(ReportEntity::getId)
                .findFirst()
                .orElseThrow();
        expect(Account.EM_USER1, get(reportPath(michaelsReport)), 403);
    }

    @ParameterizedTest(name = "{0}")
    @EnumSource(value = Account.class, mode = EnumSource.Mode.EXCLUDE, names = "ANONYMOUS")
    @DisplayName("Login succeeds for every account")
    void loginSucceeds(Account account) {
        try (ApiClient fresh = new ApiClient(port)) {
            Response response = fresh.login(account.username, account.password);
            assertThat(response.status()).as(response.toString()).isEqualTo(200);
            assertThat(response.json().path("username").asText()).isEqualTo(account.username);
        }
    }

    @Test
    @DisplayName("Wrong password and unknown username get the same 401 body")
    void badCredentialsDoNotRevealUsernames() {
        try (ApiClient first = new ApiClient(port); ApiClient second = new ApiClient(port)) {
            Response wrongPassword = first.login(Account.EM_USER1.username, "not-the-password");
            Response unknownUser = second.login("no.such.user", DEMO_PASSWORD);
            for (Response response : List.of(wrongPassword, unknownUser)) {
                assertThat(response.status()).as(response.toString()).isEqualTo(401);
                assertThat(response.json().path("code").asText()).isEqualTo(ApiException.BAD_CREDENTIALS);
                assertThat(response.json().path("message").asText()).isEqualTo(LegacyMessages.BAD_CREDENTIALS);
            }
            assertThat(wrongPassword.json()).isEqualTo(unknownUser.json());
        }
    }

    @ParameterizedTest(name = "username \"{0}\", password \"{1}\"")
    @CsvSource({"'', 123456", "em_user1, ''", "'   ', 123456", "em_user1, '   '"})
    @DisplayName("Login with a blank field is rejected as invalid")
    void blankLoginFieldIsRejected(String username, String password) {
        try (ApiClient fresh = new ApiClient(port)) {
            Response response = fresh.login(username, password);
            assertThat(response.status()).as(response.toString()).isEqualTo(422);
            assertThat(response.json().path("code").asText()).isEqualTo(ApiException.VALIDATION_FAILED);
        }
    }

    @ParameterizedTest(name = "{0}")
    @EnumSource(Account.class)
    @DisplayName("Logout with a CSRF token returns 204 and ends any session")
    void logoutWithCsrfToken(Account account) {
        try (ApiClient fresh = freshClient(account)) {
            Response response = fresh.logout();
            assertThat(response.status()).as(response.toString()).isEqualTo(204);
            assertStatus(account, "GET /api/auth/me after logout", fresh.me(), 401);
        }
    }

    @ParameterizedTest(name = "{0}")
    @EnumSource(Account.class)
    @DisplayName("Logout without a CSRF token is rejected")
    void logoutWithoutCsrfToken(Account account) {
        try (ApiClient fresh = freshClient(account)) {
            assertStatus(account, "POST /api/auth/logout", fresh.logoutWithoutCsrf(), account.signedIn() ? 403 : 401);
            assertStatus(account, "GET /api/auth/me", fresh.me(), account.signedIn() ? 200 : 401);
        }
    }

    @ParameterizedTest(name = "{0}")
    @EnumSource(Account.class)
    @DisplayName("Unmapped API paths need a session and then answer 404")
    void unmappedApiPath(Account account) {
        expect(account, get("/api/does-not-exist"), account.signedIn() ? 404 : 401);
    }

    static Stream<Arguments> listScopeCases() {
        return Arrays.stream(Account.values())
                .filter(Account::signedIn)
                .flatMap(account -> Stream.of(Arguments.of(account, EXPENSE), Arguments.of(account, EARNING)));
    }

    @ParameterizedTest(name = "{0} lists {1} reports")
    @MethodSource("listScopeCases")
    @DisplayName("Report list scope follows the caller's roles")
    void listScope(Account account, String kind) {
        Response response = expect(account, get("/api/reports?kind=" + kind), 200);
        List<Long> listed = ids(response.json());

        List<ReportEntity> all =
                List.copyOf(EXPENSE.equals(kind) ? expenseReports.findAll() : earningReports.findAll());
        Map<Long, ReportEntity> reportsById = all.stream()
                .collect(Collectors.toMap(ReportEntity::getId, Function.identity()));
        Set<Long> expected = all.stream()
                .filter(report -> visibleTo(account, report))
                .map(ReportEntity::getId)
                .collect(Collectors.toSet());

        assertThat(listed).doesNotHaveDuplicates().containsExactlyInAnyOrderElementsOf(expected);
        Long ownDraft = ownDrafts.getOrDefault(account, Map.of()).get(kind);
        if (ownDraft != null) {
            assertThat(listed).contains(ownDraft);
        }
        if (account == Account.APPROVER) {
            assertThat(listed).allSatisfy(id -> {
                ReportEntity report = reportsById.get(id);
                assertThat(isOwnedBy(account, report)
                        || report.getStatusId() == ReferenceIds.STATUS_SUBMITTED)
                        .as("%s %s is the approver's own or Submitted", kind, report.getCode())
                        .isTrue();
            });
        }
    }

    static Stream<Arguments> deepLinkCases() {
        return MATRIX_CALLERS.stream()
                .flatMap(account -> SPA_ROUTES.stream().map(path -> Arguments.of(account, path)));
    }

    @ParameterizedTest(name = "{0} opens {1}")
    @MethodSource("deepLinkCases")
    @DisplayName("Every SPA route loads index.html as a deep link")
    void deepLink(Account account, String path) {
        Response response = client(account).get(path);
        assertThat(response.status()).as("%s as %s: %s", path, account, response).isEqualTo(200);
        assertThat(response.header("Content-Type")).startsWith("text/html");
        assertThat(response.text()).contains("<title>Expenses Manager V2</title>");
    }

    private static boolean visibleTo(Account account, ReportEntity report) {
        int status = report.getStatusId();
        return isOwnedBy(account, report)
                || (account.roles.contains(Role.Approver) && status == ReferenceIds.STATUS_SUBMITTED)
                || (account.roles.contains(Role.Administrator) && status != ReferenceIds.STATUS_DRAFT);
    }

    private static boolean isOwnedBy(Account account, ReportEntity report) {
        return Objects.equals(report.getSubmitedBy(), userIds.get(account));
    }

    private static Response expect(Account account, Call call, int status) {
        return assertStatus(account, call.endpoint(), call.as(account), status);
    }

    private static Response assertStatus(Account account, String endpoint, Response response, int status) {
        assertThat(response.status()).as("%s as %s: %s", endpoint, account, response).isEqualTo(status);
        String code = switch (status) {
            case 401 -> ApiException.UNAUTHENTICATED;
            case 403 -> ApiException.FORBIDDEN;
            case 404 -> ApiException.NOT_FOUND;
            default -> null;
        };
        if (code != null) {
            assertThat(response.json().path("code").asText()).as("%s as %s", endpoint, account).isEqualTo(code);
        }
        return response;
    }

    private static ApiClient client(Account account) {
        return Objects.requireNonNull(clients.get(account), () -> "No client for " + account);
    }

    private static ApiClient freshClient(Account account) {
        return account.signedIn() ? ApiClient.loggedIn(port, account.username, account.password) : new ApiClient(port);
    }

    private static Call get(String path) {
        return new Call("GET " + path, c -> c.get(path));
    }

    private static Call createReport() {
        return new Call("POST /api/reports", c -> c.postJson("/api/reports", titleBody("Matrix").put("kind", EXPENSE)));
    }

    private static Call renameReport(long reportId) {
        return new Call("PUT " + reportPath(reportId), c -> c.putJson(reportPath(reportId), titleBody("Renamed")));
    }

    private static Call submitReport(long reportId) {
        return new Call("POST " + reportPath(reportId) + "/submit", c -> c.post(reportPath(reportId) + "/submit"));
    }

    private static Call deleteReport(long reportId) {
        return new Call("DELETE " + reportPath(reportId), c -> c.delete(reportPath(reportId)));
    }

    private static Call decide(long reportId) {
        String path = reportPath(reportId) + "/decision";
        return new Call("POST " + path, c -> c.postJson(path, ApiClient.object().put("accept", true)));
    }

    private static Call createLine(long reportId) {
        String path = reportPath(reportId) + "/lines";
        return new Call("POST " + path, c -> c.postJson(path, lineBody()));
    }

    private static Call updateLine(long lineId) {
        return new Call("PUT " + linePath(lineId), c -> c.putJson(linePath(lineId), lineBody()));
    }

    private static Call deleteLine(long lineId) {
        return new Call("DELETE " + linePath(lineId), c -> c.delete(linePath(lineId)));
    }

    private static Call createPost() {
        return new Call("POST /api/blog", c -> c.postJson("/api/blog", blogBody()));
    }

    private static Call updatePost(long postId) {
        String path = "/api/blog/" + postId;
        return new Call("PUT " + path, c -> c.putJson(path, blogBody()));
    }

    private static Call uploadInvoice(long lineId) {
        return new Call("PUT " + invoicePath(lineId),
                c -> c.putFile(invoicePath(lineId), INVOICE_NAME, INVOICE_TYPE, PNG));
    }

    private static List<Long> ids(JsonNode rows) {
        assertThat(rows.isArray()).as(rows.toString()).isTrue();
        List<Long> ids = new ArrayList<>();
        rows.forEach(row -> ids.add(row.path("id").asLong()));
        return ids;
    }

    private static String reportPath(long reportId) {
        return "/api/reports/expense/" + reportId;
    }

    private static String linePath(long lineId) {
        return "/api/lines/expense/" + lineId;
    }

    private static String invoicePath(long lineId) {
        return linePath(lineId) + "/invoice";
    }

    private static ObjectNode titleBody(String title) {
        return ApiClient.object().put("title", title);
    }

    private static ObjectNode blogBody() {
        return titleBody("Matrix post").put("description", "Body");
    }

    private static ObjectNode lineBody() {
        return ApiClient.object()
                .put("expenseTypeId", ReferenceIds.EXPENSE_TYPE_TRAVEL)
                .put("currencyId", ReferenceIds.CURRENCY_EURO)
                .put("amount", new BigDecimal("10.00"))
                .put("title", "Taxi")
                .put("description", "")
                .put("date", LINE_DATE.toString());
    }

    private static long expenseReport(long ownerId, int statusId, String title) {
        ExpenseReport report = new ExpenseReport();
        stamp(report, ownerId, statusId, title, " EX");
        return expenseReports.save(report).getId();
    }

    private static long earningReport(long ownerId, int statusId, String title) {
        EarningReport report = new EarningReport();
        stamp(report, ownerId, statusId, title, " EA");
        return earningReports.save(report).getId();
    }

    private static void stamp(ReportEntity report, long ownerId, int statusId, String title, String codeSuffix) {
        report.setCode(nextCode++ + "/2024" + codeSuffix);
        report.setTitle(title);
        report.setStatusId(statusId);
        report.setCreatedBy(ownerId);
        report.setSubmitedBy(ownerId);
        report.setUpdatedBy(ownerId);
        report.setCreatedOn(FIXTURE_TIME);
        report.setUpdatedOn(FIXTURE_TIME);
        report.setIsActive(false);
        if (statusId != ReferenceIds.STATUS_DRAFT) {
            report.setSubmitedOn(FIXTURE_TIME.plusDays(1));
            report.setUpdatedOn(FIXTURE_TIME.plusDays(1));
        }
    }

    private static long expenseLine(long reportId, long ownerId) {
        BigDecimal amount = new BigDecimal("25.0000");
        Expense line = new Expense();
        line.setReportId(reportId);
        line.setTypeId(ReferenceIds.EXPENSE_TYPE_TRAVEL);
        line.setDate(LINE_DATE);
        line.setTitle("Matrix line");
        line.setDescription("");
        line.setCurrencyId(ReferenceIds.CURRENCY_EURO);
        line.setAmount(amount);
        line.setAmountInEuros(amount);
        line.setCreatedBy(ownerId);
        line.setCreatedOn(FIXTURE_TIME);
        line.setUpdatedBy(ownerId);
        line.setUpdatedOn(FIXTURE_TIME);
        line.setIsActive(false);
        return expenses.save(line).getId();
    }
}
