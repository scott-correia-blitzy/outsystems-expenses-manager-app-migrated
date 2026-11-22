package com.massmutual.expensesmanager.service.model;

import java.math.BigDecimal;

public record TypeShare(Integer typeId, String label, long count, BigDecimal sum, BigDecimal sharePercent) {}
