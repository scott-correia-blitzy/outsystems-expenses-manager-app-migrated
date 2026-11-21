package com.massmutual.expensesmanager.service;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;
import java.math.BigDecimal;
import java.time.Clock;
import java.time.LocalDate;

import jakarta.validation.Constraint;
import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;
import jakarta.validation.Payload;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.PositiveOrZero;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;
import org.springframework.validation.annotation.Validated;

@Validated
@ConfigurationProperties("expenses")
public record ExpensesProperties(
        // Rates below 1000 keep the euro value of any amount or distance under 10^12 within DECIMAL(19,4).
        @DefaultValue("0.37") @Positive @Digits(integer = RATE_INTEGER_DIGITS, fraction = 8)
        BigDecimal mileageReimbursement,
        @DefaultValue("0.93") @Positive @Digits(integer = RATE_INTEGER_DIGITS, fraction = 8)
        BigDecimal dollarsToEuros,
        @DefaultValue("0.23") @PositiveOrZero @Digits(integer = 29, fraction = 8) BigDecimal vatRate,
        @DefaultValue @Valid Dashboard dashboard,
        // The session max-inactive interval and cookie Max-Age are int seconds.
        @DefaultValue("30") @Positive @Max(Integer.MAX_VALUE / (24 * 60 * 60)) int rememberMeDays,
        @DefaultValue Seed seed) {

    private static final int RATE_INTEGER_DIGITS = 3;

    public LocalDate referenceDate(Clock clock) {
        LocalDate pinned = dashboard.referenceDate();
        return pinned != null ? pinned : LocalDate.now(clock);
    }

    // A blank reference-date binds to null, so the dashboard follows the Clock.
    public record Dashboard(@ReferenceDateWithinLimits LocalDate referenceDate) {
    }

    public record Seed(@DefaultValue("true") boolean enabled) {
    }

    // Years 1 to 9999 keep every date the dashboard derives from the reference date valid and in yyyy-MM-dd form.
    @Documented
    @Retention(RetentionPolicy.RUNTIME)
    @Target({ElementType.FIELD, ElementType.METHOD, ElementType.PARAMETER})
    @Constraint(validatedBy = ReferenceDateWithinLimits.Validator.class)
    public @interface ReferenceDateWithinLimits {

        String message() default "expenses.dashboard.reference-date must be between 0001-01-01 and 9999-12-31";

        Class<?>[] groups() default {};

        Class<? extends Payload>[] payload() default {};

        final class Validator implements ConstraintValidator<ReferenceDateWithinLimits, LocalDate> {

            private static final int FIRST_YEAR = 1;
            private static final int LAST_YEAR = 9999;

            @Override
            public boolean isValid(LocalDate date, ConstraintValidatorContext context) {
                return date == null || (date.getYear() >= FIRST_YEAR && date.getYear() <= LAST_YEAR);
            }
        }
    }
}
