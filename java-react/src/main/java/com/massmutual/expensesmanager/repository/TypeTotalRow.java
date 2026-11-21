package com.massmutual.expensesmanager.repository;

import java.math.BigDecimal;

public record TypeTotalRow(Integer typeId, String label, Long count, BigDecimal sum) {}
