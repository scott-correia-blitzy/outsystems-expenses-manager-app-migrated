package com.massmutual.expensesmanager;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatExceptionOfType;
import static org.junit.jupiter.params.provider.Arguments.arguments;

import com.massmutual.expensesmanager.domain.AppUser;
import com.massmutual.expensesmanager.domain.EarningReport;
import com.massmutual.expensesmanager.domain.Expense;
import com.massmutual.expensesmanager.domain.ExpenseReport;
import com.massmutual.expensesmanager.domain.ReferenceIds;
import com.massmutual.expensesmanager.domain.ReportEntity;
import com.massmutual.expensesmanager.domain.ReportKind;
import com.massmutual.expensesmanager.domain.Role;
import com.massmutual.expensesmanager.repository.AppUserRepository;
import com.massmutual.expensesmanager.repository.BlogPostRepository;
import com.massmutual.expensesmanager.repository.EarningReportRepository;
import com.massmutual.expensesmanager.repository.EarningRepository;
import com.massmutual.expensesmanager.repository.ExpenseReportRepository;
import com.massmutual.expensesmanager.repository.ExpenseRepository;
import com.massmutual.expensesmanager.repository.InvoiceEarningRepository;
import com.massmutual.expensesmanager.repository.InvoiceExpenseRepository;
import com.massmutual.expensesmanager.service.ApiException;
import com.massmutual.expensesmanager.service.BlogService;
import com.massmutual.expensesmanager.service.Caller;
import com.massmutual.expensesmanager.service.DashboardService;
import com.massmutual.expensesmanager.service.InvoiceService;
import com.massmutual.expensesmanager.service.LegacyMessages;
import com.massmutual.expensesmanager.service.LineService;
import com.massmutual.expensesmanager.service.ReferenceDataService;
import com.massmutual.expensesmanager.service.ReportCodeGenerator;
import com.massmutual.expensesmanager.service.ReportService;
import com.massmutual.expensesmanager.service.model.BlogPostView;
import com.massmutual.expensesmanager.service.model.FieldViolation;
import com.massmutual.expensesmanager.service.model.InvoiceFile;
import com.massmutual.expensesmanager.service.model.LineView;
import com.massmutual.expensesmanager.service.model.Period;
import com.massmutual.expensesmanager.service.model.RefItem;
import com.massmutual.expensesmanager.service.model.ReferenceData;
import com.massmutual.expensesmanager.service.model.ReportDetail;
import com.massmutual.expensesmanager.service.model.ReportSummary;
import com.massmutual.expensesmanager.service.model.UserDashboard;
import com.massmutual.expensesmanager.support.MutableClock;
import com.massmutual.expensesmanager.support.TestDatabase;
import java.math.BigDecimal;
import java.nio.file.Path;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.EnumSet;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import java.util.stream.Stream;
import org.assertj.core.api.ThrowableAssert.ThrowingCallable;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.MethodSource;
import org.junit.jupiter.params.provider.NullSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.TestPropertySource;

// Not @Transactional: create() commits in its own REQUIRES_NEW transaction, so every assertion reads committed rows.
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.NONE, properties = "expenses.seed.enabled=false")
@Import(MutableClock.Beans.class)
@DirtiesContext
class BusinessRulesTest {

    private static final LocalDate LINE_DATE = LocalDate.of(2024, 5, 21);
    private static final byte[] PNG_BYTES = {(byte) 0x89, 'P', 'N', 'G', '\r', '\n', 0x1A, '\n'};

    @TempDir
    static Path dir;

    @DynamicPropertySource
    static void db(DynamicPropertyRegistry registry) {
        TestDatabase.register(registry, () -> dir);
    }

    @Autowired
    private AppUserRepository appUserRepository;
    @Autowired
    private ExpenseReportRepository expenseReportRepository;
    @Autowired
    private EarningReportRepository earningReportRepository;
    @Autowired
    private ExpenseRepository expenseRepository;
    @Autowired
    private EarningRepository earningRepository;
    @Autowired
    private InvoiceExpenseRepository invoiceExpenseRepository;
    @Autowired
    private InvoiceEarningRepository invoiceEarningRepository;
    @Autowired
    private BlogPostRepository blogPostRepository;

    @Autowired
    private ReportService reportService;
    @Autowired
    private LineService lineService;
    @Autowired
    private InvoiceService invoiceService;
    @Autowired
    private DashboardService dashboardService;
    @Autowired
    private BlogService blogService;
    @Autowired
    private ReferenceDataService referenceDataService;
    @Autowired
    private ReportCodeGenerator reportCodeGenerator;

    @Autowired
    private MutableClock clock;

    @BeforeEach
    void resetData() {
        invoiceExpenseRepository.deleteAllInBatch();
        invoiceEarningRepository.deleteAllInBatch();
        expenseRepository.deleteAllInBatch();
        earningRepository.deleteAllInBatch();
        expenseReportRepository.deleteAllInBatch();
        earningReportRepository.deleteAllInBatch();
        clock.set(MutableClock.DEFAULT_TIME);
    }

    @Test
    void referenceDataHoldsTheStaticRowsAndConfiguredRates() {
        ReferenceData data = referenceDataService.referenceData();

        assertThat(data.currencies()).containsExactly(
                new RefItem(ReferenceIds.CURRENCY_EURO, "Euro", 1, true),
                new RefItem(ReferenceIds.CURRENCY_DOLLAR, "Dollar", 2, true));
        assertThat(data.statuses().stream().sorted(Comparator.comparing(RefItem::id)).toList()).containsExactly(
                new RefItem(ReferenceIds.STATUS_DRAFT, "Draft", 2, true),
                new RefItem(ReferenceIds.STATUS_SUBMITTED, "Submitted", 2, true),
                new RefItem(ReferenceIds.STATUS_APPROVED, "Approved", 3, true),
                new RefItem(ReferenceIds.STATUS_DECLINED, "Declined", 4, true));
        assertThat(data.expenseTypes()).containsExactly(
                new RefItem(ReferenceIds.EXPENSE_TYPE_RESTAURANT, "Restaurant", 1, true),
                new RefItem(ReferenceIds.EXPENSE_TYPE_TRAVEL, "Travel", 2, true),
                new RefItem(ReferenceIds.EXPENSE_TYPE_KILOMETERS, "Kilometers", 3, true),
                new RefItem(ReferenceIds.EXPENSE_TYPE_OTHER, "Other", 4, true));
        assertThat(data.earningTypes()).containsExactly(
                new RefItem(ReferenceIds.EARNING_TYPE_INVESTMENT, "Investment", 2, true),
                new RefItem(ReferenceIds.EARNING_TYPE_OTHER, "Other", 4, true),
                new RefItem(ReferenceIds.EARNING_TYPE_SALARY, "Salary", 1, true),
                new RefItem(ReferenceIds.EARNING_TYPE_SERVICE, "Service", 3, true));
        assertThat(data.mileageReimbursement()).isEqualByComparingTo("0.37");
        assertThat(data.dollarsToEuros()).isEqualByComparingTo("0.93");
        assertThat(data.vatRate()).isEqualByComparingTo("0.23");
    }

    static Stream<Arguments> nextCodeFollowsTheHighestNumberOfTheClockYear() {
        return Stream.of(
                arguments(ReportKind.EXPENSE, List.of("2/2024 EX", "11/2024 EX"),
                        MutableClock.DEFAULT_TIME, "12/2024 EX"),
                arguments(ReportKind.EXPENSE, List.of("2/2024 EX", "11/2024 EX"),
                        LocalDateTime.of(2025, 1, 2, 10, 0), "1/2025 EX"),
                arguments(ReportKind.EARNING, List.of("9/2024 EA"), MutableClock.DEFAULT_TIME, "10/2024 EA"));
    }

    @ParameterizedTest(name = "{0} after {1} at {2} is {3}")
    @MethodSource
    void nextCodeFollowsTheHighestNumberOfTheClockYear(
            ReportKind kind, List<String> storedCodes, LocalDateTime now, String expected) {
        Caller owner = newCaller(appUserRepository, Role.User);
        storedCodes.forEach(code -> storeReport(kind, code, ReferenceIds.STATUS_SUBMITTED, owner));
        clock.set(now);

        assertThat(reportCodeGenerator.nextCode(kind)).isEqualTo(expected);
    }

    @Test
    void createAcceptsAFiftyCharacterTitleAsAnOwnedDraft() {
        Caller owner = newCaller(appUserRepository, Role.User);
        String title = "T".repeat(50);

        ReportSummary created = reportService.create(owner, ReportKind.EXPENSE, title);

        assertThat(created.status()).isEqualTo("Draft");
        assertThat(created.code()).endsWith(" EX");
        assertThat(created.title()).isEqualTo(title);
        assertThat(expenseReportRepository.findById(created.id()).orElseThrow().getCreatedBy()).isEqualTo(owner.id());
    }

    @Test
    void createRejectsAFiftyOneCharacterTitle() {
        Caller owner = newCaller(appUserRepository, Role.User);

        assertApiError(() -> reportService.create(owner, ReportKind.EXPENSE, "T".repeat(51)),
                422, ApiException.VALIDATION_FAILED, LegacyMessages.MAX_LENGTH_50);
    }

    @Test
    void submitRejectsAReportThatIsNoLongerDraft() {
        Caller owner = newCaller(appUserRepository, Role.User);
        Long id = storeReport(ReportKind.EXPENSE, "1/2024 EX", ReferenceIds.STATUS_SUBMITTED, owner);

        assertApiError(() -> reportService.submit(owner, ReportKind.EXPENSE, id),
                409, ApiException.NOT_DRAFT, LegacyMessages.CANNOT_SUBMIT);
    }

    @Test
    void submitRejectsADraftWithoutLines() {
        Caller owner = newCaller(appUserRepository, Role.User);
        Long id = reportService.create(owner, ReportKind.EARNING, "Empty").id();

        assertApiError(() -> reportService.submit(owner, ReportKind.EARNING, id),
                422, ApiException.NO_LINES, LegacyMessages.NO_LINES);
    }

    @Test
    void deleteRejectsAReportThatIsNoLongerDraft() {
        Caller owner = newCaller(appUserRepository, Role.User);
        Long id = storeReport(ReportKind.EXPENSE, "1/2024 EX", ReferenceIds.STATUS_APPROVED, owner);

        assertApiError(() -> reportService.delete(owner, ReportKind.EXPENSE, id),
                409, ApiException.NOT_DRAFT, LegacyMessages.REPORT_CANT_BE_DELETED);
    }

    @Test
    void deleteRejectsALineOfAReportThatIsNoLongerDraft() {
        Caller owner = newCaller(appUserRepository, Role.User);
        LineView line = draftWithLine(owner);
        reportService.submit(owner, ReportKind.EXPENSE, line.reportId());

        assertApiError(() -> lineService.delete(owner, ReportKind.EXPENSE, line.id()),
                409, ApiException.NOT_DRAFT, LegacyMessages.DETAIL_CANT_BE_DELETED);
    }

    @Test
    void deletingADraftReportRemovesItsLinesAndInvoices() {
        Caller owner = newCaller(appUserRepository, Role.User);
        LineView line = draftWithLine(owner);
        invoiceService.upload(owner, ReportKind.EXPENSE, line.id(), "receipt.png", "image/png", PNG_BYTES);

        reportService.delete(owner, ReportKind.EXPENSE, line.reportId());

        assertThat(expenseReportRepository.existsById(line.reportId())).isFalse();
        assertThat(expenseRepository.existsById(line.id())).isFalse();
        assertThat(invoiceExpenseRepository.existsById(line.id())).isFalse();
    }

    @Test
    void decisionByAUserIsRejected() {
        Caller owner = newCaller(appUserRepository, Role.User);
        Long id = storeReport(ReportKind.EXPENSE, "1/2024 EX", ReferenceIds.STATUS_SUBMITTED, owner);

        assertApiError(() -> reportService.decide(owner, ReportKind.EXPENSE, id, true),
                403, ApiException.FORBIDDEN, LegacyMessages.NO_PERMISSIONS);
    }

    @ParameterizedTest(name = "accept={0} gives {1}")
    @CsvSource({"true, Approved", "false, Declined"})
    void administratorDecisionSetsTheStatus(boolean accept, String expectedStatus) {
        Caller owner = newCaller(appUserRepository, Role.User);
        Caller admin = newCaller(appUserRepository, Role.Administrator);
        Long id = storeReport(ReportKind.EARNING, "1/2024 EA", ReferenceIds.STATUS_SUBMITTED, owner);

        assertThat(reportService.decide(admin, ReportKind.EARNING, id, accept).status()).isEqualTo(expectedStatus);
    }

    static Stream<Arguments> serverComputesAndStoresEuroAmounts() {
        return Stream.of(
                arguments(ReferenceIds.EXPENSE_TYPE_TRAVEL, ReferenceIds.CURRENCY_DOLLAR,
                        "100.00", null, "93.00", "21.39"),
                arguments(ReferenceIds.EXPENSE_TYPE_KILOMETERS, null, null, "10", "3.70", "0.85"),
                arguments(ReferenceIds.EXPENSE_TYPE_TRAVEL, ReferenceIds.CURRENCY_EURO,
                        "42.00", null, "42.00", "9.66"));
    }

    @ParameterizedTest(name = "type {0}, currency {1}, amount {2}, km {3} stores {4} with VAT {5}")
    @MethodSource
    void serverComputesAndStoresEuroAmounts(
            int typeId, Integer currencyId, String amount, String kilometers, String euros, String vat) {
        Caller owner = newCaller(appUserRepository, Role.User);
        Long reportId = reportService.create(owner, ReportKind.EXPENSE, "Amounts").id();

        LineView view = lineService.create(owner, ReportKind.EXPENSE, reportId,
                line(typeId, currencyId, decimal(amount), decimal(kilometers), "Amount", "", LINE_DATE));

        assertThat(view.amountInEuros()).isEqualByComparingTo(euros);
        assertThat(view.vat()).isEqualByComparingTo(vat);
        Expense stored = expenseRepository.findById(view.id()).orElseThrow();
        assertThat(stored.getAmountInEuros()).isEqualByComparingTo(euros);
        ReportDetail detail = reportService.detail(owner, ReportKind.EXPENSE, reportId);
        assertThat(detail.totalEur()).isEqualByComparingTo(euros);
        assertThat(detail.vatTotal()).isEqualByComparingTo(vat);
    }

    @Test
    void updateRecomputesTheStoredEuroAmount() {
        Caller owner = newCaller(appUserRepository, Role.User);
        LineView line = draftWithLine(owner);

        LineView updated = lineService.update(owner, ReportKind.EXPENSE, line.id(), line(
                ReferenceIds.EXPENSE_TYPE_TRAVEL, ReferenceIds.CURRENCY_DOLLAR, new BigDecimal("100.00"), null,
                "Flight tickets", "", LINE_DATE));

        assertThat(updated.amountInEuros()).isEqualByComparingTo("93.00");
        assertThat(expenseRepository.findById(line.id()).orElseThrow().getAmountInEuros())
                .isEqualByComparingTo("93.00");
    }

    @ParameterizedTest(name = "filename \"{0}\"")
    @NullSource
    @ValueSource(strings = {"", "   "})
    void uploadWithoutAFilenameIsRejected(String filename) {
        Caller owner = newCaller(appUserRepository, Role.User);
        LineView line = draftWithLine(owner);

        assertApiError(() -> invoiceService.upload(owner, ReportKind.EXPENSE, line.id(), filename, "image/png",
                        PNG_BYTES),
                422, ApiException.VALIDATION_FAILED, LegacyMessages.NO_FILE_SELECTED);
    }

    @Test
    void uploadOfANamedEmptyFileIsRejected() {
        Caller owner = newCaller(appUserRepository, Role.User);
        LineView line = draftWithLine(owner);

        assertApiError(() -> invoiceService.upload(owner, ReportKind.EXPENSE, line.id(), "empty.png", "image/png",
                        new byte[0]),
                422, ApiException.VALIDATION_FAILED, LegacyMessages.NO_FILE_UPLOADED);
    }

    @Test
    void fiftyCharacterFilenameIsStoredAndDownloadedUnchanged() {
        Caller owner = newCaller(appUserRepository, Role.User);
        LineView line = draftWithLine(owner);
        String filename = "i".repeat(46) + ".png";

        invoiceService.upload(owner, ReportKind.EXPENSE, line.id(), filename, "image/png", PNG_BYTES);
        InvoiceFile file = invoiceService.download(owner, ReportKind.EXPENSE, line.id());

        assertThat(file.filename()).isEqualTo(filename).hasSize(50);
        assertThat(file.contentType()).isEqualTo("image/png");
        assertThat(file.content()).isEqualTo(PNG_BYTES);
    }

    @Test
    void fiftyOneCharacterFilenameIsRejected() {
        Caller owner = newCaller(appUserRepository, Role.User);
        LineView line = draftWithLine(owner);
        String filename = "i".repeat(47) + ".png";

        assertApiError(() -> invoiceService.upload(owner, ReportKind.EXPENSE, line.id(), filename, "image/png",
                        PNG_BYTES),
                422, ApiException.VALIDATION_FAILED, LegacyMessages.FILE_NAME_TOO_LONG);
    }

    @Test
    void blogAcceptsTitleAndDescriptionAtTheirMaximumLengths() {
        Caller admin = newCaller(appUserRepository, Role.Administrator);
        String title = "B".repeat(50);
        String description = "d".repeat(10_000);

        BlogPostView post = blogService.create(admin, new BlogService.PostInput(title, description));

        assertThat(post.title()).isEqualTo(title);
        assertThat(blogPostRepository.findById(post.id()).orElseThrow().getDescription()).isEqualTo(description);
    }

    static Stream<Arguments> blogRejectsTitleOrDescriptionOverTheLimit() {
        return Stream.of(
                arguments("B".repeat(51), "Description", LegacyMessages.MAX_LENGTH_50),
                arguments("Title", "d".repeat(10_001), LegacyMessages.MAX_LENGTH_10000));
    }

    @ParameterizedTest(name = "rejected with \"{2}\"")
    @MethodSource
    void blogRejectsTitleOrDescriptionOverTheLimit(String title, String description, String message) {
        Caller admin = newCaller(appUserRepository, Role.Administrator);
        BlogService.PostInput input = new BlogService.PostInput(title, description);
        Long existingId = blogService.create(admin, new BlogService.PostInput("Existing", "")).id();

        assertApiError(() -> blogService.create(admin, input), 422, ApiException.VALIDATION_FAILED, message);
        assertApiError(() -> blogService.update(admin, existingId, input),
                422, ApiException.VALIDATION_FAILED, message);
    }

    @Test
    void listDateBoundsExcludeFromAndIncludeTo() {
        Caller owner = newCaller(appUserRepository, Role.User);
        LocalDateTime from = LocalDateTime.of(2024, 5, 20, 8, 15, 30);
        LocalDateTime to = LocalDateTime.of(2024, 5, 21, 17, 45, 10);
        clock.set(from);
        Long atFrom = reportService.create(owner, ReportKind.EXPENSE, "At from").id();
        clock.set(to);
        Long atTo = reportService.create(owner, ReportKind.EXPENSE, "At to").id();
        clock.set(to.plusSeconds(1));
        Long afterTo = reportService.create(owner, ReportKind.EXPENSE, "After to").id();

        List<Long> listed = reportService
                .list(owner, ReportKind.EXPENSE, null, null, null, from.toString(), to.toString())
                .stream()
                .map(ReportSummary::id)
                .toList();

        assertThat(listed).containsExactly(atTo).doesNotContain(atFrom, afterTo);
    }

    @Test
    void lineAcceptsTitleAndDescriptionAtTheirMaximumLengths() {
        Caller owner = newCaller(appUserRepository, Role.User);
        Long reportId = reportService.create(owner, ReportKind.EXPENSE, "Limits").id();
        String title = "L".repeat(50);
        String description = "d".repeat(1500);

        LineView created = lineService.create(owner, ReportKind.EXPENSE, reportId, line(
                ReferenceIds.EXPENSE_TYPE_OTHER, ReferenceIds.CURRENCY_EURO, BigDecimal.TEN, null,
                title, description, LINE_DATE));

        assertThat(created.title()).isEqualTo(title);
        assertThat(created.description()).isEqualTo(description);
    }

    static Stream<Arguments> lineRejectsTitleOrDescriptionOverTheLimit() {
        return Stream.of(
                arguments("L".repeat(51), "", LegacyMessages.MAX_LENGTH_50),
                arguments("Title", "d".repeat(1501), LegacyMessages.MAX_LENGTH_1500));
    }

    @ParameterizedTest(name = "rejected with \"{2}\"")
    @MethodSource
    void lineRejectsTitleOrDescriptionOverTheLimit(String title, String description, String message) {
        Caller owner = newCaller(appUserRepository, Role.User);
        Long reportId = reportService.create(owner, ReportKind.EXPENSE, "Limits").id();
        LineService.LineInput input = line(ReferenceIds.EXPENSE_TYPE_OTHER, ReferenceIds.CURRENCY_EURO, BigDecimal.TEN,
                null, title, description, LINE_DATE);

        assertApiError(() -> lineService.create(owner, ReportKind.EXPENSE, reportId, input),
                422, ApiException.VALIDATION_FAILED, message);
    }

    @Test
    void lineWithAnUnknownCurrencyIsAValidationError() {
        Caller owner = newCaller(appUserRepository, Role.User);
        Long reportId = reportService.create(owner, ReportKind.EXPENSE, "Currency").id();
        LineService.LineInput input = line(ReferenceIds.EXPENSE_TYPE_TRAVEL, 99, BigDecimal.TEN, null,
                "Unknown currency", "", LINE_DATE);

        assertApiError(() -> lineService.create(owner, ReportKind.EXPENSE, reportId, input),
                422, ApiException.VALIDATION_FAILED, LegacyMessages.FIELD_REQUIRED);
        assertThat(expenseRepository.existsByReportId(reportId)).isFalse();
    }

    @Test
    void ownerSavesRestampTheReportAndDecisionsStampOnlyProcessedOn() {
        Caller owner = newCaller(appUserRepository, Role.User);
        Caller admin = newCaller(appUserRepository, Role.Administrator);
        LocalDateTime created = LocalDateTime.of(2024, 5, 20, 9, 0, 1);
        LocalDateTime renamed = LocalDateTime.of(2024, 5, 21, 10, 30, 2);
        LocalDateTime submitted = LocalDateTime.of(2024, 5, 22, 11, 45, 3);
        LocalDateTime decided = LocalDateTime.of(2024, 5, 23, 9, 15, 4);

        clock.set(created);
        Long id = reportService.create(owner, ReportKind.EXPENSE, "Stamps").id();
        assertOwnerStamps(id, owner, created);

        clock.set(renamed);
        reportService.rename(owner, ReportKind.EXPENSE, id, "Stamps renamed");
        assertOwnerStamps(id, owner, renamed);

        lineService.create(owner, ReportKind.EXPENSE, id, line(ReferenceIds.EXPENSE_TYPE_RESTAURANT,
                ReferenceIds.CURRENCY_EURO, new BigDecimal("12.50"), null, "Lunch", "", LocalDate.of(2024, 5, 20)));
        clock.set(submitted);
        reportService.submit(owner, ReportKind.EXPENSE, id);
        ExpenseReport afterSubmit = assertOwnerStamps(id, owner, submitted);
        assertThat(afterSubmit.getSubmitedOn()).isEqualTo(submitted);
        assertThat(afterSubmit.getProcessedOn()).isNull();

        clock.set(decided);
        reportService.decide(admin, ReportKind.EXPENSE, id, true);
        ExpenseReport afterDecision = assertOwnerStamps(id, owner, submitted);
        assertThat(afterDecision.getProcessedOn()).isEqualTo(decided);
        assertThat(afterDecision.getStatusId()).isEqualTo(ReferenceIds.STATUS_APPROVED);
        assertThat(afterDecision.getSubmitedOn()).isEqualTo(submitted);
        assertThat(afterDecision.getTitle()).isEqualTo("Stamps renamed");
    }

    private ExpenseReport assertOwnerStamps(Long id, Caller owner, LocalDateTime stampedAt) {
        ExpenseReport report = expenseReportRepository.findById(id).orElseThrow();
        assertThat(report.getCreatedOn()).isEqualTo(stampedAt);
        assertThat(report.getUpdatedOn()).isEqualTo(stampedAt);
        assertThat(report.getCreatedBy()).isEqualTo(owner.id());
        assertThat(report.getSubmitedBy()).isEqualTo(owner.id());
        assertThat(report.getUpdatedBy()).isEqualTo(owner.id());
        return report;
    }

    private Long storeReport(ReportKind kind, String code, int statusId, Caller owner) {
        return switch (kind) {
            case EXPENSE -> expenseReportRepository.save(stamped(new ExpenseReport(), code, statusId, owner)).getId();
            case EARNING -> earningReportRepository.save(stamped(new EarningReport(), code, statusId, owner)).getId();
        };
    }

    private <R extends ReportEntity> R stamped(R report, String code, int statusId, Caller owner) {
        LocalDateTime now = clock.localDateTime();
        report.setCode(code);
        report.setTitle("Report " + code);
        report.setStatusId(statusId);
        report.setCreatedBy(owner.id());
        report.setSubmitedBy(owner.id());
        report.setUpdatedBy(owner.id());
        report.setCreatedOn(now);
        report.setUpdatedOn(now);
        report.setSubmitedOn(statusId == ReferenceIds.STATUS_DRAFT ? null : now);
        report.setIsActive(false);
        return report;
    }

    private LineView draftWithLine(Caller owner) {
        Long reportId = reportService.create(owner, ReportKind.EXPENSE, "London Trip").id();
        return lineService.create(owner, ReportKind.EXPENSE, reportId, line(ReferenceIds.EXPENSE_TYPE_TRAVEL,
                ReferenceIds.CURRENCY_EURO, new BigDecimal("42.00"), null, "Flight tickets",
                "Tickets for flight to London", LINE_DATE));
    }

    private static Caller newCaller(AppUserRepository users, Role role) {
        String username = role.name().toLowerCase(Locale.ROOT) + "-" + UUID.randomUUID();
        String name = role.name() + " " + username.substring(username.length() - 6);
        AppUser saved = users.save(new AppUser(username, name, "unused-hash", EnumSet.of(role)));
        return new Caller(saved.getId(), username, name, EnumSet.of(role, Role.Registered));
    }

    private static LineService.LineInput line(Integer typeId, Integer currencyId, BigDecimal amount,
            BigDecimal kilometers, String title, String description, LocalDate date) {
        return new LineService.LineInput(typeId, currencyId, amount, kilometers, title, description, date);
    }

    private static BigDecimal decimal(String value) {
        return value == null ? null : new BigDecimal(value);
    }

    private static void assertApiError(ThrowingCallable call, int status, String code, String message) {
        assertThatExceptionOfType(ApiException.class).isThrownBy(call).satisfies(error -> {
            assertThat(error.status()).isEqualTo(status);
            assertThat(error.code()).isEqualTo(code);
            assertThat(messagesOf(error)).contains(message);
        });
    }

    private static List<String> messagesOf(ApiException error) {
        List<String> messages = new ArrayList<>();
        messages.add(error.getMessage());
        error.fieldErrors().stream().map(FieldViolation::message).forEach(messages::add);
        return messages;
    }

    // @Nested classes must be inner (non-static); each loads its own context on the same H2 file.
    @Nested
    @TestPropertySource(properties = {"expenses.mileage-reimbursement=0.50", "expenses.dollars-to-euros=0.90"})
    class ConfiguredRates {

        @Autowired
        private AppUserRepository users;
        @Autowired
        private ExpenseRepository expenses;
        @Autowired
        private ReportService reports;
        @Autowired
        private LineService lines;
        @Autowired
        private ReferenceDataService referenceData;
        @Autowired
        private MutableClock ratesClock;

        @BeforeEach
        void setClock() {
            ratesClock.set(MutableClock.DEFAULT_TIME);
        }

        @Test
        void overriddenRatesDriveStoredAmounts() {
            Caller owner = newCaller(users, Role.User);
            Long reportId = reports.create(owner, ReportKind.EXPENSE, "Rates").id();

            LineView mileage = lines.create(owner, ReportKind.EXPENSE, reportId, line(
                    ReferenceIds.EXPENSE_TYPE_KILOMETERS, null, null, new BigDecimal("10"), "Mileage", "", LINE_DATE));
            LineView dollars = lines.create(owner, ReportKind.EXPENSE, reportId, line(
                    ReferenceIds.EXPENSE_TYPE_TRAVEL, ReferenceIds.CURRENCY_DOLLAR, new BigDecimal("100.00"), null,
                    "Dollars", "", LINE_DATE));

            assertThat(expenses.findById(mileage.id()).orElseThrow().getAmountInEuros()).isEqualByComparingTo("5.00");
            assertThat(expenses.findById(dollars.id()).orElseThrow().getAmountInEuros()).isEqualByComparingTo("90.00");
        }

        @Test
        void referenceDataReportsTheOverriddenRates() {
            ReferenceData data = referenceData.referenceData();

            assertThat(data.mileageReimbursement()).isEqualByComparingTo("0.50");
            assertThat(data.dollarsToEuros()).isEqualByComparingTo("0.90");
            assertThat(data.vatRate()).isEqualByComparingTo("0.23");
        }
    }

    @Nested
    @TestPropertySource(properties = "expenses.dashboard.reference-date=2025-01-15")
    class JanuaryReferenceDate {

        @Autowired
        private AppUserRepository users;
        @Autowired
        private ReportService reports;
        @Autowired
        private LineService lines;
        @Autowired
        private DashboardService dashboard;
        @Autowired
        private MutableClock januaryClock;

        @BeforeEach
        void setClock() {
            januaryClock.set(LocalDateTime.of(2025, 1, 15, 10, 0));
        }

        @Test
        void lastMonthIgnoresTheYearSoDecemberLinesAreNotCounted() {
            Caller owner = newCaller(users, Role.User);
            Long reportId = reports.create(owner, ReportKind.EXPENSE, "December trip").id();
            lines.create(owner, ReportKind.EXPENSE, reportId, line(
                    ReferenceIds.EXPENSE_TYPE_TRAVEL, ReferenceIds.CURRENCY_EURO, new BigDecimal("100.00"), null,
                    "Train", "", LocalDate.of(2024, 12, 15)));
            reports.submit(owner, ReportKind.EXPENSE, reportId);

            UserDashboard stats = dashboard.user(owner);

            assertThat(stats.balance()).isEqualByComparingTo("-100.00");
            assertThat(stats.lastMonthSpent()).isEqualByComparingTo("0.00");
            assertThat(stats.currentMonthSpent()).isEqualByComparingTo("0.00");
            assertThat(stats.monthChangePercent()).isNull();
            assertThat(stats.lastMonth()).isEqualTo(new Period(LocalDate.of(2024, 12, 1), LocalDate.of(2024, 12, 31)));
            assertThat(stats.currentMonth()).isEqualTo(new Period(LocalDate.of(2025, 1, 1), LocalDate.of(2025, 1, 31)));
        }
    }
}
