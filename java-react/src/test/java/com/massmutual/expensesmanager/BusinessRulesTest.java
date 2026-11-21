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
import com.massmutual.expensesmanager.service.KindRepositories;
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
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.Comparator;
import java.util.EnumSet;
import java.util.List;
import java.util.Locale;
import java.util.Queue;
import java.util.UUID;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.FutureTask;
import java.util.concurrent.TimeUnit;
import java.util.stream.Stream;
import org.assertj.core.api.ThrowableAssert.ThrowingCallable;
import org.hibernate.exception.ConstraintViolationException;
import org.hibernate.exception.DataException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.EnumSource;
import org.junit.jupiter.params.provider.MethodSource;
import org.junit.jupiter.params.provider.NullSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.TestPropertySource;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

// Not @Transactional: create() commits in its own REQUIRES_NEW transaction, so every assertion reads committed rows.
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.NONE, properties = "expenses.seed.enabled=false")
@Import({MutableClock.Beans.class, BusinessRulesTest.ScriptedCodes.class})
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
    private ScriptedCodeGenerator reportCodeGenerator;

    @Autowired
    private MutableClock clock;
    @Autowired
    private PlatformTransactionManager transactionManager;

    @BeforeEach
    void resetData() {
        invoiceExpenseRepository.deleteAllInBatch();
        invoiceEarningRepository.deleteAllInBatch();
        expenseRepository.deleteAllInBatch();
        earningRepository.deleteAllInBatch();
        expenseReportRepository.deleteAllInBatch();
        earningReportRepository.deleteAllInBatch();
        clock.set(MutableClock.DEFAULT_TIME);
        reportCodeGenerator.reset();
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
                arguments(ReportKind.EARNING, List.of("9/2024 EA"), MutableClock.DEFAULT_TIME, "10/2024 EA"),
                arguments(ReportKind.EXPENSE, List.of("2147483647/2024 EX"),
                        MutableClock.DEFAULT_TIME, "2147483648/2024 EX"),
                arguments(ReportKind.EXPENSE, List.of("99999999999999999999/2024 EX", "5/2024 EX"),
                        MutableClock.DEFAULT_TIME, "100000000000000000000/2024 EX"),
                arguments(ReportKind.EXPENSE, List.of("abc/2024 EX", "3/2024 EX"),
                        MutableClock.DEFAULT_TIME, "4/2024 EX"));
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
    void nextCodeRefusesACodeLongerThanTheCodeColumn() {
        Caller owner = newCaller(appUserRepository, Role.User);
        String longestCode = "9".repeat(42) + "/2024 EX";
        ExpenseReport report = stamped(new ExpenseReport(), longestCode, ReferenceIds.STATUS_SUBMITTED, owner);
        // The stamped "Report <code>" title would exceed the 50-character Title column.
        report.setTitle("Longest code");
        expenseReportRepository.save(report);

        assertThatExceptionOfType(IllegalStateException.class)
                .isThrownBy(() -> reportCodeGenerator.nextCode(ReportKind.EXPENSE));
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

    @ParameterizedTest(name = "padding-only title #{index}")
    @ValueSource(strings = {"\u0000", "\u0000\u2003", "\u2003", " \t "})
    void createAndRenameRejectATitleOfOnlyControlOrWhitespaceCharacters(String title) {
        Caller owner = newCaller(appUserRepository, Role.User);
        Long draftId = reportService.create(owner, ReportKind.EXPENSE, "Draft").id();

        assertApiError(() -> reportService.create(owner, ReportKind.EXPENSE, title),
                422, ApiException.VALIDATION_FAILED, LegacyMessages.INSERT_TITLE);
        assertApiError(() -> reportService.rename(owner, ReportKind.EXPENSE, draftId, title),
                422, ApiException.VALIDATION_FAILED, LegacyMessages.INSERT_TITLE);
        assertThat(expenseReportRepository.findAll()).extracting(ExpenseReport::getTitle).containsExactly("Draft");
    }

    @Test
    void createAndRenameStoreTheTitleWithoutControlOrWhitespacePadding() {
        Caller owner = newCaller(appUserRepository, Role.User);
        String fiftyCharacters = "T".repeat(50);

        Long id = reportService.create(owner, ReportKind.EXPENSE, "\u0000\u2003" + fiftyCharacters + " \t").id();
        assertThat(expenseReportRepository.findById(id).orElseThrow().getTitle()).isEqualTo(fiftyCharacters);

        reportService.rename(owner, ReportKind.EXPENSE, id, "\u2003 Car Rental \u0000");
        assertThat(expenseReportRepository.findById(id).orElseThrow().getTitle()).isEqualTo("Car Rental");
    }

    @ParameterizedTest(name = "{0} code {1} collides twice on {2}")
    @CsvSource({
            "EXPENSE, 1/2024 EX, PUBLIC.EXPENSEREPORT_UNIQUEINDEX_REPORTCODE",
            "EARNING, 1/2024 EA, PUBLIC.EARNINGREPORT_UNIQUEINDEX_REPORTCODE"})
    void createRetriesACodeCollisionOnceThenAnswersCodeConflict(ReportKind kind, String code, String index) {
        Caller owner = newCaller(appUserRepository, Role.User);
        storeReport(kind, code, ReferenceIds.STATUS_SUBMITTED, owner);
        reportCodeGenerator.script(List.of(code, code));

        assertThatExceptionOfType(ApiException.class)
                .isThrownBy(() -> reportService.create(owner, kind, "Collides"))
                .satisfies(error -> {
                    assertThat(error.status()).isEqualTo(409);
                    assertThat(error.code()).isEqualTo(ApiException.CODE_CONFLICT);
                    assertThat(error.getMessage()).isEqualTo(LegacyMessages.GENERIC_ERROR);
                })
                .havingCause()
                .isInstanceOf(DataIntegrityViolationException.class)
                .havingCause()
                .isInstanceOfSatisfying(ConstraintViolationException.class,
                        violation -> assertThat(violation.getConstraintName()).isEqualTo(index));
        assertThat(reportCodeGenerator.calls(kind)).isEqualTo(2);
    }

    @Test
    void createRetriesACodeCollisionWithTheNextFreeCode() {
        Caller owner = newCaller(appUserRepository, Role.User);
        storeReport(ReportKind.EXPENSE, "1/2024 EX", ReferenceIds.STATUS_SUBMITTED, owner);
        reportCodeGenerator.script(List.of("1/2024 EX"));

        ReportSummary created = reportService.create(owner, ReportKind.EXPENSE, "Retried");

        assertThat(created.code()).isEqualTo("2/2024 EX");
        assertThat(created.status()).isEqualTo("Draft");
        assertThat(reportCodeGenerator.calls(ReportKind.EXPENSE)).isEqualTo(2);
    }

    static Stream<Arguments> createPropagatesAnIntegrityFailureThatIsNotACodeCollision() {
        String overlongCode = "X".repeat(51);
        return Stream.of(
                arguments(List.of(overlongCode), 1),
                arguments(List.of("1/2024 EX", overlongCode), 2));
    }

    @ParameterizedTest(name = "integrity failure on attempt {1}")
    @MethodSource
    void createPropagatesAnIntegrityFailureThatIsNotACodeCollision(List<String> codes, int attempts) {
        Caller owner = newCaller(appUserRepository, Role.User);
        storeReport(ReportKind.EXPENSE, "1/2024 EX", ReferenceIds.STATUS_SUBMITTED, owner);
        reportCodeGenerator.script(codes);

        assertThatExceptionOfType(DataIntegrityViolationException.class)
                .isThrownBy(() -> reportService.create(owner, ReportKind.EXPENSE, "Overlong code"))
                .havingCause()
                .isInstanceOf(DataException.class);
        assertThat(reportCodeGenerator.calls(ReportKind.EXPENSE)).isEqualTo(attempts);
        assertThat(expenseReportRepository.count()).isEqualTo(1);
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

    enum Write { SUBMIT, DECIDE, RENAME, DELETE_REPORT, CREATE_LINE, UPDATE_LINE, DELETE_LINE, UPLOAD_INVOICE }

    static Stream<Arguments> competingWrites() {
        return Stream.of(
                arguments(Write.DELETE_LINE, Write.SUBMIT, 422, ApiException.NO_LINES, LegacyMessages.NO_LINES,
                        ReferenceIds.STATUS_DRAFT, 0),
                arguments(Write.SUBMIT, Write.DELETE_LINE, 409, ApiException.NOT_DRAFT,
                        LegacyMessages.DETAIL_CANT_BE_DELETED, ReferenceIds.STATUS_SUBMITTED, 1),
                arguments(Write.SUBMIT, Write.UPDATE_LINE, 409, ApiException.NOT_DRAFT, LegacyMessages.NOT_DRAFT,
                        ReferenceIds.STATUS_SUBMITTED, 1),
                arguments(Write.SUBMIT, Write.CREATE_LINE, 409, ApiException.NOT_DRAFT, LegacyMessages.NOT_DRAFT,
                        ReferenceIds.STATUS_SUBMITTED, 1),
                arguments(Write.SUBMIT, Write.UPLOAD_INVOICE, 409, ApiException.NOT_DRAFT, LegacyMessages.NOT_DRAFT,
                        ReferenceIds.STATUS_SUBMITTED, 1),
                arguments(Write.SUBMIT, Write.RENAME, 409, ApiException.NOT_DRAFT, LegacyMessages.NOT_DRAFT,
                        ReferenceIds.STATUS_SUBMITTED, 1),
                arguments(Write.SUBMIT, Write.DELETE_REPORT, 409, ApiException.NOT_DRAFT,
                        LegacyMessages.REPORT_CANT_BE_DELETED, ReferenceIds.STATUS_SUBMITTED, 1),
                arguments(Write.DECIDE, Write.UPLOAD_INVOICE, 409, ApiException.NOT_DRAFT, LegacyMessages.NOT_DRAFT,
                        ReferenceIds.STATUS_APPROVED, 1),
                arguments(Write.DELETE_LINE, Write.UPDATE_LINE, 404, ApiException.NOT_FOUND, LegacyMessages.NOT_FOUND,
                        ReferenceIds.STATUS_DRAFT, 0));
    }

    @ParameterizedTest(name = "{1} waiting on {0} gives {2} {3}")
    @MethodSource("competingWrites")
    void aWriteWaitingOnTheReportLockSeesTheCommittedState(Write first, Write second, int status, String code,
            String message, int statusAfter, int linesAfter) throws Exception {
        Caller owner = newCaller(appUserRepository, Role.User);
        Caller admin = newCaller(appUserRepository, Role.Administrator);
        LineView line = draftWithLine(owner);
        TransactionTemplate transaction = new TransactionTemplate(transactionManager);
        CountDownLatch firstWritten = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        FutureTask<Void> holder = new FutureTask<>(() -> transaction.executeWithoutResult(tx -> {
            try {
                write(first, owner, admin, line);
            } finally {
                firstWritten.countDown();
            }
            awaitLatch(release);
        }), null);
        FutureTask<Void> waiter = new FutureTask<>(() -> write(second, owner, admin, line), null);

        Thread.State waiterState;
        ReportDetail readDuringLock;
        try {
            start(holder);
            assertThat(firstWritten.await(10, TimeUnit.SECONDS)).as("first write ran").isTrue();
            waiterState = awaitLockWaitOrEnd(start(waiter));
            readDuringLock = reportService.detail(owner, ReportKind.EXPENSE, line.reportId());
        } finally {
            release.countDown();
        }
        holder.get(10, TimeUnit.SECONDS);

        assertApiError(() -> outcomeOf(waiter), status, code, message);
        assertThat(waiterState).as("second write waited for the report lock")
                .isIn(Thread.State.WAITING, Thread.State.TIMED_WAITING);
        assertThat(readDuringLock.status()).isEqualTo("Draft");
        ExpenseReport report = expenseReportRepository.findById(line.reportId()).orElseThrow();
        assertThat(report.getStatusId()).isEqualTo(statusAfter);
        assertThat(report.getTitle()).isEqualTo("London Trip");
        assertThat(expenseRepository.findByReportId(line.reportId())).hasSize(linesAfter)
                .allSatisfy(stored -> assertThat(stored.getTitle()).isEqualTo("Flight tickets"));
        assertThat(invoiceExpenseRepository.existsById(line.id())).isFalse();
    }

    private void write(Write write, Caller owner, Caller admin, LineView line) {
        LineService.LineInput input = line(ReferenceIds.EXPENSE_TYPE_TRAVEL, ReferenceIds.CURRENCY_EURO,
                new BigDecimal("10.00"), null, "Taxi", "", LINE_DATE);
        switch (write) {
            case SUBMIT -> reportService.submit(owner, ReportKind.EXPENSE, line.reportId());
            case DECIDE -> reportService.decide(admin, ReportKind.EXPENSE, line.reportId(), true);
            case RENAME -> reportService.rename(owner, ReportKind.EXPENSE, line.reportId(), "Renamed");
            case DELETE_REPORT -> reportService.delete(owner, ReportKind.EXPENSE, line.reportId());
            case CREATE_LINE -> lineService.create(owner, ReportKind.EXPENSE, line.reportId(), input);
            case UPDATE_LINE -> lineService.update(owner, ReportKind.EXPENSE, line.id(), input);
            case DELETE_LINE -> lineService.delete(owner, ReportKind.EXPENSE, line.id());
            case UPLOAD_INVOICE -> invoiceService.upload(owner, ReportKind.EXPENSE, line.id(), "receipt.png",
                    "image/png", PNG_BYTES);
        }
    }

    private static Thread start(FutureTask<Void> task) {
        Thread thread = new Thread(task);
        thread.start();
        return thread;
    }

    // H2 parks a session waiting for a row lock, so a parked thread inside H2 is waiting on the lock.
    private static Thread.State awaitLockWaitOrEnd(Thread thread) throws InterruptedException {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(10);
        Thread.State state = thread.getState();
        while (System.nanoTime() < deadline) {
            state = thread.getState();
            boolean parked = state == Thread.State.WAITING || state == Thread.State.TIMED_WAITING;
            if (state == Thread.State.TERMINATED || parked && Arrays.stream(thread.getStackTrace())
                    .anyMatch(frame -> frame.getClassName().startsWith("org.h2."))) {
                return state;
            }
            Thread.sleep(5);
        }
        return state;
    }

    private static void awaitLatch(CountDownLatch latch) {
        try {
            if (!latch.await(10, TimeUnit.SECONDS)) {
                throw new IllegalStateException("Lock holder was never released");
            }
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException(interrupted);
        }
    }

    private static void outcomeOf(FutureTask<Void> task) throws Throwable {
        try {
            task.get(10, TimeUnit.SECONDS);
        } catch (ExecutionException failure) {
            throw failure.getCause();
        }
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
    void aRepeatUploadReplacesTheInvoice() {
        Caller owner = newCaller(appUserRepository, Role.User);
        LineView line = draftWithLine(owner);
        byte[] pdf = "%PDF-1.7".getBytes(StandardCharsets.US_ASCII);
        invoiceService.upload(owner, ReportKind.EXPENSE, line.id(), "receipt.png", "image/png", PNG_BYTES);
        LocalDateTime replacedAt = MutableClock.DEFAULT_TIME.plusHours(1);
        clock.set(replacedAt);

        invoiceService.upload(owner, ReportKind.EXPENSE, line.id(), "invoice.pdf", "application/pdf", pdf);
        InvoiceFile file = invoiceService.download(owner, ReportKind.EXPENSE, line.id());

        assertThat(file.filename()).isEqualTo("invoice.pdf");
        assertThat(file.contentType()).isEqualTo("application/pdf");
        assertThat(file.content()).isEqualTo(pdf);
        assertThat(invoiceExpenseRepository.count()).isEqualTo(1);
        assertThat(invoiceExpenseRepository.findInfoById(line.id()).orElseThrow().getDatetime()).isEqualTo(replacedAt);
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

    @ParameterizedTest(name = "sort \"{0}\"")
    @ValueSource(strings = {"id", "title", "id,desc,extra", ",desc", "id,", "nope,asc", "id,up"})
    void listRejectsASortThatIsNotAColumnAndDirection(String sort) {
        Caller owner = newCaller(appUserRepository, Role.User);
        ThrowingCallable listing = () -> reportService.list(owner, ReportKind.EXPENSE, null, null, sort, null, null);

        assertApiError(listing, 422, ApiException.VALIDATION_FAILED, LegacyMessages.INVALID_VALUE);
        assertThatExceptionOfType(ApiException.class).isThrownBy(listing).satisfies(error ->
                assertThat(error.fieldErrors()).extracting(FieldViolation::field).containsExactly("sort"));
    }

    static Stream<Arguments> listOrdersByTheRequestedSort() {
        List<String> newestFirst = List.of("Gamma", "Alpha", "Beta");
        return Stream.of(
                arguments("title,asc", List.of("Alpha", "Beta", "Gamma")),
                arguments("Title,DESC", List.of("Gamma", "Beta", "Alpha")),
                arguments("id,desc", newestFirst),
                arguments(null, newestFirst));
    }

    @ParameterizedTest(name = "sort \"{0}\" lists {1}")
    @MethodSource
    void listOrdersByTheRequestedSort(String sort, List<String> titles) {
        Caller owner = newCaller(appUserRepository, Role.User);
        List.of("Beta", "Alpha", "Gamma").forEach(title -> reportService.create(owner, ReportKind.EXPENSE, title));

        assertThat(reportService.list(owner, ReportKind.EXPENSE, null, null, sort, null, null))
                .extracting(ReportSummary::title)
                .containsExactlyElementsOf(titles);
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

    enum Submitter { CREATOR, ANOTHER_USER, NONE }

    @ParameterizedTest(name = "submitter {0}")
    @EnumSource(Submitter.class)
    void detailNamesTheCreatorAndTheSubmitter(Submitter submitter) {
        Caller owner = newCaller(appUserRepository, Role.User);
        Caller submittedBy = switch (submitter) {
            case CREATOR -> owner;
            case ANOTHER_USER -> newCaller(appUserRepository, Role.User);
            case NONE -> null;
        };
        ExpenseReport report = stamped(new ExpenseReport(), "1/2024 EX", ReferenceIds.STATUS_SUBMITTED, owner);
        report.setSubmitedBy(submittedBy == null ? null : submittedBy.id());
        Long id = expenseReportRepository.save(report).getId();

        ReportDetail detail = reportService.detail(owner, ReportKind.EXPENSE, id);

        assertThat(detail.createdByName()).isEqualTo(owner.displayName());
        assertThat(detail.submittedBy()).isEqualTo(submittedBy == null ? null : submittedBy.displayName());
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

    @TestConfiguration(proxyBeanMethods = false)
    static class ScriptedCodes {

        @Bean
        @Primary
        ScriptedCodeGenerator scriptedCodeGenerator(KindRepositories kindRepositories, Clock clock) {
            return new ScriptedCodeGenerator(kindRepositories, clock);
        }
    }

    // Lets create() meet a chosen code, such as a taken one, before the real sequence resumes.
    static class ScriptedCodeGenerator extends ReportCodeGenerator {

        private final Queue<String> scripted = new ConcurrentLinkedQueue<>();
        private final List<ReportKind> requests = new CopyOnWriteArrayList<>();

        ScriptedCodeGenerator(KindRepositories kindRepositories, Clock clock) {
            super(kindRepositories, clock);
        }

        @Override
        public String nextCode(ReportKind kind) {
            requests.add(kind);
            String code = scripted.poll();
            return code != null ? code : super.nextCode(kind);
        }

        void script(List<String> codes) {
            scripted.addAll(codes);
        }

        int calls(ReportKind kind) {
            return Collections.frequency(requests, kind);
        }

        void reset() {
            scripted.clear();
            requests.clear();
        }
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
