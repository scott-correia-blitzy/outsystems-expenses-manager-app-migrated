package com.massmutual.expensesmanager.service;

import com.massmutual.expensesmanager.domain.ReferenceIds;
import com.massmutual.expensesmanager.domain.ReportKind;
import com.massmutual.expensesmanager.service.model.FieldViolation;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.Optional;

import org.springframework.stereotype.Component;

@Component
public class AmountCalculator {

    private static final int STORED_SCALE = 4;
    private static final int MONEY_SCALE = 2;
    private static final BigDecimal HUNDRED = BigDecimal.valueOf(100);
    // Amount and AmountInEuros are DECIMAL(19,4); Distance is DECIMAL(37,8).
    private static final int STORED_INTEGER_DIGITS = 15;
    private static final int DISTANCE_SCALE = 8;
    private static final int DISTANCE_INTEGER_DIGITS = 29;
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
        if (!withinRange(kilometers, DISTANCE_INTEGER_DIGITS)) {
            throw new ApiException(422, ApiException.VALIDATION_FAILED, LegacyMessages.INVALID_VALUE, List.of());
        }
        return stored(kilometers.multiply(properties.mileageReimbursement()));
    }

    public BigDecimal usdToEur(BigDecimal amount, BigDecimal rate) {
        List<FieldViolation> violations = new ArrayList<>();
        collectViolation(violations, "amount", amount, STORED_INTEGER_DIGITS, LegacyMessages.USD_AMOUNT_ABOVE_ZERO);
        collectViolation(violations, "rate", rate, STORED_INTEGER_DIGITS, LegacyMessages.RATE_ABOVE_ZERO);
        if (!violations.isEmpty()) {
            throw ApiException.validation(violations);
        }
        return stored(amount.multiply(rate));
    }

    // Checks only the value the line's kind and type consume; null and non-positive values are left to the caller.
    public Optional<FieldViolation> lineAmountsViolation(ReportKind kind, Integer typeId, Integer currencyId,
            BigDecimal amount, BigDecimal kilometers) {
        if (isKilometersExpense(kind, typeId)) {
            return isPositive(kilometers) && !kilometersFit(kilometers)
                    ? Optional.of(new FieldViolation("kilometers", LegacyMessages.INVALID_VALUE))
                    : Optional.empty();
        }
        return isPositive(amount) && !amountFits(currencyId, amount)
                ? Optional.of(new FieldViolation("amount", LegacyMessages.INVALID_VALUE))
                : Optional.empty();
    }

    // Euro values derive from the amount and distance as their columns store them.
    public LineAmounts lineAmounts(ReportKind kind, Integer typeId, Integer currencyId,
            BigDecimal amount, BigDecimal kilometers) {
        BigDecimal storedAmount = roundedAmount(amount);
        BigDecimal storedKilometers = roundedDistance(kilometers);
        Optional<FieldViolation> violation =
                lineAmountsViolation(kind, typeId, currencyId, storedAmount, storedKilometers);
        if (violation.isPresent()) {
            throw ApiException.validation(List.of(violation.get()));
        }
        if (isKilometersExpense(kind, typeId)) {
            BigDecimal euros = mileage(storedKilometers);
            // The stored amount is the computed euro value, so the line's currency is always Euro.
            return new LineAmounts(ReferenceIds.CURRENCY_EURO, euros, storedKilometers, euros);
        }
        Objects.requireNonNull(storedAmount, "amount");
        if (Objects.equals(currencyId, ReferenceIds.CURRENCY_DOLLAR)) {
            BigDecimal euros = stored(storedAmount.multiply(properties.dollarsToEuros()));
            return new LineAmounts(ReferenceIds.CURRENCY_DOLLAR, stored(storedAmount), null, euros);
        }
        BigDecimal euros = stored(storedAmount);
        return new LineAmounts(currencyId, euros, null, euros);
    }

    // Both return a value too extreme to round as given, so the column range check still rejects it.
    public BigDecimal roundedAmount(BigDecimal amount) {
        return amount != null && withinRange(amount, STORED_INTEGER_DIGITS) ? stored(amount) : amount;
    }

    public BigDecimal roundedDistance(BigDecimal kilometers) {
        return kilometers != null && withinRange(kilometers, DISTANCE_INTEGER_DIGITS)
                ? kilometers.setScale(DISTANCE_SCALE, RoundingMode.HALF_UP)
                : kilometers;
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

    private boolean kilometersFit(BigDecimal kilometers) {
        return withinRange(kilometers, DISTANCE_INTEGER_DIGITS)
                && fits(kilometers.setScale(DISTANCE_SCALE, RoundingMode.HALF_UP), DISTANCE_INTEGER_DIGITS)
                && fits(stored(kilometers.multiply(properties.mileageReimbursement())), STORED_INTEGER_DIGITS);
    }

    private boolean amountFits(Integer currencyId, BigDecimal amount) {
        return withinRange(amount, STORED_INTEGER_DIGITS)
                && fits(stored(amount), STORED_INTEGER_DIGITS)
                && (!Objects.equals(currencyId, ReferenceIds.CURRENCY_DOLLAR)
                        || fits(stored(amount.multiply(properties.dollarsToEuros())), STORED_INTEGER_DIGITS));
    }

    private static boolean isKilometersExpense(ReportKind kind, Integer typeId) {
        return kind == ReportKind.EXPENSE && Objects.equals(typeId, ReferenceIds.EXPENSE_TYPE_KILOMETERS);
    }

    private static boolean isPositive(BigDecimal value) {
        return value != null && value.signum() > 0;
    }

    private static void collectViolation(List<FieldViolation> violations, String field, BigDecimal value,
            int integerDigits, String nonPositiveMessage) {
        if (value == null || value.signum() <= 0) {
            violations.add(new FieldViolation(field, nonPositiveMessage));
        } else if (!withinRange(value, integerDigits)) {
            violations.add(new FieldViolation(field, LegacyMessages.INVALID_VALUE));
        }
    }

    // Rounding an extreme exponent would materialise a number with that many digits, so such inputs are refused.
    private static boolean withinRange(BigDecimal value, int integerDigits) {
        return fits(value, integerDigits)
                && (value.scale() <= MAX_SCALE || value.stripTrailingZeros().scale() <= MAX_SCALE);
    }

    private static boolean fits(BigDecimal value, int integerDigits) {
        return (long) value.precision() - value.scale() <= integerDigits;
    }
}
