package com.massmutual.expensesmanager.service;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.LocalDate;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

@ConfigurationProperties("expenses")
public record ExpensesProperties(
        @DefaultValue("0.37") BigDecimal mileageReimbursement,
        @DefaultValue("0.93") BigDecimal dollarsToEuros,
        @DefaultValue("0.23") BigDecimal vatRate,
        @DefaultValue Dashboard dashboard,
        @DefaultValue("30") int rememberMeDays,
        @DefaultValue Seed seed) {

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
