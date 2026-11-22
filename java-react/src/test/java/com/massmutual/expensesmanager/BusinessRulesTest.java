package com.massmutual.expensesmanager;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatExceptionOfType;
import static org.junit.jupiter.params.provider.Arguments.arguments;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.massmutual.expensesmanager.domain.AppUser;
import com.massmutual.expensesmanager.domain.EarningReport;
import com.massmutual.expensesmanager.domain.Expense;
import com.massmutual.expensesmanager.domain.ExpenseReport;
import com.massmutual.expensesmanager.domain.InvoiceEarning;
import com.massmutual.expensesmanager.domain.InvoiceEntity;
import com.massmutual.expensesmanager.domain.InvoiceExpense;
import com.massmutual.expensesmanager.domain.LineEntity;
import com.massmutual.expensesmanager.domain.ReferenceIds;
import com.massmutual.expensesmanager.domain.ReportEntity;
import com.massmutual.expensesmanager.domain.ReportKind;
import com.massmutual.expensesmanager.domain.Role;
import com.massmutual.expensesmanager.repository.AppUserRepository;
import com.massmutual.expensesmanager.repository.BlogPostRepository;
import com.massmutual.expensesmanager.repository.CurrencyRepository;
import com.massmutual.expensesmanager.repository.EarningReportRepository;
import com.massmutual.expensesmanager.repository.EarningRepository;
import com.massmutual.expensesmanager.repository.EarningTypeRepository;
import com.massmutual.expensesmanager.repository.ExpenseReportRepository;
import com.massmutual.expensesmanager.repository.ExpenseRepository;
import com.massmutual.expensesmanager.repository.ExpenseTypeRepository;
import com.massmutual.expensesmanager.repository.InvoiceEarningRepository;
import com.massmutual.expensesmanager.repository.InvoiceExpenseRepository;
import com.massmutual.expensesmanager.repository.InvoiceRepository;
import com.massmutual.expensesmanager.repository.LineRepository;
import com.massmutual.expensesmanager.repository.ReportRepository;
import com.massmutual.expensesmanager.repository.StatusRepository;
import com.massmutual.expensesmanager.service.AmountCalculator;
import com.massmutual.expensesmanager.service.ApiException;
import com.massmutual.expensesmanager.service.AppUserPrincipal;
import com.massmutual.expensesmanager.service.AuthService;
import com.massmutual.expensesmanager.service.BlogService;
import com.massmutual.expensesmanager.service.Caller;
import com.massmutual.expensesmanager.service.ClockConfig;
import com.massmutual.expensesmanager.service.DashboardService;
import com.massmutual.expensesmanager.service.ExpensesProperties;
import com.massmutual.expensesmanager.service.InvoiceService;
import com.massmutual.expensesmanager.service.KindRepositories;
import com.massmutual.expensesmanager.service.LegacyMessages;
import com.massmutual.expensesmanager.service.LineService;
import com.massmutual.expensesmanager.service.ReferenceDataService;
import com.massmutual.expensesmanager.service.ReportAccessPolicy;
import com.massmutual.expensesmanager.service.ReportCodeGenerator;
import com.massmutual.expensesmanager.service.ReportService;
import com.massmutual.expensesmanager.service.SeedDataLoader;
import com.massmutual.expensesmanager.service.ToolsService;
import com.massmutual.expensesmanager.service.model.BlogPostView;
import com.massmutual.expensesmanager.service.model.DatedAmount;
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
import com.massmutual.expensesmanager.web.dto.LineRequest;
import jakarta.validation.Validator;
import java.io.UncheckedIOException;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.Comparator;
import java.util.EnumSet;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.Queue;
import java.util.UUID;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.FutureTask;
import java.util.concurrent.TimeUnit;
import java.util.function.Consumer;
import java.util.stream.IntStream;
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
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.context.properties.bind.validation.BindValidationException;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.crypto.password.PasswordEncoder;
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
    private static final StoredInvoice TWIN_INVOICE = new StoredInvoice("twin.jpg", "image/jpeg",
            new byte[] {(byte) 0xFF, (byte) 0xD8, (byte) 0xFF}, LocalDateTime.of(2024, 5, 22, 8, 30));
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final String SEED_PASSWORD = UUID.randomUUID().toString();
    private static final String SEED_TEMPLATE = """
            {
              "users": [
                {"username": "%1$s_owner", "name": "Seedcheck Owner", "password": "%2$s", "roles": ["User"]},
                {"username": "%1$s_admin", "name": "Seedcheck Admin", "password": null, "roles": ["Administrator"]}
              ],
              "reports": [
                {"kind": "expense", "code": "901/2099 EX", "title": "Seedcheck expenses", "owner": "%1$s_owner",
                 "status": "Submitted", "createdOn": "2099-03-02T09:00:00", "submitedOn": "2099-03-03T09:00:00",
                 "lines": [
                   {"date": "2099-03-01", "title": "Seedcheck lunch", "typeId": 1, "amount": 80.00},
                   {"date": "2099-03-02", "title": "Seedcheck mileage", "typeId": 3, "kilometers": 10}
                 ]},
                {"kind": "earning", "code": "901/2099 EA", "title": "Seedcheck earnings", "owner": "%1$s_owner",
                 "status": "Draft", "createdOn": "2099-03-05T09:00:00", "lines": []}
              ],
              "blogPosts": [
                {"title": "Seedcheck post", "description": "Seedcheck news", "author": "%1$s_admin",
                 "createdOn": "2099-03-16T10:00:00"}
              ]
            }
            """;

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
    private CurrencyRepository currencyRepository;
    @Autowired
    private StatusRepository statusRepository;
    @Autowired
    private ExpenseTypeRepository expenseTypeRepository;
    @Autowired
    private EarningTypeRepository earningTypeRepository;

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
    private SeedDataLoader seedDataLoader;
    @Autowired
    private Validator validator;
    @Autowired
    private AuthService authService;
    @Autowired
    private PasswordEncoder passwordEncoder;
    @Autowired
    private ToolsService toolsService;
    @Autowired
    private AmountCalculator amountCalculator;
    @Autowired
    private KindRepositories kindRepositories;
    @Autowired
    private ReportAccessPolicy reportAccessPolicy;
    @Autowired
    private ExpensesProperties expensesProperties;

    @Autowired
    private MutableClock clock;
    @Autowired
    private PlatformTransactionManager transactionManager;
    @Autowired
    private JdbcTemplate jdbcTemplate;

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

    @ParameterizedTest(name = "{0}={2}")
    @CsvSource({
            "expenses.mileage-reimbursement, mileageReimbursement, 1000",
            "expenses.mileage-reimbursement, mileageReimbursement, 100000000000000",
            "expenses.mileage-reimbursement, mileageReimbursement, 99999999999999.99999999",
            "expenses.dollars-to-euros, dollarsToEuros, 1000",
            "expenses.dollars-to-euros, dollarsToEuros, 100000000000000",
            "expenses.dollars-to-euros, dollarsToEuros, 99999999999999.99999999"})
    void rateOfOneThousandOrMoreFailsBindingNamingTheKey(String property, String field, String value) {
        new ApplicationContextRunner()
                .withUserConfiguration(PropertiesBinding.class)
                .withPropertyValues(property + "=" + value)
                .run(context -> {
                    assertThat(context).hasFailed();
                    assertThat(context.getStartupFailure()).rootCause()
                            .isInstanceOfSatisfying(BindValidationException.class,
                                    error -> assertThat(error.getValidationErrors().getAllErrors()).hasSize(1))
                            .hasMessageContaining("on field '%s'", field)
                            .hasMessageContaining("origin \"%s\"", property);
                });
    }

    @Test
    void largestBindableRatesAreAcceptedByTheConverterAndLines() {
        new ApplicationContextRunner()
                .withUserConfiguration(PropertiesBinding.class)
                .withPropertyValues("expenses.mileage-reimbursement=999.99999999",
                        "expenses.dollars-to-euros=999.99999999")
                .run(context -> {
                    assertThat(context).hasNotFailed();
                    ExpensesProperties properties = context.getBean(ExpensesProperties.class);
                    assertThat(properties.mileageReimbursement()).isEqualByComparingTo("999.99999999");
                    assertThat(properties.dollarsToEuros()).isEqualByComparingTo("999.99999999");
                    AmountCalculator calculator = new AmountCalculator(properties);
                    assertThat(calculator.usdToEur(BigDecimal.ONE, properties.dollarsToEuros()))
                            .isEqualByComparingTo("1000.0000");
                    assertThat(calculator.usdToEur(BigDecimal.ONE, new BigDecimal("999999999999999.99999999")))
                            .isEqualByComparingTo("1000000000000000.0000");
                    BigDecimal largestLineValue = new BigDecimal("999999999999.9999");
                    assertThat(calculator.lineAmounts(ReportKind.EXPENSE, ReferenceIds.EXPENSE_TYPE_KILOMETERS,
                            null, null, largestLineValue).amountInEuros())
                            .isEqualByComparingTo("999999999989999.9000");
                    assertThat(calculator.lineAmounts(ReportKind.EXPENSE, ReferenceIds.EXPENSE_TYPE_TRAVEL,
                            ReferenceIds.CURRENCY_DOLLAR, largestLineValue, null).amountInEuros())
                            .isEqualByComparingTo("999999999989999.9000");
                });
    }

    @ParameterizedTest(name = "{0}")
    @ValueSource(strings = {"-999999999-01-01", "0000-12-31", "+10000-01-01", "+999999999-12-31"})
    void referenceDateOutsideTheSupportedYearsFailsBinding(String referenceDate) {
        new ApplicationContextRunner()
                .withUserConfiguration(PropertiesBinding.class)
                .withPropertyValues("expenses.dashboard.reference-date=" + referenceDate)
                .run(context -> {
                    assertThat(context).hasFailed();
                    assertThat(context.getStartupFailure()).rootCause()
                            .isInstanceOfSatisfying(BindValidationException.class,
                                    error -> assertThat(error.getValidationErrors().getAllErrors()).hasSize(1))
                            .hasMessageContaining("on field 'dashboard.referenceDate'")
                            .hasMessageContaining("default message [expenses.dashboard.reference-date must be between"
                                    + " 0001-01-01 and 9999-12-31]");
                });
    }

    // The blank row follows the Clock, fixed at 2024-05-23.
    @ParameterizedTest(name = "reference date ''{0}'' gives {2} to {3}, last month {4} to {5}")
    @CsvSource({
            "0001-01-01, 0001-01-01, 0001-01-01, 0001-01-31, 0000-12-01, 0000-12-31",
            "9999-12-31, 9999-12-31, 9999-12-01, 9999-12-31, 9999-11-01, 9999-11-30",
            "'',         ,           2024-05-01, 2024-05-31, 2024-04-01, 2024-04-30"})
    void bindableReferenceDateDrivesTheDashboardPeriods(String setting, LocalDate pinned,
            LocalDate currentFrom, LocalDate currentTo, LocalDate lastFrom, LocalDate lastTo) {
        Caller owner = newCaller(appUserRepository, Role.User);
        new ApplicationContextRunner()
                .withUserConfiguration(PropertiesBinding.class)
                .withPropertyValues("expenses.dashboard.reference-date=" + setting)
                .run(context -> {
                    assertThat(context).hasNotFailed();
                    ExpensesProperties properties = context.getBean(ExpensesProperties.class);
                    assertThat(properties.dashboard().referenceDate()).isEqualTo(pinned);

                    UserDashboard stats = new DashboardService(kindRepositories, reportAccessPolicy,
                            amountCalculator, properties, clock).user(owner);

                    assertThat(stats.currentMonth()).isEqualTo(new Period(currentFrom, currentTo));
                    assertThat(stats.lastMonth()).isEqualTo(new Period(lastFrom, lastTo));
                });
    }

    @Test
    void perDateSumsEachKindPerDayBeforeRoundingAndKeepsOnlyTheThirtyDayWindow() {
        Caller owner = newCaller(appUserRepository, Role.User);
        LocalDate windowStart = LocalDate.of(2024, 4, 23);
        Long tripId = reportService.create(owner, ReportKind.EXPENSE, "Dashboard trip").id();
        List<Long> dollarLineIds = Stream.of(ReferenceIds.EXPENSE_TYPE_TRAVEL, ReferenceIds.EXPENSE_TYPE_RESTAURANT)
                .map(typeId -> lineService.create(owner, ReportKind.EXPENSE, tripId, line(typeId,
                        ReferenceIds.CURRENCY_DOLLAR, new BigDecimal("1.05"), null, "Dollars", "", LINE_DATE)).id())
                .toList();
        lineService.create(owner, ReportKind.EXPENSE, tripId, line(ReferenceIds.EXPENSE_TYPE_TRAVEL,
                ReferenceIds.CURRENCY_EURO, new BigDecimal("10.00"), null, "First day", "", windowStart));
        lineService.create(owner, ReportKind.EXPENSE, tripId, line(ReferenceIds.EXPENSE_TYPE_TRAVEL,
                ReferenceIds.CURRENCY_EURO, new BigDecimal("99.00"), null, "Day before", "", windowStart.minusDays(1)));
        Long payId = reportService.create(owner, ReportKind.EARNING, "Dashboard pay").id();
        lineService.create(owner, ReportKind.EARNING, payId, line(ReferenceIds.EARNING_TYPE_SALARY,
                ReferenceIds.CURRENCY_EURO, new BigDecimal("300.00"), null, "Salary", "", LINE_DATE));
        reportService.submit(owner, ReportKind.EARNING, payId);

        // Rounding each stored 0.9765 before adding would give 1.96.
        assertThat(dollarLineIds).allSatisfy(id -> assertThat(
                expenseRepository.findById(id).orElseThrow().getAmountInEuros()).isEqualByComparingTo("0.9765"));
        assertThat(dashboardService.user(owner).perDate()).containsExactly(
                new DatedAmount("expense", windowStart, new BigDecimal("10.00")),
                new DatedAmount("earning", LINE_DATE, new BigDecimal("300.00")),
                new DatedAmount("expense", LINE_DATE, new BigDecimal("1.95")));
    }

    static Stream<Arguments> converterRejectsAMissingOrNonPositiveAmountOrRate() {
        FieldViolation amount = new FieldViolation("amount", LegacyMessages.USD_AMOUNT_ABOVE_ZERO);
        FieldViolation rate = new FieldViolation("rate", LegacyMessages.RATE_ABOVE_ZERO);
        return Stream.of(
                arguments(null, "0.93", List.of(amount)),
                arguments("0", "0.93", List.of(amount)),
                arguments("-1", "0.93", List.of(amount)),
                arguments("100", null, List.of(rate)),
                arguments("100", "0", List.of(rate)),
                arguments("100", "-0.93", List.of(rate)),
                arguments("0", "-0.93", List.of(amount, rate)),
                arguments(null, null, List.of(amount, rate)));
    }

    @ParameterizedTest(name = "amount {0}, rate {1} rejects {2}")
    @MethodSource
    void converterRejectsAMissingOrNonPositiveAmountOrRate(String amount, String rate, List<FieldViolation> expected) {
        assertThatExceptionOfType(ApiException.class)
                .isThrownBy(() -> amountCalculator.usdToEur(decimal(amount), decimal(rate)))
                .satisfies(error -> {
                    assertThat(error.status()).isEqualTo(422);
                    assertThat(error.code()).isEqualTo(ApiException.VALIDATION_FAILED);
                    assertThat(error.fieldErrors()).containsExactlyElementsOf(expected);
                });
    }

    @ParameterizedTest(name = "km {0}")
    @NullSource
    @ValueSource(strings = {"0", "-1"})
    void mileageToolRejectsAMissingOrNonPositiveDistance(String km) {
        Caller caller = newCaller(appUserRepository, Role.User);

        assertFieldError(() -> toolsService.mileage(caller, decimal(km)), "km", LegacyMessages.DISTANCE_POSITIVE);
    }

    @ParameterizedTest(name = "km {0}")
    @ValueSource(strings = {"1e29", "100000000000000000000000000000", "1E-999999999"})
    void mileageToolRejectsAnOutOfRangeDistanceOnTheKmField(String km) {
        Caller caller = newCaller(appUserRepository, Role.User);

        assertFieldError(() -> toolsService.mileage(caller, decimal(km)), "km", LegacyMessages.INVALID_VALUE);
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

        assertFieldError(() -> reportService.create(owner, ReportKind.EXPENSE, "T".repeat(51)),
                "title", LegacyMessages.MAX_LENGTH_50);
    }

    @ParameterizedTest(name = "padding-only title #{index}")
    @ValueSource(strings = {"\u0000", "\u0000\u2003", "\u2003", " \t "})
    void createAndRenameRejectATitleOfOnlyControlOrWhitespaceCharacters(String title) {
        Caller owner = newCaller(appUserRepository, Role.User);
        Long draftId = reportService.create(owner, ReportKind.EXPENSE, "Draft").id();

        assertFieldError(() -> reportService.create(owner, ReportKind.EXPENSE, title),
                "title", LegacyMessages.INSERT_TITLE);
        assertFieldError(() -> reportService.rename(owner, ReportKind.EXPENSE, draftId, title),
                "title", LegacyMessages.INSERT_TITLE);
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

    @ParameterizedTest(name = "{0}")
    @EnumSource(ReportKind.class)
    void concurrentCreatesOfOneKindTakeConsecutiveCodesWithoutARetry(ReportKind kind) throws Exception {
        Caller owner = newCaller(appUserRepository, Role.User);
        int creators = 10;
        CountDownLatch startGate = new CountDownLatch(1);
        ExecutorService executor = Executors.newFixedThreadPool(creators);
        List<String> codes = new ArrayList<>();
        try {
            List<Future<ReportSummary>> futures = new ArrayList<>();
            for (int i = 1; i <= creators; i++) {
                String title = "Concurrent " + i;
                futures.add(executor.submit(() -> {
                    startGate.await();
                    return reportService.create(owner, kind, title);
                }));
            }
            startGate.countDown();
            for (Future<ReportSummary> future : futures) {
                codes.add(future.get(30, TimeUnit.SECONDS).code());
            }
        } finally {
            executor.shutdown();
            executor.awaitTermination(30, TimeUnit.SECONDS);
        }

        assertThat(codes).containsExactlyInAnyOrderElementsOf(IntStream.rangeClosed(1, creators)
                .mapToObj(n -> n + "/2024 " + kind.suffix())
                .toList());
        assertThat(reportCodeGenerator.calls(kind)).isEqualTo(creators);
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

    @ParameterizedTest(name = "{0}")
    @EnumSource(ReportKind.class)
    void deletingADraftReportRemovesItsLinesAndInvoices(ReportKind kind) {
        Caller owner = newCaller(appUserRepository, Role.User);
        LineView line = draftWithLineAndTwin(owner, kind);
        invoiceService.upload(owner, kind, line.id(), "receipt.png", "image/png", PNG_BYTES);
        assertThat(invoicesOf(kind).existsById(line.id())).isTrue();

        reportService.delete(owner, kind, line.reportId());

        assertThat(reportsOf(kind).existsById(line.reportId())).isFalse();
        assertThat(linesOf(kind).existsById(line.id())).isFalse();
        assertThat(invoicesOf(kind).existsById(line.id())).isFalse();
        assertTwinUnchanged(otherKind(kind), line);
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

    enum Intruder { ANOTHER_USER, USER_AND_ADMINISTRATOR, ADMINISTRATOR_WITH_THE_OWNERS_ID }

    static Stream<Arguments> ownerWritesByAnyoneButTheOwningUserAreForbidden() {
        List<Write> ownerWrites = List.of(Write.RENAME, Write.DELETE_REPORT, Write.SUBMIT, Write.CREATE_LINE,
                Write.UPDATE_LINE, Write.DELETE_LINE, Write.UPLOAD_INVOICE);
        return Arrays.stream(ReportKind.values()).flatMap(kind -> ownerWrites.stream().flatMap(write ->
                Arrays.stream(Intruder.values()).map(intruder -> arguments(kind, write, intruder))));
    }

    @ParameterizedTest(name = "{0} {1} by {2}")
    @MethodSource
    void ownerWritesByAnyoneButTheOwningUserAreForbidden(ReportKind kind, Write write, Intruder intruder) {
        Caller owner = newCaller(appUserRepository, Role.User);
        LineView line = draftWithLine(owner, kind);
        invoiceService.upload(owner, kind, line.id(), "receipt.png", "image/png", PNG_BYTES);
        Caller caller = callerOf(intruder, owner);
        clock.set(MutableClock.DEFAULT_TIME.plusHours(1));

        assertApiError(() -> ownerWrite(write, caller, kind, line),
                403, ApiException.FORBIDDEN, LegacyMessages.FORBIDDEN);

        ReportEntity report = reportsOf(kind).findById(line.reportId()).orElseThrow();
        assertThat(report.getStatusId()).isEqualTo(ReferenceIds.STATUS_DRAFT);
        assertThat(report.getTitle()).isEqualTo("London Trip");
        assertThat(report.getCreatedOn()).isEqualTo(MutableClock.DEFAULT_TIME);
        assertThat(report.getUpdatedOn()).isEqualTo(MutableClock.DEFAULT_TIME);
        assertThat(report.getSubmitedOn()).isNull();
        assertThat(report.getCreatedBy()).isEqualTo(owner.id());
        assertThat(report.getSubmitedBy()).isEqualTo(owner.id());
        assertThat(report.getUpdatedBy()).isEqualTo(owner.id());
        assertThat(linesOf(kind).findByReportId(line.reportId())).singleElement().satisfies(stored -> {
            assertThat(stored.getId()).isEqualTo(line.id());
            assertThat(stored.getTitle()).isEqualTo("Flight tickets");
            assertThat(stored.getAmountInEuros()).isEqualByComparingTo("42.00");
        });
        assertThat(invoicesOf(kind).findInfoById(line.id())).hasValueSatisfying(invoice -> {
            assertThat(invoice.getFilename()).isEqualTo("receipt.png");
            assertThat(invoice.getFiletype()).isEqualTo("image/png");
            assertThat(invoice.getDatetime()).isEqualTo(MutableClock.DEFAULT_TIME);
        });
        assertThat(invoicesOf(kind).count()).isEqualTo(1);
    }

    private Caller callerOf(Intruder intruder, Caller owner) {
        return switch (intruder) {
            case ANOTHER_USER -> newCaller(appUserRepository, Role.User);
            case USER_AND_ADMINISTRATOR -> {
                String username = "user-administrator-" + UUID.randomUUID();
                AppUser saved = appUserRepository.save(new AppUser(username, "User Administrator", "unused-hash",
                        EnumSet.of(Role.User, Role.Administrator)));
                yield new Caller(saved.getId(), username, saved.getName(),
                        EnumSet.of(Role.User, Role.Administrator, Role.Registered));
            }
            // The owner's own id, so only the missing User role can refuse the write.
            case ADMINISTRATOR_WITH_THE_OWNERS_ID -> new Caller(owner.id(), owner.username(), owner.displayName(),
                    EnumSet.of(Role.Administrator, Role.Registered));
        };
    }

    private void ownerWrite(Write write, Caller caller, ReportKind kind, LineView line) {
        int typeId = kind == ReportKind.EXPENSE ? ReferenceIds.EXPENSE_TYPE_TRAVEL : ReferenceIds.EARNING_TYPE_SERVICE;
        LineService.LineInput input = line(typeId, ReferenceIds.CURRENCY_EURO, new BigDecimal("10.00"), null, "Taxi",
                "", LINE_DATE);
        switch (write) {
            case RENAME -> reportService.rename(caller, kind, line.reportId(), "Renamed");
            case DELETE_REPORT -> reportService.delete(caller, kind, line.reportId());
            case SUBMIT -> reportService.submit(caller, kind, line.reportId());
            case CREATE_LINE -> lineService.create(caller, kind, line.reportId(), input);
            case UPDATE_LINE -> lineService.update(caller, kind, line.id(), input);
            case DELETE_LINE -> lineService.delete(caller, kind, line.id());
            case UPLOAD_INVOICE -> invoiceService.upload(caller, kind, line.id(), "invoice.pdf", "application/pdf",
                    "%PDF-1.7".getBytes(StandardCharsets.US_ASCII));
            case DECIDE -> throw new IllegalArgumentException("A decision is not an owner write");
        }
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
                        "100.00", null, "93.0000", "93.00", "21.39"),
                arguments(ReferenceIds.EXPENSE_TYPE_KILOMETERS, null, null, "10", "3.7000", "3.70", "0.85"),
                arguments(ReferenceIds.EXPENSE_TYPE_TRAVEL, ReferenceIds.CURRENCY_EURO,
                        "42.00", null, "42.0000", "42.00", "9.66"),
                // Each fractional row changes under two-decimal storage, truncation or half-even rounding.
                arguments(ReferenceIds.EXPENSE_TYPE_TRAVEL, ReferenceIds.CURRENCY_EURO,
                        "10.12345", null, "10.1235", "10.12", "2.33"),
                arguments(ReferenceIds.EXPENSE_TYPE_TRAVEL, ReferenceIds.CURRENCY_EURO,
                        "2.005", null, "2.0050", "2.01", "0.46"),
                arguments(ReferenceIds.EXPENSE_TYPE_TRAVEL, ReferenceIds.CURRENCY_DOLLAR,
                        "10.005", null, "9.3047", "9.30", "2.14"),
                arguments(ReferenceIds.EXPENSE_TYPE_KILOMETERS, null, null, "0.12345", "0.0457", "0.05", "0.01"),
                arguments(ReferenceIds.EXPENSE_TYPE_TRAVEL, ReferenceIds.CURRENCY_EURO,
                        "1.50", null, "1.5000", "1.50", "0.35"),
                arguments(ReferenceIds.EXPENSE_TYPE_TRAVEL, ReferenceIds.CURRENCY_EURO,
                        "1.495", null, "1.4950", "1.50", "0.34"));
    }

    @ParameterizedTest(name = "type {0}, currency {1}, amount {2}, km {3} stores {4}, shows {5} with VAT {6}")
    @MethodSource
    void serverComputesAndStoresEuroAmounts(int typeId, Integer currencyId, String amount, String kilometers,
            String storedEuros, String euros, String vat) {
        Caller owner = newCaller(appUserRepository, Role.User);
        Long reportId = reportService.create(owner, ReportKind.EXPENSE, "Amounts").id();

        LineView view = lineService.create(owner, ReportKind.EXPENSE, reportId,
                line(typeId, currencyId, decimal(amount), decimal(kilometers), "Amount", "", LINE_DATE));

        Expense stored = expenseRepository.findById(view.id()).orElseThrow();
        assertThat(stored.getAmountInEuros()).isEqualTo(new BigDecimal(storedEuros));
        assertThat(view.amountInEuros()).isEqualTo(new BigDecimal(euros));
        assertThat(view.vat()).isEqualTo(new BigDecimal(vat));
        ReportDetail detail = reportService.detail(owner, ReportKind.EXPENSE, reportId);
        assertThat(detail.totalEur()).isEqualTo(new BigDecimal(euros));
        assertThat(detail.vatTotal()).isEqualTo(new BigDecimal(vat));
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

    @ParameterizedTest(name = "{0}")
    @EnumSource(ReportKind.class)
    void reportTotalsRoundTheSumOfTheStoredAmounts(ReportKind kind) {
        Caller owner = newCaller(appUserRepository, Role.User);
        Long reportId = reportService.create(owner, kind, "Totals").id();
        int typeId = kind == ReportKind.EXPENSE ? ReferenceIds.EXPENSE_TYPE_TRAVEL : ReferenceIds.EARNING_TYPE_SERVICE;
        for (String title : List.of("Outbound", "Return")) {
            lineService.create(owner, kind, reportId,
                    line(typeId, ReferenceIds.CURRENCY_EURO, new BigDecimal("10.6825"), null, title, "", LINE_DATE));
        }

        assertThat(linesOf(kind).findByReportId(reportId)).extracting(LineEntity::getAmountInEuros)
                .containsExactly(new BigDecimal("10.6825"), new BigDecimal("10.6825"));
        ReportDetail detail = reportService.detail(owner, kind, reportId);
        assertThat(detail.lines()).extracting(LineView::amountInEuros)
                .containsExactly(new BigDecimal("10.68"), new BigDecimal("10.68"));
        assertThat(detail.lines()).extracting(LineView::vat)
                .containsExactly(new BigDecimal("2.46"), new BigDecimal("2.46"));
        // Summing the rounded line figures would give 21.36 and 4.92.
        assertThat(detail.totalEur()).isEqualTo(new BigDecimal("21.37"));
        assertThat(detail.vatTotal()).isEqualTo(new BigDecimal("4.91"));
    }

    static Stream<Arguments> uploadWithoutAFilenameIsRejected() {
        return Stream.of(ReportKind.values())
                .flatMap(kind -> Stream.of(null, "", "   ").map(filename -> arguments(kind, filename)));
    }

    @ParameterizedTest(name = "{0} filename \"{1}\"")
    @MethodSource
    void uploadWithoutAFilenameIsRejected(ReportKind kind, String filename) {
        Caller owner = newCaller(appUserRepository, Role.User);
        LineView line = draftWithLineAndTwin(owner, kind);

        assertFieldError(() -> invoiceService.upload(owner, kind, line.id(), filename, "image/png", PNG_BYTES),
                "file", LegacyMessages.NO_FILE_SELECTED);
        assertThat(invoicesOf(kind).count()).isZero();
        assertTwinUnchanged(otherKind(kind), line);
    }

    @ParameterizedTest(name = "{0}")
    @EnumSource(ReportKind.class)
    void uploadOfANamedEmptyFileIsRejected(ReportKind kind) {
        Caller owner = newCaller(appUserRepository, Role.User);
        LineView line = draftWithLineAndTwin(owner, kind);

        assertFieldError(() -> invoiceService.upload(owner, kind, line.id(), "empty.png", "image/png", new byte[0]),
                "file", LegacyMessages.NO_FILE_UPLOADED);
        assertThat(invoicesOf(kind).count()).isZero();
        assertTwinUnchanged(otherKind(kind), line);
    }

    @ParameterizedTest(name = "{0}")
    @EnumSource(ReportKind.class)
    void fiftyCharacterFilenameIsStoredAndDownloadedUnchanged(ReportKind kind) {
        Caller owner = newCaller(appUserRepository, Role.User);
        LineView line = draftWithLineAndTwin(owner, kind);
        String filename = "i".repeat(46) + ".png";

        invoiceService.upload(owner, kind, line.id(), filename, "image/png", PNG_BYTES);
        InvoiceFile file = invoiceService.download(owner, kind, line.id());

        assertThat(file.filename()).isEqualTo(filename).hasSize(50);
        assertThat(file.contentType()).isEqualTo("image/png");
        assertThat(file.content()).isEqualTo(PNG_BYTES);
        assertThat(storedInvoice(kind, line.id())).get().usingRecursiveComparison()
                .isEqualTo(new StoredInvoice(filename, "image/png", PNG_BYTES, MutableClock.DEFAULT_TIME));
        assertTwinUnchanged(otherKind(kind), line);
    }

    @ParameterizedTest(name = "{0}")
    @EnumSource(ReportKind.class)
    void fiftyOneCharacterFilenameIsRejected(ReportKind kind) {
        Caller owner = newCaller(appUserRepository, Role.User);
        LineView line = draftWithLineAndTwin(owner, kind);
        String filename = "i".repeat(47) + ".png";

        assertFieldError(() -> invoiceService.upload(owner, kind, line.id(), filename, "image/png", PNG_BYTES),
                "file", LegacyMessages.FILE_NAME_TOO_LONG);
        assertThat(invoicesOf(kind).count()).isZero();
        assertTwinUnchanged(otherKind(kind), line);
    }

    @ParameterizedTest(name = "{0}")
    @EnumSource(ReportKind.class)
    void aRepeatUploadReplacesTheInvoice(ReportKind kind) {
        Caller owner = newCaller(appUserRepository, Role.User);
        LineView line = draftWithLineAndTwin(owner, kind);
        byte[] pdf = "%PDF-1.7".getBytes(StandardCharsets.US_ASCII);
        invoiceService.upload(owner, kind, line.id(), "receipt.png", "image/png", PNG_BYTES);
        LocalDateTime replacedAt = MutableClock.DEFAULT_TIME.plusHours(1);
        clock.set(replacedAt);

        invoiceService.upload(owner, kind, line.id(), "invoice.pdf", "application/pdf", pdf);
        InvoiceFile file = invoiceService.download(owner, kind, line.id());

        assertThat(file.filename()).isEqualTo("invoice.pdf");
        assertThat(file.contentType()).isEqualTo("application/pdf");
        assertThat(file.content()).isEqualTo(pdf);
        assertThat(invoicesOf(kind).count()).isEqualTo(1);
        assertThat(storedInvoice(kind, line.id())).get().usingRecursiveComparison()
                .isEqualTo(new StoredInvoice("invoice.pdf", "application/pdf", pdf, replacedAt));
        assertTwinUnchanged(otherKind(kind), line);
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
                arguments("B".repeat(51), "Description", "title", LegacyMessages.MAX_LENGTH_50),
                arguments("Title", "d".repeat(10_001), "description", LegacyMessages.MAX_LENGTH_10000));
    }

    @ParameterizedTest(name = "{2} rejected with \"{3}\"")
    @MethodSource
    void blogRejectsTitleOrDescriptionOverTheLimit(String title, String description, String field, String message) {
        Caller admin = newCaller(appUserRepository, Role.Administrator);
        BlogService.PostInput input = new BlogService.PostInput(title, description);
        Long existingId = blogService.create(admin, new BlogService.PostInput("Existing", "")).id();

        assertFieldError(() -> blogService.create(admin, input), field, message);
        assertFieldError(() -> blogService.update(admin, existingId, input), field, message);
    }

    @Test
    void blogPostsStampedInTheSameSecondAreListedNewestIdFirst() {
        Caller admin = newCaller(appUserRepository, Role.Administrator);
        String keyword = UUID.randomUUID().toString();
        Long first = blogService.create(admin, new BlogService.PostInput("First " + keyword, "")).id();
        Long second = blogService.create(admin, new BlogService.PostInput("Second " + keyword, "")).id();

        assertThat(blogService.search(admin, keyword))
                .allSatisfy(post -> assertThat(post.createdOn()).isEqualTo(MutableClock.DEFAULT_TIME))
                .extracting(BlogPostView::id)
                .containsExactly(second, first);
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

    @ParameterizedTest(name = "{0}={1}")
    @CsvSource({"from, 2024-13-45", "to, nonsense", "to, 2024-05-21T25:00"})
    void unparsableListDateBoundIsRejectedWithTheParseFailureAsCause(String field, String value) {
        Caller owner = newCaller(appUserRepository, Role.User);
        String from = field.equals("from") ? value : null;
        String to = field.equals("to") ? value : null;

        assertThatExceptionOfType(ApiException.class)
                .isThrownBy(() -> reportService.list(owner, ReportKind.EXPENSE, null, null, null, from, to))
                .satisfies(error -> {
                    assertThat(error.status()).isEqualTo(422);
                    assertThat(error.code()).isEqualTo(ApiException.VALIDATION_FAILED);
                    assertThat(error.getMessage()).isEqualTo(LegacyMessages.INVALID_VALUE);
                    assertThat(error.fieldErrors())
                            .containsExactly(new FieldViolation(field, LegacyMessages.INVALID_VALUE));
                })
                .withCauseInstanceOf(DateTimeParseException.class);
    }

    @ParameterizedTest(name = "registered user: {0}")
    @ValueSource(booleans = {true, false})
    void rejectedLoginIsBadCredentialsWithTheAuthenticationFailureAsCause(boolean registered) {
        String username = "login-" + UUID.randomUUID();
        String password = "123456";
        if (registered) {
            appUserRepository.save(new AppUser(username, "Login User", passwordEncoder.encode(password),
                    EnumSet.of(Role.User)));
        }
        String attempt = registered ? "wrong" : password;

        assertThatExceptionOfType(ApiException.class)
                .isThrownBy(() -> authService.authenticate(username, attempt))
                .satisfies(error -> {
                    assertThat(error.status()).isEqualTo(401);
                    assertThat(error.code()).isEqualTo(ApiException.BAD_CREDENTIALS);
                    assertThat(error.getMessage()).isEqualTo(LegacyMessages.BAD_CREDENTIALS);
                    assertThat(error.fieldErrors()).isEmpty();
                })
                .withCauseInstanceOf(AuthenticationException.class);
    }

    @ParameterizedTest(name = "sort \"{0}\"")
    @ValueSource(strings = {"id", "title", "id,desc,extra", ",desc", "id,", "nope,asc", "id,up"})
    void listRejectsASortThatIsNotAColumnAndDirection(String sort) {
        Caller owner = newCaller(appUserRepository, Role.User);
        assertFieldError(() -> reportService.list(owner, ReportKind.EXPENSE, null, null, sort, null, null),
                "sort", LegacyMessages.INVALID_VALUE);
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
                arguments("L".repeat(51), "", "title", LegacyMessages.MAX_LENGTH_50),
                arguments("Title", "d".repeat(1501), "description", LegacyMessages.MAX_LENGTH_1500));
    }

    @ParameterizedTest(name = "{2} rejected with \"{3}\"")
    @MethodSource
    void lineRejectsTitleOrDescriptionOverTheLimit(String title, String description, String field, String message) {
        Caller owner = newCaller(appUserRepository, Role.User);
        Long reportId = reportService.create(owner, ReportKind.EXPENSE, "Limits").id();
        LineService.LineInput input = line(ReferenceIds.EXPENSE_TYPE_OTHER, ReferenceIds.CURRENCY_EURO, BigDecimal.TEN,
                null, title, description, LINE_DATE);

        assertFieldError(() -> lineService.create(owner, ReportKind.EXPENSE, reportId, input), field, message);
    }

    static Stream<Arguments> lineRequestReportsTheTextErrorsLineServiceReports() {
        return Stream.of(
                arguments("blank title", " ".repeat(60), "",
                        new FieldViolation("title", LegacyMessages.FIELD_REQUIRED)),
                arguments("51-character title", "L".repeat(51), "",
                        new FieldViolation("title", LegacyMessages.MAX_LENGTH_50)),
                arguments("padded 50-character title", "  " + "L".repeat(50) + "  ", "",
                        new FieldViolation("title", LegacyMessages.MAX_LENGTH_50)),
                arguments("1501-character description", "Title", "d".repeat(1501),
                        new FieldViolation("description", LegacyMessages.MAX_LENGTH_1500)));
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource
    void lineRequestReportsTheTextErrorsLineServiceReports(String label, String title, String description,
            FieldViolation expected) {
        Caller owner = newCaller(appUserRepository, Role.User);
        Long reportId = reportService.create(owner, ReportKind.EXPENSE, "Parity").id();
        LineRequest request = new LineRequest(ReferenceIds.EXPENSE_TYPE_OTHER, null, ReferenceIds.CURRENCY_EURO,
                BigDecimal.TEN, null, title, description, LINE_DATE);
        LineService.LineInput input = line(ReferenceIds.EXPENSE_TYPE_OTHER, ReferenceIds.CURRENCY_EURO, BigDecimal.TEN,
                null, title, description, LINE_DATE);

        assertThat(validator.validate(request))
                .map(violation -> new FieldViolation(violation.getPropertyPath().toString(), violation.getMessage()))
                .containsExactly(expected);
        assertThat(LineService.textViolations(title, description)).containsExactly(expected);
        assertFieldError(() -> lineService.create(owner, ReportKind.EXPENSE, reportId, input),
                expected.field(), expected.message());
    }

    static Stream<Arguments> lineTitleOfOnlyControlOrWhitespaceCharactersIsRequiredAndChangesNothing() {
        return Arrays.stream(ReportKind.values()).flatMap(kind -> Stream.of("\u2003", "\u0000\u2003", " \t\u2003\u0000")
                .map(title -> arguments(kind, title)));
    }

    @ParameterizedTest(name = "{0} padding-only title #{index}")
    @MethodSource
    void lineTitleOfOnlyControlOrWhitespaceCharactersIsRequiredAndChangesNothing(ReportKind kind, String title) {
        Caller owner = newCaller(appUserRepository, Role.User);
        LineView existing = draftWithLine(owner, kind);
        Integer typeId = existing.typeId();
        LineRequest request = new LineRequest(kind == ReportKind.EXPENSE ? typeId : null,
                kind == ReportKind.EARNING ? typeId : null, ReferenceIds.CURRENCY_EURO, BigDecimal.TEN, null, title,
                "", LINE_DATE);
        LineService.LineInput input = line(typeId, ReferenceIds.CURRENCY_EURO, BigDecimal.TEN, null, title, "",
                LINE_DATE);

        assertThat(validator.validate(request))
                .map(violation -> new FieldViolation(violation.getPropertyPath().toString(), violation.getMessage()))
                .containsExactly(new FieldViolation("title", LegacyMessages.FIELD_REQUIRED));
        assertFieldError(() -> lineService.create(owner, kind, existing.reportId(), input),
                "title", LegacyMessages.FIELD_REQUIRED);
        assertFieldError(() -> lineService.update(owner, kind, existing.id(), input),
                "title", LegacyMessages.FIELD_REQUIRED);
        assertTheDraftHoldsOnlyItsUnchangedLine(kind, existing);
    }

    @ParameterizedTest(name = "{0}")
    @EnumSource(ReportKind.class)
    void lineCreateAndUpdateStoreTheTitleWithoutControlOrWhitespacePadding(ReportKind kind) {
        Caller owner = newCaller(appUserRepository, Role.User);
        LineView existing = draftWithLine(owner, kind);
        Integer typeId = existing.typeId();
        String title = "\u2003 Taxi \u0000";
        LineRequest request = new LineRequest(kind == ReportKind.EXPENSE ? typeId : null,
                kind == ReportKind.EARNING ? typeId : null, ReferenceIds.CURRENCY_EURO, BigDecimal.TEN, null, title,
                "", LINE_DATE);
        LineService.LineInput input = line(typeId, ReferenceIds.CURRENCY_EURO, BigDecimal.TEN, null, title, "",
                LINE_DATE);

        assertThat(validator.validate(request)).isEmpty();
        LineView created = lineService.create(owner, kind, existing.reportId(), input);
        LineView updated = lineService.update(owner, kind, existing.id(), input);

        assertThat(List.of(created, updated)).extracting(LineView::title).containsExactly("Taxi", "Taxi");
        assertThat(linesOf(kind).findAllById(List.of(created.id(), existing.id()))).hasSize(2)
                .extracting(LineEntity::getTitle).containsOnly("Taxi");
    }

    @Test
    void fieldsTheLineKindAndTypeIgnoreNeverAffectValidation() {
        Caller owner = newCaller(appUserRepository, Role.User);
        Long earningReportId = reportService.create(owner, ReportKind.EARNING, "Ignored distance").id();
        Long expenseReportId = reportService.create(owner, ReportKind.EXPENSE, "Ignored amount").id();
        BigDecimal huge = new BigDecimal("1E+20");
        LineRequest earningRequest = new LineRequest(ReferenceIds.EXPENSE_TYPE_KILOMETERS,
                ReferenceIds.EARNING_TYPE_SALARY, ReferenceIds.CURRENCY_EURO, new BigDecimal("100"), huge, "Salary",
                "", LINE_DATE);
        LineRequest kilometersRequest = new LineRequest(ReferenceIds.EXPENSE_TYPE_KILOMETERS,
                ReferenceIds.EARNING_TYPE_SALARY, ReferenceIds.CURRENCY_DOLLAR, huge, BigDecimal.TEN, "Mileage", "",
                LINE_DATE);

        assertThat(validator.validate(earningRequest)).isEmpty();
        assertThat(validator.validate(kilometersRequest)).isEmpty();
        LineView earning = lineService.create(owner, ReportKind.EARNING, earningReportId, line(
                ReferenceIds.EARNING_TYPE_SALARY, ReferenceIds.CURRENCY_EURO, new BigDecimal("100"), huge, "Salary",
                "", LINE_DATE));
        LineView mileage = lineService.create(owner, ReportKind.EXPENSE, expenseReportId, line(
                ReferenceIds.EXPENSE_TYPE_KILOMETERS, ReferenceIds.CURRENCY_DOLLAR, huge, BigDecimal.TEN, "Mileage",
                "", LINE_DATE));

        assertThat(earningRepository.findById(earning.id()).orElseThrow().getKilometers()).isNull();
        Expense stored = expenseRepository.findById(mileage.id()).orElseThrow();
        assertThat(stored.getAmountInEuros()).isEqualByComparingTo("3.70");
        assertThat(stored.getCurrencyId()).isEqualTo(ReferenceIds.CURRENCY_EURO);
    }

    @Test
    void distanceIsBoundByItsOwnColumnNotTheMoneyColumns() {
        Caller owner = newCaller(appUserRepository, Role.User);
        Long reportId = reportService.create(owner, ReportKind.EXPENSE, "Long distance").id();

        LineView view = lineService.create(owner, ReportKind.EXPENSE, reportId, line(
                ReferenceIds.EXPENSE_TYPE_KILOMETERS, null, null, new BigDecimal("2000000000000000"), "Far", "",
                LINE_DATE));

        Expense stored = expenseRepository.findById(view.id()).orElseThrow();
        assertThat(stored.getKilometers()).isEqualByComparingTo("2000000000000000");
        assertThat(stored.getAmountInEuros()).isEqualByComparingTo("740000000000000.0000");
    }

    static Stream<Arguments> consumedValuesThatDoNotFitTheirColumnsAreRejected() {
        return Stream.of(
                arguments(ReferenceIds.EXPENSE_TYPE_TRAVEL, ReferenceIds.CURRENCY_EURO, "1E+15", null, "amount"),
                arguments(ReferenceIds.EXPENSE_TYPE_KILOMETERS, null, null, "1E+29", "kilometers"),
                arguments(ReferenceIds.EXPENSE_TYPE_TRAVEL, ReferenceIds.CURRENCY_EURO, "1E-999999999", null, "amount"),
                arguments(ReferenceIds.EXPENSE_TYPE_KILOMETERS, null, null, "1E+999999999", "kilometers"));
    }

    @ParameterizedTest(name = "type {0}, currency {1}, amount {2}, km {3} rejects {4}")
    @MethodSource
    void consumedValuesThatDoNotFitTheirColumnsAreRejected(
            int typeId, Integer currencyId, String amount, String kilometers, String field) {
        Caller owner = newCaller(appUserRepository, Role.User);
        LineView existing = draftWithLine(owner);
        LineService.LineInput input = line(typeId, currencyId, decimal(amount), decimal(kilometers), "Too large", "",
                LINE_DATE);

        assertFieldError(() -> lineService.create(owner, ReportKind.EXPENSE, existing.reportId(), input),
                field, LegacyMessages.INVALID_VALUE);
        assertFieldError(() -> lineService.update(owner, ReportKind.EXPENSE, existing.id(), input),
                field, LegacyMessages.INVALID_VALUE);
        assertThat(expenseRepository.findAll()).singleElement()
                .satisfies(stored -> assertThat(stored.getAmountInEuros()).isEqualByComparingTo("42.00"));
    }

    static Stream<Arguments> valuesThatRoundToZeroInTheirColumnAreRejected() {
        return Stream.of(
                arguments(ReferenceIds.EXPENSE_TYPE_OTHER, ReferenceIds.CURRENCY_EURO, "0.00001", null, "amount",
                        LegacyMessages.MUST_SET_AMOUNT),
                arguments(ReferenceIds.EXPENSE_TYPE_TRAVEL, ReferenceIds.CURRENCY_DOLLAR, "0.00004", null, "amount",
                        LegacyMessages.USD_AMOUNT_ABOVE_ZERO),
                arguments(ReferenceIds.EXPENSE_TYPE_KILOMETERS, null, null, "0.000000001", "kilometers",
                        LegacyMessages.DISTANCE_POSITIVE));
    }

    @ParameterizedTest(name = "type {0}, currency {1}, amount {2}, km {3} rejects {4} with \"{5}\"")
    @MethodSource
    void valuesThatRoundToZeroInTheirColumnAreRejected(
            int typeId, Integer currencyId, String amount, String kilometers, String field, String message) {
        Caller owner = newCaller(appUserRepository, Role.User);
        LineView existing = draftWithLine(owner);
        LineService.LineInput input = line(typeId, currencyId, decimal(amount), decimal(kilometers), "Tiny", "",
                LINE_DATE);

        assertFieldError(() -> lineService.create(owner, ReportKind.EXPENSE, existing.reportId(), input),
                field, message);
        assertFieldError(() -> lineService.update(owner, ReportKind.EXPENSE, existing.id(), input),
                field, message);
        assertThat(expenseRepository.findAll()).singleElement()
                .satisfies(stored -> assertThat(stored.getAmountInEuros()).isEqualByComparingTo("42.00"));
    }

    static Stream<Arguments> linesStoreAndReturnValuesRoundedToTheirColumns() {
        return Stream.of(
                arguments(ReferenceIds.EXPENSE_TYPE_TRAVEL, ReferenceIds.CURRENCY_DOLLAR, "0.00005", null,
                        "0.0001", null, "0.0001"),
                arguments(ReferenceIds.EXPENSE_TYPE_KILOMETERS, null, null, "5E-9",
                        "0.0000", "0.00000001", "0.0000"),
                arguments(ReferenceIds.EXPENSE_TYPE_KILOMETERS, null, null, "2.123456785",
                        "0.7857", "2.12345679", "0.7857"));
    }

    @ParameterizedTest(name = "type {0}, currency {1}, amount {2}, km {3} stores {4}, {5} km and {6} euros")
    @MethodSource
    void linesStoreAndReturnValuesRoundedToTheirColumns(int typeId, Integer currencyId, String amount,
            String kilometers, String storedAmount, String storedKilometers, String storedEuros) {
        Caller owner = newCaller(appUserRepository, Role.User);
        LineView existing = draftWithLine(owner);
        LineService.LineInput input = line(typeId, currencyId, decimal(amount), decimal(kilometers), "Rounded", "",
                LINE_DATE);

        LineView created = lineService.create(owner, ReportKind.EXPENSE, existing.reportId(), input);
        LineView updated = lineService.update(owner, ReportKind.EXPENSE, existing.id(), input);

        for (LineView view : List.of(created, updated)) {
            Expense stored = expenseRepository.findById(view.id()).orElseThrow();
            assertThat(stored.getAmount()).isEqualTo(decimal(storedAmount));
            assertThat(stored.getKilometers()).isEqualTo(decimal(storedKilometers));
            assertThat(stored.getAmountInEuros()).isEqualTo(decimal(storedEuros));
            assertThat(view).isEqualTo(lineService.views(ReportKind.EXPENSE, List.of(stored)).getFirst());
        }
        AmountCalculator.LineAmounts amounts = amountCalculator.lineAmounts(
                ReportKind.EXPENSE, typeId, currencyId, decimal(amount), decimal(kilometers));
        assertThat(amounts.amount()).isEqualTo(decimal(storedAmount));
        assertThat(amounts.kilometers()).isEqualTo(decimal(storedKilometers));
        assertThat(amounts.amountInEuros()).isEqualTo(decimal(storedEuros));
    }

    static Stream<Arguments> lineInputBreakingOneRuleIsRejectedAndChangesNothing() {
        LocalDate tomorrow = LocalDate.of(2024, 5, 24);
        Stream<Arguments> eitherKind = Arrays.stream(ReportKind.values()).flatMap(kind -> {
            int type = kind == ReportKind.EXPENSE ? ReferenceIds.EXPENSE_TYPE_OTHER : ReferenceIds.EARNING_TYPE_SALARY;
            String typeField = kind == ReportKind.EXPENSE ? "expenseTypeId" : "earningTypeId";
            int eur = ReferenceIds.CURRENCY_EURO;
            int usd = ReferenceIds.CURRENCY_DOLLAR;
            return Stream.of(
                    arguments(kind, type, eur, "10.00", null, null, "date", LegacyMessages.DATE_PAST_OR_CURRENT),
                    arguments(kind, type, eur, "10.00", null, tomorrow, "date", LegacyMessages.DATE_PAST_OR_CURRENT),
                    arguments(kind, null, eur, "10.00", null, LINE_DATE, typeField, LegacyMessages.FIELD_REQUIRED),
                    arguments(kind, 99, eur, "10.00", null, LINE_DATE, typeField, LegacyMessages.FIELD_REQUIRED),
                    arguments(kind, type, null, "10.00", null, LINE_DATE, "currencyId", LegacyMessages.FIELD_REQUIRED),
                    arguments(kind, type, eur, null, null, LINE_DATE, "amount", LegacyMessages.MUST_SET_AMOUNT),
                    arguments(kind, type, eur, "0", null, LINE_DATE, "amount", LegacyMessages.MUST_SET_AMOUNT),
                    arguments(kind, type, eur, "-0.01", null, LINE_DATE, "amount", LegacyMessages.MUST_SET_AMOUNT),
                    arguments(kind, type, usd, null, null, LINE_DATE, "amount", LegacyMessages.USD_AMOUNT_ABOVE_ZERO),
                    arguments(kind, type, usd, "0", null, LINE_DATE, "amount", LegacyMessages.USD_AMOUNT_ABOVE_ZERO),
                    arguments(kind, type, usd, "-1", null, LINE_DATE, "amount", LegacyMessages.USD_AMOUNT_ABOVE_ZERO));
        });
        Stream<Arguments> kilometers = Stream.of(null, "0", "-1").map(km -> arguments(ReportKind.EXPENSE,
                ReferenceIds.EXPENSE_TYPE_KILOMETERS, null, null, km, LINE_DATE, "kilometers",
                LegacyMessages.DISTANCE_POSITIVE));
        return Stream.concat(eitherKind, kilometers);
    }

    @ParameterizedTest(name = "{0}: type {1}, currency {2}, amount {3}, km {4}, date {5} rejects {6}")
    @MethodSource
    void lineInputBreakingOneRuleIsRejectedAndChangesNothing(ReportKind kind, Integer typeId, Integer currencyId,
            String amount, String kilometers, LocalDate date, String field, String message) {
        Caller owner = newCaller(appUserRepository, Role.User);
        LineView existing = draftWithLine(owner, kind);
        LineService.LineInput input = line(typeId, currencyId, decimal(amount), decimal(kilometers), "Rejected", "",
                date);

        assertFieldError(() -> lineService.create(owner, kind, existing.reportId(), input), field, message);
        assertFieldError(() -> lineService.update(owner, kind, existing.id(), input), field, message);
        assertTheDraftHoldsOnlyItsUnchangedLine(kind, existing);
    }

    @ParameterizedTest(name = "{0}")
    @EnumSource(ReportKind.class)
    void inactiveTypeIsRejectedThoughTheReferenceDataKnowsIt(ReportKind kind) {
        Caller owner = newCaller(appUserRepository, Role.User);
        // Created before the insert, so the shared ReferenceDataService never caches the inactive row.
        LineView existing = draftWithLine(owner, kind);
        String table = kind == ReportKind.EXPENSE ? "Expense" : "Earning";
        String typeField = kind == ReportKind.EXPENSE ? "expenseTypeId" : "earningTypeId";
        int inactiveTypeId = 90;
        jdbcTemplate.update("INSERT INTO " + table + "Type (Id, Label, \"Order\", Is_Active) VALUES (?, ?, ?, FALSE)",
                inactiveTypeId, "Retired", inactiveTypeId);
        try {
            ReferenceDataService referenceData = new ReferenceDataService(currencyRepository, statusRepository,
                    expenseTypeRepository, earningTypeRepository, expensesProperties);
            LineService lines = new LineService(kindRepositories, reportAccessPolicy, amountCalculator, referenceData,
                    clock);
            TransactionTemplate transaction = new TransactionTemplate(transactionManager);
            LineService.LineInput input = line(inactiveTypeId, ReferenceIds.CURRENCY_EURO, new BigDecimal("10.00"),
                    null, "Retired type", "", LINE_DATE);

            assertThat(referenceData.typeLabel(kind, inactiveTypeId)).isEqualTo("Retired");
            assertThat(referenceData.isActiveType(kind, inactiveTypeId)).isFalse();
            assertFieldError(() -> transaction.execute(tx -> lines.create(owner, kind, existing.reportId(), input)),
                    typeField, LegacyMessages.FIELD_REQUIRED);
            assertFieldError(() -> transaction.execute(tx -> lines.update(owner, kind, existing.id(), input)),
                    typeField, LegacyMessages.FIELD_REQUIRED);
            assertTheDraftHoldsOnlyItsUnchangedLine(kind, existing);
        } finally {
            // Only a broken rule stores a line on the inactive type, and its foreign key would block the delete.
            jdbcTemplate.update("DELETE FROM " + table + " WHERE " + table + "TypeId = ?", inactiveTypeId);
            jdbcTemplate.update("DELETE FROM " + table + "Type WHERE Id = ?", inactiveTypeId);
        }
    }

    static Stream<Arguments> lineInputTheRulesLeaveOpenIsAccepted() {
        LocalDate today = LocalDate.of(2024, 5, 23);
        int eur = ReferenceIds.CURRENCY_EURO;
        int other = ReferenceIds.EXPENSE_TYPE_OTHER;
        int kilometers = ReferenceIds.EXPENSE_TYPE_KILOMETERS;
        int salary = ReferenceIds.EARNING_TYPE_SALARY;
        return Stream.of(
                arguments(ReportKind.EXPENSE, other, eur, "10.00", null, today, "10.00", null),
                arguments(ReportKind.EARNING, salary, eur, "10.00", null, today, "10.00", null),
                arguments(ReportKind.EXPENSE, kilometers, null, null, "10", LINE_DATE, "3.70", "10"),
                arguments(ReportKind.EXPENSE, kilometers, null, "0", "10", LINE_DATE, "3.70", "10"),
                arguments(ReportKind.EXPENSE, kilometers, null, "-5", "10", LINE_DATE, "3.70", "10"),
                arguments(ReportKind.EARNING, salary, eur, "10.00", "0", LINE_DATE, "10.00", null),
                arguments(ReportKind.EARNING, salary, eur, "10.00", "-1", LINE_DATE, "10.00", null));
    }

    @ParameterizedTest(name = "{0}: type {1}, currency {2}, amount {3}, km {4}, date {5} stores {6}")
    @MethodSource
    void lineInputTheRulesLeaveOpenIsAccepted(ReportKind kind, Integer typeId, Integer currencyId, String amount,
            String kilometers, LocalDate date, String euros, String storedKilometers) {
        Caller owner = newCaller(appUserRepository, Role.User);
        LineView existing = draftWithLine(owner, kind);
        LineService.LineInput input = line(typeId, currencyId, decimal(amount), decimal(kilometers), "Accepted", "",
                date);

        Long createdId = lineService.create(owner, kind, existing.reportId(), input).id();
        lineService.update(owner, kind, existing.id(), input);

        assertThat(linesOf(kind).findAllById(List.of(createdId, existing.id()))).hasSize(2).allSatisfy(stored -> {
            assertThat(stored.getTitle()).isEqualTo("Accepted");
            assertThat(stored.getDate()).isEqualTo(date);
            assertThat(stored.getTypeId()).isEqualTo(typeId);
            assertThat(stored.getCurrencyId()).isEqualTo(ReferenceIds.CURRENCY_EURO);
            assertThat(stored.getAmount()).isEqualByComparingTo(euros);
            assertThat(stored.getAmountInEuros()).isEqualByComparingTo(euros);
            assertThat(stored.getKilometers()).usingComparator(Comparator.nullsFirst(BigDecimal::compareTo))
                    .isEqualTo(decimal(storedKilometers));
        });
    }

    private void assertTheDraftHoldsOnlyItsUnchangedLine(ReportKind kind, LineView existing) {
        assertThat(linesOf(kind).findByReportId(existing.reportId())).singleElement().satisfies(stored -> {
            assertThat(stored.getId()).isEqualTo(existing.id());
            assertThat(stored.getTitle()).isEqualTo("Flight tickets");
            assertThat(stored.getDate()).isEqualTo(LINE_DATE);
            assertThat(stored.getTypeId()).isEqualTo(existing.typeId());
            assertThat(stored.getAmountInEuros()).isEqualByComparingTo("42.00");
        });
    }

    @Test
    void lineWithAnUnknownCurrencyIsAValidationError() {
        Caller owner = newCaller(appUserRepository, Role.User);
        Long reportId = reportService.create(owner, ReportKind.EXPENSE, "Currency").id();
        LineService.LineInput input = line(ReferenceIds.EXPENSE_TYPE_TRAVEL, 99, BigDecimal.TEN, null,
                "Unknown currency", "", LINE_DATE);

        assertFieldError(() -> lineService.create(owner, ReportKind.EXPENSE, reportId, input),
                "currencyId", LegacyMessages.FIELD_REQUIRED);
        assertThat(expenseRepository.existsByReportId(reportId)).isFalse();
    }

    @Test
    void productionClockStampsWholeSecondsInTheSystemZone() {
        Clock production = new ClockConfig().clock();

        assertThat(production.getZone()).isEqualTo(ZoneId.systemDefault()).isEqualTo(clock.getZone());
        assertThat(production.instant().getNano()).isZero();
        assertThat(LocalDateTime.now(production).getNano()).isZero();
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

    enum Submitter { CREATOR, ANOTHER_USER, UNKNOWN_USER, NONE }

    @ParameterizedTest(name = "submitter {0}")
    @EnumSource(Submitter.class)
    void detailNamesTheCreatorAndTheSubmitter(Submitter submitter) {
        Caller owner = newCaller(appUserRepository, Role.User);
        Caller submittedBy = switch (submitter) {
            case CREATOR -> owner;
            case ANOTHER_USER -> newCaller(appUserRepository, Role.User);
            case UNKNOWN_USER -> new Caller(Long.MAX_VALUE, "unknown", null, null);
            case NONE -> null;
        };
        ExpenseReport report = stamped(new ExpenseReport(), "1/2024 EX", ReferenceIds.STATUS_SUBMITTED, owner);
        report.setSubmitedBy(submittedBy == null ? null : submittedBy.id());
        Long id = expenseReportRepository.save(report).getId();

        ReportDetail detail = reportService.detail(owner, ReportKind.EXPENSE, id);

        assertThat(detail.createdByName()).isEqualTo(owner.displayName());
        assertThat(detail.submittedBy()).isEqualTo(submittedBy == null ? null : submittedBy.displayName());
    }

    static Stream<Arguments> everyNameTheServerResolvesFallsBackToTheUsernameLikeTheSession() {
        return Stream.of(
                arguments(null, false),
                arguments("", false),
                arguments(" \t\n", false),
                arguments(" Ann Lee ", true));
    }

    @ParameterizedTest(name = "{index}: name shown {1}")
    @MethodSource
    void everyNameTheServerResolvesFallsBackToTheUsernameLikeTheSession(String name, boolean shown) {
        Caller admin = newCaller(appUserRepository, Role.Administrator, name);
        Caller owner = newCaller(appUserRepository, Role.User, name);
        String adminName = shown ? name : admin.username();
        String ownerName = shown ? name : owner.username();
        assertThat(sessionDisplayName(admin)).isEqualTo(adminName);
        assertThat(sessionDisplayName(owner)).isEqualTo(ownerName);

        BlogPostView created = blogService.create(admin, new BlogService.PostInput("Byline", ""));
        BlogPostView updated = blogService.update(admin, created.id(), new BlogService.PostInput("Byline edited", ""));
        assertThat(List.of(created, updated, blogService.get(owner, created.id()))).allSatisfy(post -> {
            assertThat(post.createdByName()).isEqualTo(adminName);
            assertThat(post.updatedByName()).isEqualTo(adminName);
        });

        Long reportId = draftWithLine(owner).reportId();
        ReportSummary submitted = reportService.submit(owner, ReportKind.EXPENSE, reportId);
        ReportDetail detail = reportService.detail(owner, ReportKind.EXPENSE, reportId);
        assertThat(submitted.submittedBy()).isEqualTo(ownerName);
        assertThat(detail.createdByName()).isEqualTo(ownerName);
        assertThat(detail.submittedBy()).isEqualTo(ownerName);
        for (Caller lister : List.of(owner, admin)) {
            assertThat(reportService.list(lister, ReportKind.EXPENSE, null, null, null, null, null))
                    .extracting(ReportSummary::submittedBy)
                    .containsExactly(ownerName);
        }
    }

    private String sessionDisplayName(Caller caller) {
        AppUser stored = appUserRepository.findById(caller.id()).orElseThrow();
        return authService.sessionUser(AppUserPrincipal.from(stored)).displayName();
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

    static Stream<Arguments> seedFileMissingARequiredPartFailsBeforeWritingAnyRow() {
        return Stream.of(
                arguments("no users section", edit(seed -> seed.remove("users")), "users is missing"),
                arguments("no reports section", edit(seed -> seed.remove("reports")), "reports is missing"),
                arguments("no blogPosts section", edit(seed -> seed.remove("blogPosts")), "blogPosts is missing"),
                arguments("an empty object", edit(ObjectNode::removeAll),
                        "users is missing; reports is missing; blogPosts is missing"),
                arguments("a misspelt section key", edit(seed -> seed.set("blogposts", seed.remove("blogPosts"))),
                        "blogPosts is missing"),
                arguments("a null user", edit(seed -> seed.putArray("users").addNull()), "users[0] is null"),
                arguments("a user without roles", edit(seed -> element(seed, "users", 0).remove("roles")),
                        "users[0].roles (seedcheck_invalid_owner) is missing"),
                arguments("a Registered role",
                        edit(seed -> element(seed, "users", 0).putArray("roles").add("Registered")),
                        "users[0].roles[0] (seedcheck_invalid_owner) is Registered"),
                arguments("a duplicate username",
                        edit(seed -> seed.withArrayProperty("users").add(element(seed, "users", 0).deepCopy())),
                        "users[2] (seedcheck_invalid_owner) repeats an earlier username"),
                arguments("a report without lines", edit(seed -> element(seed, "reports", 0).remove("lines")),
                        "reports[0].lines (901/2099 EX) is missing"),
                arguments("a line without amount", edit(seed -> seedLine(seed, 0).remove("amount")),
                        "reports[0].lines[0] (901/2099 EX) has no amount"),
                arguments("a mileage line without kilometers", edit(seed -> seedLine(seed, 1).remove("kilometers")),
                        "reports[0].lines[1] (901/2099 EX) has no kilometers"),
                arguments("a post without author", edit(seed -> element(seed, "blogPosts", 0).remove("author")),
                        "blogPosts[0] (Seedcheck post) has no author"),
                arguments("an unknown owner",
                        edit(seed -> element(seed, "reports", 0).put("owner", "seedcheck_ghost")),
                        "reports[0] (901/2099 EX) has unknown owner seedcheck_ghost"));
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource
    void seedFileMissingARequiredPartFailsBeforeWritingAnyRow(
            String variant, Consumer<ObjectNode> edit, String problem) {
        ObjectNode seed = seedTree("seedcheck_invalid");
        edit.accept(seed);
        ByteArrayResource resource = seedResource(seed);
        SeedRows before = seedRows();

        assertThatExceptionOfType(IllegalStateException.class)
                .isThrownBy(() -> seedDataLoader.seed(resource))
                .satisfies(error -> assertThat(error.getMessage())
                        .startsWith("Seed file " + resource.getDescription() + " is invalid: ")
                        .contains(problem)
                        .doesNotContain(SEED_PASSWORD));
        assertThat(seedRows()).isEqualTo(before);
    }

    @Test
    void seedFailingDuringInsertRollsBackEveryRow() {
        ObjectNode seed = seedTree("seedcheck_rollback");
        element(seed, "reports", 1).put("kind", "expense").put("code", "901/2099 EX");
        SeedRows before = seedRows();

        assertThatExceptionOfType(DataIntegrityViolationException.class)
                .isThrownBy(() -> seedDataLoader.seed(seedResource(seed)));

        assertThat(seedRows()).isEqualTo(before);
        assertThat(appUserRepository.findByUsername("seedcheck_rollback_owner")).isEmpty();
    }

    @Test
    void validSeedFileWithAnExplicitlyEmptyLineListLoadsEveryRow() {
        SeedRows before = seedRows();

        seedDataLoader.seed(seedResource(seedTree("seedcheck_valid")));

        assertThat(seedRows()).isEqualTo(new SeedRows(before.users() + 2, before.posts() + 1, 1, 1, 2, 0));
        Long ownerId = appUserRepository.findByUsername("seedcheck_valid_owner").orElseThrow().getId();
        assertThat(expenseReportRepository.findAll()).singleElement().satisfies(report -> {
            assertThat(report.getCode()).isEqualTo("901/2099 EX");
            assertThat(report.getCreatedBy()).isEqualTo(ownerId);
        });
        assertThat(earningReportRepository.findAll()).singleElement()
                .satisfies(report -> assertThat(report.getCode()).isEqualTo("901/2099 EA"));
        assertThat(expenseRepository.findAll()).extracting(Expense::getAmountInEuros)
                .usingElementComparator(BigDecimal::compareTo)
                .containsExactlyInAnyOrder(new BigDecimal("80.00"), new BigDecimal("3.70"));
    }

    private record SeedRows(long users, long posts, long expenseReports, long earningReports, long expenses,
            long earnings) {
    }

    private SeedRows seedRows() {
        return new SeedRows(appUserRepository.count(), blogPostRepository.count(), expenseReportRepository.count(),
                earningReportRepository.count(), expenseRepository.count(), earningRepository.count());
    }

    private static ObjectNode seedTree(String usernamePrefix) {
        try {
            return (ObjectNode) JSON.readTree(SEED_TEMPLATE.formatted(usernamePrefix, SEED_PASSWORD));
        } catch (JsonProcessingException e) {
            throw new UncheckedIOException(e);
        }
    }

    private static ByteArrayResource seedResource(ObjectNode seed) {
        return new ByteArrayResource(seed.toString().getBytes(StandardCharsets.UTF_8), "seedcheck fixture");
    }

    private static ObjectNode element(ObjectNode seed, String section, int index) {
        return (ObjectNode) seed.get(section).get(index);
    }

    private static ObjectNode seedLine(ObjectNode seed, int index) {
        return (ObjectNode) element(seed, "reports", 0).get("lines").get(index);
    }

    private static Consumer<ObjectNode> edit(Consumer<ObjectNode> edit) {
        return edit;
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
        return draftWithLine(owner, ReportKind.EXPENSE);
    }

    private LineView draftWithLine(Caller owner, ReportKind kind) {
        Long reportId = reportService.create(owner, kind, "London Trip").id();
        int typeId = kind == ReportKind.EXPENSE ? ReferenceIds.EXPENSE_TYPE_TRAVEL : ReferenceIds.EARNING_TYPE_SERVICE;
        return lineService.create(owner, kind, reportId, line(typeId, ReferenceIds.CURRENCY_EURO,
                new BigDecimal("42.00"), null, "Flight tickets", "Tickets for flight to London", LINE_DATE));
    }

    // The kind's own repositories, chosen here rather than through KindRepositories, which the tests check.
    private ReportRepository<? extends ReportEntity> reportsOf(ReportKind kind) {
        return switch (kind) {
            case EXPENSE -> expenseReportRepository;
            case EARNING -> earningReportRepository;
        };
    }

    private LineRepository<? extends LineEntity> linesOf(ReportKind kind) {
        return switch (kind) {
            case EXPENSE -> expenseRepository;
            case EARNING -> earningRepository;
        };
    }

    private InvoiceRepository<? extends InvoiceEntity> invoicesOf(ReportKind kind) {
        return switch (kind) {
            case EXPENSE -> invoiceExpenseRepository;
            case EARNING -> invoiceEarningRepository;
        };
    }

    private static ReportKind otherKind(ReportKind kind) {
        return kind == ReportKind.EXPENSE ? ReportKind.EARNING : ReportKind.EXPENSE;
    }

    // Each table counts ids on its own; restarting all four at one value gives the line an other-kind twin with the
    // same report and line ids, so a write that reaches the wrong kind's tables changes the twin.
    private LineView draftWithLineAndTwin(Caller owner, ReportKind kind) {
        Long nextId = jdbcTemplate.queryForObject("SELECT MAX(IDENTITY_BASE) FROM INFORMATION_SCHEMA.COLUMNS"
                + " WHERE TABLE_NAME IN ('EXPENSEREPORT', 'EARNINGREPORT', 'EXPENSE', 'EARNING')"
                + " AND COLUMN_NAME = 'ID'", Long.class);
        List.of("ExpenseReport", "EarningReport", "Expense", "Earning").forEach(table ->
                jdbcTemplate.execute("ALTER TABLE " + table + " ALTER COLUMN Id RESTART WITH " + nextId));
        LineView twin = draftWithLine(owner, otherKind(kind));
        storeInvoice(otherKind(kind), twin.id(), TWIN_INVOICE);
        LineView line = draftWithLine(owner, kind);
        assertThat(line).extracting(LineView::reportId, LineView::id).containsExactly(twin.reportId(), twin.id());
        return line;
    }

    private void storeInvoice(ReportKind kind, Long lineId, StoredInvoice stored) {
        switch (kind) {
            case EXPENSE -> invoiceExpenseRepository.save(filled(new InvoiceExpense(lineId), stored));
            case EARNING -> invoiceEarningRepository.save(filled(new InvoiceEarning(lineId), stored));
        }
    }

    private static <I extends InvoiceEntity> I filled(I invoice, StoredInvoice stored) {
        invoice.setFilename(stored.filename());
        invoice.setFiletype(stored.filetype());
        invoice.setContent(stored.content());
        invoice.setDatetime(stored.datetime());
        return invoice;
    }

    // Content is lazy, so the invoice is read inside a transaction.
    private Optional<StoredInvoice> storedInvoice(ReportKind kind, Long lineId) {
        return new TransactionTemplate(transactionManager).execute(tx -> invoicesOf(kind).findById(lineId)
                .map(invoice -> new StoredInvoice(invoice.getFilename(), invoice.getFiletype(), invoice.getContent(),
                        invoice.getDatetime())));
    }

    private void assertTwinUnchanged(ReportKind kind, LineView line) {
        assertThat(reportsOf(kind).findById(line.reportId())).get()
                .extracting(ReportEntity::getTitle, ReportEntity::getStatusId)
                .containsExactly("London Trip", ReferenceIds.STATUS_DRAFT);
        assertThat(linesOf(kind).findById(line.id())).get()
                .extracting(LineEntity::getReportId, LineEntity::getTitle)
                .containsExactly(line.reportId(), "Flight tickets");
        assertThat(invoicesOf(kind).count()).isEqualTo(1);
        assertThat(storedInvoice(kind, line.id())).get().usingRecursiveComparison().isEqualTo(TWIN_INVOICE);
    }

    private record StoredInvoice(String filename, String filetype, byte[] content, LocalDateTime datetime) {
    }

    private static Caller newCaller(AppUserRepository users, Role role) {
        String username = role.name().toLowerCase(Locale.ROOT) + "-" + UUID.randomUUID();
        String name = role.name() + " " + username.substring(username.length() - 6);
        AppUser saved = users.save(new AppUser(username, name, "unused-hash", EnumSet.of(role)));
        return new Caller(saved.getId(), username, name, EnumSet.of(role, Role.Registered));
    }

    private static Caller newCaller(AppUserRepository users, Role role, String name) {
        String username = role.name().toLowerCase(Locale.ROOT) + "-" + UUID.randomUUID();
        AppUser saved = users.save(new AppUser(username, name, "unused-hash", EnumSet.of(role)));
        return new Caller(saved.getId(), username, name, EnumSet.of(role, Role.Registered));
    }

    private static LineService.LineInput line(Integer typeId, Integer currencyId, BigDecimal amount,
            BigDecimal kilometers, String title, String description, LocalDate date) {
        return new LineService.LineInput(typeId, currencyId, amount, kilometers, title, description, date, List.of());
    }

    private static BigDecimal decimal(String value) {
        return value == null ? null : new BigDecimal(value);
    }

    // Errors without field violations only; validation failures go through assertFieldError.
    private static void assertApiError(ThrowingCallable call, int status, String code, String message) {
        if (ApiException.VALIDATION_FAILED.equals(code)) {
            throw new IllegalArgumentException("Assert VALIDATION_FAILED with assertFieldError");
        }
        assertThatExceptionOfType(ApiException.class).isThrownBy(call).satisfies(error -> {
            assertThat(error.status()).isEqualTo(status);
            assertThat(error.code()).isEqualTo(code);
            assertThat(error.getMessage()).isEqualTo(message);
            assertThat(error.fieldErrors()).isEmpty();
        });
    }

    private static void assertFieldError(ThrowingCallable call, String field, String message) {
        assertThatExceptionOfType(ApiException.class).isThrownBy(call).satisfies(error -> {
            assertThat(error.status()).isEqualTo(422);
            assertThat(error.code()).isEqualTo(ApiException.VALIDATION_FAILED);
            assertThat(error.getMessage()).isEqualTo(message);
            assertThat(error.fieldErrors()).containsExactly(new FieldViolation(field, message));
        });
    }

    // Not a @Configuration, so @SpringBootTest still uses the application's configuration.
    @EnableConfigurationProperties(ExpensesProperties.class)
    static class PropertiesBinding {
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
    @TestPropertySource(properties = {"expenses.mileage-reimbursement=2", "expenses.dollars-to-euros=2"})
    class RatesAboveOne {

        @Autowired
        private AppUserRepository users;
        @Autowired
        private ExpenseRepository expenses;
        @Autowired
        private ReportService reports;
        @Autowired
        private LineService lines;
        @Autowired
        private MutableClock ratesClock;

        @BeforeEach
        void setClock() {
            ratesClock.set(MutableClock.DEFAULT_TIME);
        }

        @ParameterizedTest(name = "type {0}, currency {1}, amount {2}, km {3} rejects {4}")
        @CsvSource({
                ReferenceIds.EXPENSE_TYPE_KILOMETERS + ", , , 999999999999999, kilometers",
                ReferenceIds.EXPENSE_TYPE_TRAVEL + ", " + ReferenceIds.CURRENCY_DOLLAR
                        + ", 999999999999999.9999, , amount"})
        void euroValueBeyondTheMoneyColumnIsRejected(
                int typeId, Integer currencyId, BigDecimal amount, BigDecimal kilometers, String field) {
            Caller owner = newCaller(users, Role.User);
            Long reportId = reports.create(owner, ReportKind.EXPENSE, "Rates above one").id();
            LineService.LineInput input = line(typeId, currencyId, amount, kilometers, "Too large", "", LINE_DATE);

            assertFieldError(() -> lines.create(owner, ReportKind.EXPENSE, reportId, input),
                    field, LegacyMessages.INVALID_VALUE);
            assertThat(expenses.existsByReportId(reportId)).isFalse();
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
