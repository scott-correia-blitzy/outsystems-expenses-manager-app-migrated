package com.massmutual.expensesmanager.service.model;

import java.math.BigDecimal;
import java.time.LocalDateTime;

// submitedOn keeps the legacy SubmitedOn column spelling; submittedBy is the submitter's display name.
public record ReportSummary(
        Long id,
        String code,
        String title,
        String status,
        LocalDateTime createdOn,
        LocalDateTime submitedOn,
        BigDecimal totalEur,
        String submittedBy) {
}
