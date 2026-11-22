package com.massmutual.expensesmanager.service.model;

import java.math.BigDecimal;

public record AdminDashboard(long totalReports, long waiting, BigDecimal approvedRate) {}
