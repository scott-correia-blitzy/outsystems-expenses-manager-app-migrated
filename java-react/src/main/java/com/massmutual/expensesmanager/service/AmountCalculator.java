package com.massmutual.expensesmanager.service;

import com.massmutual.expensesmanager.domain.ReferenceIds;
import com.massmutual.expensesmanager.domain.ReportKind;
import com.massmutual.expensesmanager.service.model.FieldViolation;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

import org.springframework.stereotype.Component;

@Component
public class AmountCalculator {

    private static final int STORED_SCALE = 4;
    private static final int MONEY_SCALE = 2;
    private static final BigDecimal HUNDRED = BigDecimal.valueOf(100);
    private static final int MAX_INTEGER_DIGITS = 15;
    private static final int MAX_SCALE = 100;

    private final ExpensesProperties properties;

    public AmountCalculator(ExpensesProperties properties) {
        this.properties = Objects.requireNonNull(properties, "properties");
    }

    public record LineAmounts(Integer currencyId, BigDecimal amount, BigDecimal kilometers, BigDecimal amountInEuros) {
    }

    public BigDecimal stored(BigDecimal value) {
        return value == null ? null : value.setScale(STORED_SCALE, RoundingMode.HALF_UP);
    }

    public BigDecimal money(BigDecimal value) {
        return (value == null ? BigDecimal.ZERO : value).setScale(MONEY_SCALE, RoundingMode.HALF_UP);
    }

    public BigDecimal mileage(BigDecimal kilometers) {
        Objects.requireNonNull(kilometers, "kilometers");
        if (!withinDecimalRange(kilometers)) {
            throw new ApiException(422, ApiException.VALIDATION_FAILED, LegacyMessages.INVALID_VALUE, List.of());
        }
        return stored(kilometers.multiply(properties.mileageReimbursement()));
    }

    public BigDecimal usdToEur(BigDecimal amount, BigDecimal rate) {
        List<FieldViolation> violations = new ArrayList<>();
        collectViolation(violations, "amount", amount, LegacyMessages.USD_AMOUNT_ABOVE_ZERO);
        collectViolation(violations, "rate", rate, LegacyMessages.RATE_ABOVE_ZERO);
        if (!violations.isEmpty()) {
            throw ApiException.validation(violations);
        }
        return stored(amount.multiply(rate));
    }

    public LineAmounts lineAmounts(ReportKind kind, Integer typeId, Integer currencyId,
            BigDecimal amount, BigDecimal kilometers) {
        if (kind == ReportKind.EXPENSE && Objects.equals(typeId, ReferenceIds.EXPENSE_TYPE_KILOMETERS)) {
            BigDecimal euros = mileage(kilometers);
            // The stored amount is the computed euro value, so the line's currency is always Euro.
            return new LineAmounts(ReferenceIds.CURRENCY_EURO, euros, kilometers, euros);
        }
        Objects.requireNonNull(amount, "amount");
        if (Objects.equals(currencyId, ReferenceIds.CURRENCY_DOLLAR)) {
            BigDecimal euros = stored(amount.multiply(properties.dollarsToEuros()));
            return new LineAmounts(ReferenceIds.CURRENCY_DOLLAR, stored(amount), null, euros);
        }
        BigDecimal euros = stored(amount);
        return new LineAmounts(currencyId, euros, null, euros);
    }

    public BigDecimal vat(BigDecimal euros) {
        return euros == null ? money(null) : money(euros.multiply(properties.vatRate()));
    }

    public BigDecimal percent(BigDecimal part, BigDecimal total) {
        if (total == null || total.signum() == 0 || part == null) {
            return money(null);
        }
        return part.multiply(HUNDRED).divide(total, MONEY_SCALE, RoundingMode.HALF_UP);
    }

    public BigDecimal distance(BigDecimal kilometers) {
        if (kilometers == null) {
            return null;
        }
        BigDecimal stripped = kilometers.stripTrailingZeros();
        return stripped.scale() < 0 ? stripped.setScale(0) : stripped;
    }

    private static void collectViolation(List<FieldViolation> violations, String field, BigDecimal value,
            String nonPositiveMessage) {
        if (value == null || value.signum() <= 0) {
            violations.add(new FieldViolation(field, nonPositiveMessage));
        } else if (!withinDecimalRange(value)) {
            violations.add(new FieldViolation(field, LegacyMessages.INVALID_VALUE));
        }
    }

    // Rounding an extreme exponent would materialise a number with that many digits, so such inputs are refused.
    private static boolean withinDecimalRange(BigDecimal value) {
        return (long) value.precision() - value.scale() <= MAX_INTEGER_DIGITS
                && (value.scale() <= MAX_SCALE || value.stripTrailingZeros().scale() <= MAX_SCALE);
    }
}
