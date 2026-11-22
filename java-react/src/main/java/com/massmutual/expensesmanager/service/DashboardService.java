package com.massmutual.expensesmanager.service;

import com.massmutual.expensesmanager.domain.ReferenceIds;
import com.massmutual.expensesmanager.domain.ReportKind;
import com.massmutual.expensesmanager.domain.Role;
import com.massmutual.expensesmanager.repository.DatedAmountRow;
import com.massmutual.expensesmanager.repository.LineRepository;
import com.massmutual.expensesmanager.repository.ReportRepository;
import com.massmutual.expensesmanager.repository.TypeTotalRow;
import com.massmutual.expensesmanager.service.model.AdminDashboard;
import com.massmutual.expensesmanager.service.model.DatedAmount;
import com.massmutual.expensesmanager.service.model.Period;
import com.massmutual.expensesmanager.service.model.StatusCounts;
import com.massmutual.expensesmanager.service.model.TypeShare;
import com.massmutual.expensesmanager.service.model.UserDashboard;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.Arrays;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class DashboardService {

    private static final List<Integer> STATS_STATUSES =
            List.of(ReferenceIds.STATUS_SUBMITTED, ReferenceIds.STATUS_APPROVED);
    private static final int PER_DATE_DAYS = 30;

    private static final Comparator<TypeTotalRow> LARGEST_SUM_FIRST = Comparator
            .comparing(TypeTotalRow::sum, Comparator.nullsLast(Comparator.<BigDecimal>reverseOrder()))
            .thenComparing(TypeTotalRow::label, Comparator.nullsLast(Comparator.<String>naturalOrder()));

    private static final Comparator<DatedAmount> BY_DATE_THEN_KIND = Comparator
            .comparing(DatedAmount::date)
            .thenComparing(DatedAmount::kind);

    private final KindRepositories kindRepositories;
    private final ReportAccessPolicy policy;
    private final AmountCalculator calculator;
    private final ExpensesProperties properties;
    private final Clock clock;

    public DashboardService(
            KindRepositories kindRepositories,
            ReportAccessPolicy policy,
            AmountCalculator calculator,
            ExpensesProperties properties,
            Clock clock) {
        this.kindRepositories = kindRepositories;
        this.policy = policy;
        this.calculator = calculator;
        this.properties = properties;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public UserDashboard user(Caller caller) {
        policy.requireAnyRole(caller, Role.User);
        LocalDate referenceDate = properties.referenceDate(clock);
        Long userId = caller.id();
        LineRepository<?> expenses = kindRepositories.lines(ReportKind.EXPENSE);
        LineRepository<?> earnings = kindRepositories.lines(ReportKind.EARNING);

        BigDecimal totalExpenses = orZero(expenses.sumForCreatorInStatuses(userId, STATS_STATUSES));
        BigDecimal totalEarnings = orZero(earnings.sumForCreatorInStatuses(userId, STATS_STATUSES));

        // Months are matched by number only, so in January last month (0) matches no line.
        int month = referenceDate.getMonthValue();
        BigDecimal currentMonthSpent =
                orZero(expenses.sumForCreatorInStatusesAndMonth(userId, STATS_STATUSES, month));
        BigDecimal lastMonthSpent =
                orZero(expenses.sumForCreatorInStatusesAndMonth(userId, STATS_STATUSES, month - 1));
        BigDecimal currentMonthEarnings =
                orZero(earnings.sumForCreatorInStatusesAndMonth(userId, STATS_STATUSES, month));
        BigDecimal monthChangePercent = lastMonthSpent.signum() == 0
                ? null
                : calculator.percent(lastMonthSpent.subtract(currentMonthSpent), lastMonthSpent);

        YearMonth currentMonth = YearMonth.from(referenceDate);
        return new UserDashboard(
                calculator.money(totalEarnings.subtract(totalExpenses)),
                calculator.money(currentMonthSpent),
                calculator.money(lastMonthSpent),
                monthChangePercent,
                calculator.money(currentMonthEarnings),
                period(currentMonth),
                period(currentMonth.minusMonths(1)),
                typeShares(expenses.totalsByType(userId, STATS_STATUSES), totalExpenses),
                typeShares(earnings.totalsByType(userId, STATS_STATUSES), totalEarnings),
                perDate(userId, referenceDate.minusDays(PER_DATE_DAYS)),
                statusCounts(userId),
                hasDraftReports(userId));
    }

    @Transactional(readOnly = true)
    public AdminDashboard admin(Caller caller) {
        policy.requireAdministrator(caller);
        long total = 0;
        long waiting = 0;
        long approved = 0;
        for (ReportKind kind : ReportKind.values()) {
            ReportRepository<?> reports = kindRepositories.reports(kind);
            total += reports.countByStatusIdNot(ReferenceIds.STATUS_DRAFT);
            waiting += reports.countByStatusId(ReferenceIds.STATUS_SUBMITTED);
            approved += reports.countByStatusId(ReferenceIds.STATUS_APPROVED);
        }
        BigDecimal approvedRate = calculator.percent(BigDecimal.valueOf(approved), BigDecimal.valueOf(total));
        return new AdminDashboard(total, waiting, approvedRate);
    }

    private List<TypeShare> typeShares(List<TypeTotalRow> rows, BigDecimal total) {
        return rows.stream()
                .sorted(LARGEST_SUM_FIRST)
                .map(row -> new TypeShare(
                        row.typeId(),
                        row.label(),
                        row.count() == null ? 0L : row.count(),
                        calculator.money(row.sum()),
                        calculator.percent(row.sum(), total)))
                .toList();
    }

    private List<DatedAmount> perDate(Long userId, LocalDate since) {
        return Arrays.stream(ReportKind.values())
                .flatMap(kind -> totalsByDate(kindRepositories.lines(kind).findForCreatorSince(userId, since))
                        .entrySet().stream()
                        .map(total -> datedAmount(kind, total.getKey(), total.getValue())))
                .sorted(BY_DATE_THEN_KIND)
                .toList();
    }

    private static Map<LocalDate, BigDecimal> totalsByDate(List<DatedAmountRow> rows) {
        return rows.stream().collect(Collectors.groupingBy(
                DatedAmountRow::date,
                Collectors.reducing(BigDecimal.ZERO, row -> orZero(row.amountInEuros()), BigDecimal::add)));
    }

    private DatedAmount datedAmount(ReportKind kind, LocalDate date, BigDecimal total) {
        return new DatedAmount(kind.pathValue(), date, calculator.money(total));
    }

    private StatusCounts statusCounts(Long userId) {
        Map<Integer, Long> counts = new HashMap<>();
        for (ReportKind kind : ReportKind.values()) {
            kindRepositories.reports(kind).statusCountsForCreator(userId)
                    .forEach((statusId, count) -> counts.merge(statusId, count, Long::sum));
        }
        return new StatusCounts(
                counts.getOrDefault(ReferenceIds.STATUS_DRAFT, 0L),
                counts.getOrDefault(ReferenceIds.STATUS_SUBMITTED, 0L),
                counts.getOrDefault(ReferenceIds.STATUS_APPROVED, 0L),
                counts.getOrDefault(ReferenceIds.STATUS_DECLINED, 0L));
    }

    private boolean hasDraftReports(Long userId) {
        return Arrays.stream(ReportKind.values())
                .anyMatch(kind -> kindRepositories.reports(kind)
                        .existsByCreatedByAndStatusId(userId, ReferenceIds.STATUS_DRAFT));
    }

    private static Period period(YearMonth month) {
        return new Period(month.atDay(1), month.atEndOfMonth());
    }

    private static BigDecimal orZero(BigDecimal value) {
        return value == null ? BigDecimal.ZERO : value;
    }
}
