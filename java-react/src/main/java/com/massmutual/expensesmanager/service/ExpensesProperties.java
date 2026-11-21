package com.massmutual.expensesmanager.service;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.LocalDate;

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
        // Every rate that binds is one the euro calculations accept, so an unusable value fails at startup.
        @DefaultValue("0.37") @Positive @Digits(integer = RATE_INTEGER_DIGITS, fraction = 8)
        BigDecimal mileageReimbursement,
        @DefaultValue("0.93") @Positive @Digits(integer = RATE_INTEGER_DIGITS, fraction = 8)
        BigDecimal dollarsToEuros,
        @DefaultValue("0.23") @PositiveOrZero @Digits(integer = 29, fraction = 8) BigDecimal vatRate,
        @DefaultValue Dashboard dashboard,
        // The session max-inactive interval and cookie Max-Age are int seconds.
        @DefaultValue("30") @Positive @Max(Integer.MAX_VALUE / (24 * 60 * 60)) int rememberMeDays,
        @DefaultValue Seed seed) {

    public static final int RATE_INTEGER_DIGITS = 15;

    public LocalDate referenceDate(Clock clock) {
        LocalDate pinned = dashboard.referenceDate();
        return pinned != null ? pinned : LocalDate.now(clock);
    }

    // A blank reference-date binds to null, so the dashboard follows the Clock.
    public record Dashboard(LocalDate referenceDate) {
    }

    public record Seed(@DefaultValue("true") boolean enabled) {
    }
}
