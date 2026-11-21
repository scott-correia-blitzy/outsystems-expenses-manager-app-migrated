package com.massmutual.expensesmanager.service;

import com.massmutual.expensesmanager.domain.LineEntity;
import com.massmutual.expensesmanager.domain.ReferenceIds;
import com.massmutual.expensesmanager.domain.ReportEntity;
import com.massmutual.expensesmanager.domain.ReportKind;
import com.massmutual.expensesmanager.domain.Role;
import com.massmutual.expensesmanager.repository.AppUserRepository;
import com.massmutual.expensesmanager.repository.LineRepository;
import com.massmutual.expensesmanager.repository.ReportListRow;
import com.massmutual.expensesmanager.repository.ReportRepository;
import com.massmutual.expensesmanager.service.model.FieldViolation;
import com.massmutual.expensesmanager.service.model.LineView;
import com.massmutual.expensesmanager.service.model.ReportDetail;
import com.massmutual.expensesmanager.service.model.ReportSummary;
import java.math.BigDecimal;
import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.EnumMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.concurrent.locks.Lock;
import java.util.concurrent.locks.ReentrantLock;
import java.util.function.Function;
import java.util.stream.Stream;
import org.hibernate.exception.ConstraintViolationException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

@Service
public class ReportService {

    private static final int TITLE_MAX_LENGTH = 50;
    private static final List<String> REPORT_CODE_INDEXES =
            List.of("ExpenseReport_UniqueIndex_ReportCode", "EarningReport_UniqueIndex_ReportCode");
    private static final String DEFAULT_SORT = "id,desc";

    private final KindRepositories kindRepositories;
    private final ReportAccessPolicy policy;
    private final ReportCodeGenerator codeGenerator;
    private final LineService lineService;
    private final AmountCalculator calculator;
    private final ReferenceDataService referenceData;
    private final AppUserRepository appUserRepository;
    private final Clock clock;
    private final TransactionTemplate newTransaction;
    private final Map<ReportKind, Lock> codeLocks = new EnumMap<>(ReportKind.class);

    public ReportService(
            KindRepositories kindRepositories,
            ReportAccessPolicy policy,
            ReportCodeGenerator codeGenerator,
            LineService lineService,
            AmountCalculator calculator,
            ReferenceDataService referenceData,
            AppUserRepository appUserRepository,
            Clock clock,
            PlatformTransactionManager transactionManager) {
        this.kindRepositories = kindRepositories;
        this.policy = policy;
        this.codeGenerator = codeGenerator;
        this.lineService = lineService;
        this.calculator = calculator;
        this.referenceData = referenceData;
        this.appUserRepository = appUserRepository;
        this.clock = clock;
        this.newTransaction = new TransactionTemplate(transactionManager);
        this.newTransaction.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        for (ReportKind kind : ReportKind.values()) {
            codeLocks.put(kind, new ReentrantLock());
        }
    }

    @Transactional(readOnly = true)
    public List<ReportSummary> list(
            Caller caller, ReportKind kind, String status, String q, String sort, String from, String to) {
        policy.requireAnyRole(caller, Role.User, Role.Approver, Role.Administrator);
        if (kind == null) {
            throw ApiException.validation("kind", LegacyMessages.SELECT_REPORT_TYPE);
        }
        Integer statusId = statusFilter(status);
        String keyword = q == null || q.isBlank() ? null : q.trim().toLowerCase(Locale.ROOT);
        LocalDateTime lower = dateBound("from", from);
        LocalDateTime upper = dateBound("to", to);
        Comparator<ReportSummary> order = sortOrder(sort);

        List<ReportListRow> rows = reports(kind).findListRows(
                caller.id(),
                caller.has(Role.Approver),
                caller.has(Role.Administrator),
                statusId,
                keyword,
                lower,
                upper);
        Map<Long, BigDecimal> totals = lines(kind).totalsByReportId(rows.stream().map(ReportListRow::id).toList());
        return rows.stream()
                .map(row -> new ReportSummary(
                        row.id(),
                        row.code(),
                        row.title(),
                        referenceData.statusLabel(row.statusId()),
                        row.createdOn(),
                        row.submitedOn(),
                        calculator.money(totals.get(row.id())),
                        row.submittedByName()))
                .sorted(order)
                .toList();
    }

    @Transactional(readOnly = true)
    public ReportDetail detail(Caller caller, ReportKind kind, Long id) {
        ReportEntity report = policy.loadReport(kind, id);
        policy.requireOwnerOrAdminRead(caller, report);

        List<LineEntity> lines = lines(kind).findByReportId(report.getId()).stream()
                .sorted(Comparator.comparing(LineEntity::getId))
                .toList();
        List<LineView> views = lineService.views(kind, lines);
        BigDecimal total = lines.stream()
                .map(LineEntity::getAmountInEuros)
                .filter(Objects::nonNull)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        Long createdBy = report.getCreatedBy();
        Long submitedBy = report.getSubmitedBy();
        Map<Long, String> names = appUserRepository.displayNames(
                Stream.of(createdBy, submitedBy).filter(Objects::nonNull).distinct().toList());
        return new ReportDetail(
                report.getId(),
                kind.pathValue(),
                report.getCode(),
                report.getTitle(),
                referenceData.statusLabel(report.getStatusId()),
                report.getCreatedOn(),
                createdBy == null ? null : names.get(createdBy),
                report.getSubmitedOn(),
                report.getProcessedOn(),
                submitedBy == null ? null : names.get(submitedBy),
                calculator.money(total),
                calculator.vat(total),
                views);
    }

    // The kind's lock stops concurrent creates from taking the same next code; each attempt commits in its own
    // transaction, so a collision with a code stored by other means is retried after a rollback.
    public ReportSummary create(Caller caller, ReportKind kind, String title) {
        policy.requireAnyRole(caller, Role.User);
        String storedTitle = normalizeTitle(title);
        List<FieldViolation> violations = new ArrayList<>();
        if (kind == null) {
            violations.add(new FieldViolation("kind", LegacyMessages.SELECT_REPORT_TYPE));
        }
        titleViolation(storedTitle).ifPresent(violations::add);
        if (!violations.isEmpty()) {
            throw ApiException.validation(violations);
        }
        Lock codeLock = codeLocks.get(kind);
        codeLock.lock();
        try {
            return insertDraft(caller, kind, storedTitle);
        } catch (DataIntegrityViolationException firstCollision) {
            if (!isReportCodeCollision(firstCollision)) {
                throw firstCollision;
            }
            try {
                return insertDraft(caller, kind, storedTitle);
            } catch (DataIntegrityViolationException secondCollision) {
                if (!isReportCodeCollision(secondCollision)) {
                    throw secondCollision;
                }
                ApiException conflict = ApiException.codeConflict();
                conflict.initCause(secondCollision);
                throw conflict;
            }
        } finally {
            codeLock.unlock();
        }
    }

    @Transactional
    public ReportSummary rename(Caller caller, ReportKind kind, Long id, String title) {
        ReportEntity report = policy.loadReportForWrite(kind, id);
        policy.requireOwnerWrite(caller, report);
        policy.requireDraft(report, LegacyMessages.NOT_DRAFT);
        String storedTitle = normalizeTitle(title);
        Optional<FieldViolation> invalidTitle = titleViolation(storedTitle);
        if (invalidTitle.isPresent()) {
            throw ApiException.validation(List.of(invalidTitle.get()));
        }

        report.setTitle(storedTitle);
        stampOwnerSave(report, caller, LocalDateTime.now(clock));
        return summary(kind, reports(kind).save(report));
    }

    @Transactional
    public ReportSummary submit(Caller caller, ReportKind kind, Long id) {
        ReportEntity report = policy.loadReportForWrite(kind, id);
        policy.requireOwnerWrite(caller, report);
        policy.requireDraft(report, LegacyMessages.CANNOT_SUBMIT);
        if (!lines(kind).existsByReportId(report.getId())) {
            throw ApiException.noLines();
        }

        LocalDateTime now = LocalDateTime.now(clock);
        report.setStatusId(ReferenceIds.STATUS_SUBMITTED);
        stampOwnerSave(report, caller, now);
        report.setSubmitedOn(now);
        return summary(kind, reports(kind).save(report));
    }

    @Transactional
    public ReportSummary decide(Caller caller, ReportKind kind, Long id, boolean accept) {
        ReportEntity report = policy.loadReportForWrite(kind, id);
        policy.requireAdministrator(caller);

        // No status check on purpose: an already decided report can be decided again.
        report.setStatusId(accept ? ReferenceIds.STATUS_APPROVED : ReferenceIds.STATUS_DECLINED);
        report.setProcessedOn(LocalDateTime.now(clock));
        return summary(kind, reports(kind).save(report));
    }

    // Lines and their invoices go with the report through ON DELETE CASCADE in schema.sql.
    @Transactional
    public void delete(Caller caller, ReportKind kind, Long id) {
        ReportEntity report = policy.loadReportForWrite(kind, id);
        policy.requireOwnerWrite(caller, report);
        policy.requireDraft(report, LegacyMessages.REPORT_CANT_BE_DELETED);
        reports(kind).delete(report);
    }

    private ReportSummary insertDraft(Caller caller, ReportKind kind, String title) {
        return newTransaction.execute(status -> {
            ReportEntity report = kindRepositories.newReport(kind);
            report.setCode(codeGenerator.nextCode(kind));
            report.setTitle(title);
            report.setStatusId(ReferenceIds.STATUS_DRAFT);
            report.setIsActive(false);
            stampOwnerSave(report, caller, LocalDateTime.now(clock));
            return summary(kind, reports(kind).saveAndFlush(report));
        });
    }

    // H2 names the violated index upper-cased and schema-qualified, as in PUBLIC.EXPENSEREPORT_UNIQUEINDEX_REPORTCODE.
    private static boolean isReportCodeCollision(DataIntegrityViolationException failure) {
        for (Throwable cause = failure; cause != null; cause = cause.getCause()) {
            if (cause instanceof ConstraintViolationException violation && violation.getConstraintName() != null) {
                String name = violation.getConstraintName();
                String index = name.substring(name.lastIndexOf('.') + 1);
                return REPORT_CODE_INDEXES.stream().anyMatch(index::equalsIgnoreCase);
            }
        }
        return false;
    }

    // Every owner save restamps the creation fields too, as the legacy save action did.
    private static void stampOwnerSave(ReportEntity report, Caller caller, LocalDateTime now) {
        report.setCreatedOn(now);
        report.setCreatedBy(caller.id());
        report.setSubmitedBy(caller.id());
        report.setUpdatedBy(caller.id());
        report.setUpdatedOn(now);
    }

    private ReportSummary summary(ReportKind kind, ReportEntity report) {
        return new ReportSummary(
                report.getId(),
                report.getCode(),
                report.getTitle(),
                referenceData.statusLabel(report.getStatusId()),
                report.getCreatedOn(),
                report.getSubmitedOn(),
                calculator.money(lines(kind).sumByReportId(report.getId())),
                name(report.getSubmitedBy()));
    }

    private String name(Long userId) {
        return userId == null ? null : appUserRepository.findNameById(userId).orElse(null);
    }

    private ReportRepository<ReportEntity> reports(ReportKind kind) {
        return kindRepositories.reports(kind);
    }

    private LineRepository<LineEntity> lines(ReportKind kind) {
        return kindRepositories.lines(kind);
    }

    private static Optional<FieldViolation> titleViolation(String storedTitle) {
        if (storedTitle == null || storedTitle.isEmpty()) {
            return Optional.of(new FieldViolation("title", LegacyMessages.INSERT_TITLE));
        }
        if (storedTitle.length() > TITLE_MAX_LENGTH) {
            return Optional.of(new FieldViolation("title", LegacyMessages.MAX_LENGTH_50));
        }
        return Optional.empty();
    }

    private static String normalizeTitle(String title) {
        if (title == null) {
            return null;
        }
        int start = 0;
        int end = title.length();
        while (start < end && isTitlePadding(title.charAt(start))) {
            start++;
        }
        while (end > start && isTitlePadding(title.charAt(end - 1))) {
            end--;
        }
        return title.substring(start, end);
    }

    // trim() alone keeps Unicode spaces such as U+2003 and strip() alone keeps control characters such as U+0000.
    private static boolean isTitlePadding(char c) {
        return c <= ' ' || Character.isWhitespace(c);
    }

    private Integer statusFilter(String status) {
        if (status == null || status.isBlank()) {
            return null;
        }
        return referenceData.statusIdForLabel(status)
                .orElseThrow(() -> ApiException.validation("status", LegacyMessages.INVALID_VALUE));
    }

    // A date alone means midnight of that day, as OutSystems converts a Date to a DateTime.
    private static LocalDateTime dateBound(String field, String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        String text = value.trim();
        try {
            return text.indexOf('T') < 0 ? LocalDate.parse(text).atStartOfDay() : LocalDateTime.parse(text);
        } catch (DateTimeParseException e) {
            throw ApiException.validation(field, LegacyMessages.INVALID_VALUE, e);
        }
    }

    private static Comparator<ReportSummary> sortOrder(String sort) {
        String[] parts = (sort == null || sort.isBlank() ? DEFAULT_SORT : sort).split(",", -1);
        if (parts.length != 2) {
            throw ApiException.validation("sort", LegacyMessages.INVALID_VALUE);
        }
        return columnOrder(parts[0].trim(), descending(parts[1]))
                .thenComparing(ReportSummary::id, Comparator.nullsLast(Comparator.reverseOrder()));
    }

    private static boolean descending(String direction) {
        return switch (direction.trim().toLowerCase(Locale.ROOT)) {
            case "asc" -> false;
            case "desc" -> true;
            default -> throw ApiException.validation("sort", LegacyMessages.INVALID_VALUE);
        };
    }

    private static Comparator<ReportSummary> columnOrder(String column, boolean descending) {
        return switch (column.toLowerCase(Locale.ROOT)) {
            case "id" -> natural(ReportSummary::id, descending);
            case "code" -> text(ReportSummary::code, descending);
            case "title" -> text(ReportSummary::title, descending);
            case "createdon" -> natural(ReportSummary::createdOn, descending);
            case "submitedon" -> natural(ReportSummary::submitedOn, descending);
            case "totaleur" -> natural(ReportSummary::totalEur, descending);
            case "status" -> text(ReportSummary::status, descending);
            case "submittedby" -> text(ReportSummary::submittedBy, descending);
            default -> throw ApiException.validation("sort", LegacyMessages.INVALID_VALUE);
        };
    }

    private static <T extends Comparable<? super T>> Comparator<ReportSummary> natural(
            Function<ReportSummary, T> key, boolean descending) {
        return nullsLast(key, Comparator.<T>naturalOrder(), descending);
    }

    private static Comparator<ReportSummary> text(Function<ReportSummary, String> key, boolean descending) {
        return nullsLast(key, String.CASE_INSENSITIVE_ORDER, descending);
    }

    private static <T> Comparator<ReportSummary> nullsLast(
            Function<ReportSummary, T> key, Comparator<T> order, boolean descending) {
        return Comparator.comparing(key, Comparator.nullsLast(descending ? order.reversed() : order));
    }
}
