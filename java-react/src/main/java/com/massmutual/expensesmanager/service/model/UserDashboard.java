package com.massmutual.expensesmanager.service.model;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import java.math.BigDecimal;
import java.util.List;

public record UserDashboard(
        BigDecimal balance,
        BigDecimal currentMonthSpent,
        BigDecimal lastMonthSpent,
        BigDecimal monthChangePercent,
        BigDecimal currentMonthEarnings,
        Period currentMonth,
        Period lastMonth,
        List<TypeShare> expenseTypeShares,
        @JsonIgnoreProperties("sharePercent") List<TypeShare> earningTypeShares,
        List<DatedAmount> perDate,
        StatusCounts statusCounts,
        boolean draftBanner) {

    public UserDashboard {
        expenseTypeShares = expenseTypeShares == null ? List.of() : List.copyOf(expenseTypeShares);
        earningTypeShares = earningTypeShares == null ? List.of() : List.copyOf(earningTypeShares);
        perDate = perDate == null ? List.of() : List.copyOf(perDate);
    }
}
