package com.massmutual.expensesmanager.service;

import com.massmutual.expensesmanager.domain.LineEntity;
import com.massmutual.expensesmanager.domain.ReferenceIds;
import com.massmutual.expensesmanager.domain.ReportEntity;
import com.massmutual.expensesmanager.domain.ReportKind;
import com.massmutual.expensesmanager.repository.InvoiceRepository;
import com.massmutual.expensesmanager.service.model.FieldViolation;
import com.massmutual.expensesmanager.service.model.InvoiceInfo;
import com.massmutual.expensesmanager.service.model.LineView;
import java.math.BigDecimal;
import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class LineService {

    private static final int TITLE_MAX_LENGTH = 50;
    private static final int DESCRIPTION_MAX_LENGTH = 1500;

    private final KindRepositories kindRepositories;
    private final ReportAccessPolicy policy;
    private final AmountCalculator calculator;
    private final ReferenceDataService referenceData;
    private final Clock clock;

    public LineService(
            KindRepositories kindRepositories,
            ReportAccessPolicy policy,
            AmountCalculator calculator,
            ReferenceDataService referenceData,
            Clock clock) {
        this.kindRepositories = kindRepositories;
        this.policy = policy;
        this.calculator = calculator;
        this.referenceData = referenceData;
        this.clock = clock;
    }

    // requestViolations are the request's bean-validation errors, reported in one 422 with this service's own.
    public record LineInput(
            Integer typeId,
            Integer currencyId,
            BigDecimal amount,
            BigDecimal kilometers,
            String title,
            String description,
            LocalDate date,
            List<FieldViolation> requestViolations) {

        public LineInput {
            requestViolations = requestViolations == null ? List.of() : List.copyOf(requestViolations);
        }
    }

    @Transactional
    public LineView create(Caller caller, ReportKind kind, Long reportId, LineInput in) {
        ReportEntity report = policy.loadReportForWrite(kind, reportId);
        policy.requireOwnerWrite(caller, report);
        policy.requireDraft(report, LegacyMessages.NOT_DRAFT);
        LineInput rounded = roundedToColumns(in);
        validate(kind, rounded);

        LocalDateTime now = LocalDateTime.now(clock);
        LineEntity line = kindRepositories.newLine(kind);
        line.setReportId(report.getId());
        apply(kind, line, rounded);
        line.setCreatedBy(caller.id());
        line.setCreatedOn(now);
        line.setUpdatedBy(caller.id());
        line.setUpdatedOn(now);
        line.setIsActive(false);
        LineEntity saved = kindRepositories.lines(kind).save(line);
        return views(kind, List.of(saved)).getFirst();
    }

    @Transactional
    public LineView update(Caller caller, ReportKind kind, Long lineId, LineInput in) {
        ReportAccessPolicy.LockedLine locked = policy.loadLineForWrite(kind, lineId);
        LineEntity line = locked.line();
        ReportEntity report = locked.report();
        policy.requireOwnerWrite(caller, report);
        policy.requireDraft(report, LegacyMessages.NOT_DRAFT);
        LineInput rounded = roundedToColumns(in);
        validate(kind, rounded);

        apply(kind, line, rounded);
        line.setUpdatedBy(caller.id());
        line.setUpdatedOn(LocalDateTime.now(clock));
        LineEntity saved = kindRepositories.lines(kind).save(line);
        return views(kind, List.of(saved)).getFirst();
    }

    // The line's invoice is removed by the ON DELETE CASCADE foreign key in schema.sql.
    @Transactional
    public void delete(Caller caller, ReportKind kind, Long lineId) {
        ReportAccessPolicy.LockedLine locked = policy.loadLineForWrite(kind, lineId);
        LineEntity line = locked.line();
        ReportEntity report = locked.report();
        policy.requireOwnerWrite(caller, report);
        policy.requireDraft(report, LegacyMessages.DETAIL_CANT_BE_DELETED);
        kindRepositories.lines(kind).delete(line);
    }

    @Transactional(readOnly = true)
    public List<LineView> views(ReportKind kind, List<? extends LineEntity> lines) {
        if (lines == null || lines.isEmpty()) {
            return List.of();
        }
        List<Long> ids = lines.stream().map(LineEntity::getId).filter(Objects::nonNull).toList();
        Map<Long, InvoiceRepository.InvoiceMeta> invoices = ids.isEmpty()
                ? Map.of()
                : kindRepositories.invoices(kind).findInfoByIds(ids).stream()
                        .collect(Collectors.toMap(InvoiceRepository.InvoiceMeta::getId, Function.identity()));
        return lines.stream().map(line -> view(kind, line, invoices.get(line.getId()))).toList();
    }

    private LineView view(ReportKind kind, LineEntity line, InvoiceRepository.InvoiceMeta invoice) {
        return new LineView(
                line.getId(),
                line.getReportId(),
                line.getDate(),
                line.getTitle(),
                line.getDescription(),
                line.getTypeId(),
                referenceData.typeLabel(kind, line.getTypeId()),
                line.getCurrencyId(),
                calculator.money(line.getAmount()),
                calculator.distance(line.getKilometers()),
                calculator.money(line.getAmountInEuros()),
                calculator.vat(line.getAmountInEuros()),
                invoice == null
                        ? null
                        : new InvoiceInfo(invoice.getFilename(), invoice.getFiletype(), invoice.getDatetime()));
    }

    // Public so LineRequest's bean validation reports exactly the text errors this service enforces.
    public static List<FieldViolation> textViolations(String title, String description) {
        List<FieldViolation> violations = new ArrayList<>();
        if (title == null || title.trim().isEmpty()) {
            violations.add(new FieldViolation("title", LegacyMessages.FIELD_REQUIRED));
        } else if (title.length() > TITLE_MAX_LENGTH) {
            violations.add(new FieldViolation("title", LegacyMessages.MAX_LENGTH_50));
        }
        if (description != null && description.length() > DESCRIPTION_MAX_LENGTH) {
            violations.add(new FieldViolation("description", LegacyMessages.MAX_LENGTH_1500));
        }
        return violations;
    }

    // Validation sees the stored values, so a positive input that rounds to zero is rejected.
    private LineInput roundedToColumns(LineInput in) {
        Objects.requireNonNull(in, "line input");
        return new LineInput(in.typeId(), in.currencyId(), calculator.roundedAmount(in.amount()),
                calculator.roundedDistance(in.kilometers()), in.title(), in.description(), in.date(),
                in.requestViolations());
    }

    private void validate(ReportKind kind, LineInput in) {
        Set<FieldViolation> violations = new LinkedHashSet<>(textViolations(in.title(), in.description()));
        if (in.date() == null || in.date().isAfter(LocalDate.now(clock))) {
            violations.add(new FieldViolation("date", LegacyMessages.DATE_PAST_OR_CURRENT));
        }
        if (!referenceData.isActiveType(kind, in.typeId())) {
            violations.add(new FieldViolation(typeField(kind), LegacyMessages.FIELD_REQUIRED));
        }
        if (isKilometersExpense(kind, in.typeId())) {
            // Currency and amount are not checked: the stored amount is computed from the distance.
            if (!isPositive(in.kilometers())) {
                violations.add(new FieldViolation("kilometers", LegacyMessages.DISTANCE_POSITIVE));
            }
        } else {
            if (!referenceData.currencyExists(in.currencyId())) {
                violations.add(new FieldViolation("currencyId", LegacyMessages.FIELD_REQUIRED));
            }
            if (!isPositive(in.amount())) {
                violations.add(new FieldViolation("amount",
                        Objects.equals(in.currencyId(), ReferenceIds.CURRENCY_DOLLAR)
                                ? LegacyMessages.USD_AMOUNT_ABOVE_ZERO
                                : LegacyMessages.MUST_SET_AMOUNT));
            }
        }
        calculator.lineAmountsViolation(kind, in.typeId(), in.currencyId(), in.amount(), in.kilometers())
                .ifPresent(violations::add);
        violations.addAll(in.requestViolations());
        if (!violations.isEmpty()) {
            throw ApiException.validation(List.copyOf(violations));
        }
    }

    private void apply(ReportKind kind, LineEntity line, LineInput in) {
        line.setTitle(in.title().trim());
        line.setDescription(Objects.requireNonNullElse(in.description(), ""));
        line.setDate(in.date());
        line.setTypeId(in.typeId());
        AmountCalculator.LineAmounts amounts = calculator.lineAmounts(
                kind, in.typeId(), in.currencyId(), in.amount(), in.kilometers());
        line.setCurrencyId(amounts.currencyId());
        line.setAmount(amounts.amount());
        line.setKilometers(amounts.kilometers());
        line.setAmountInEuros(amounts.amountInEuros());
    }

    private static boolean isKilometersExpense(ReportKind kind, Integer typeId) {
        return kind == ReportKind.EXPENSE && Objects.equals(typeId, ReferenceIds.EXPENSE_TYPE_KILOMETERS);
    }

    private static boolean isPositive(BigDecimal value) {
        return value != null && value.signum() > 0;
    }

    private static String typeField(ReportKind kind) {
        return kind == ReportKind.EXPENSE ? "expenseTypeId" : "earningTypeId";
    }
}
