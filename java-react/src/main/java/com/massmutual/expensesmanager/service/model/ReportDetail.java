package com.massmutual.expensesmanager.service.model;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

// submitedOn keeps the legacy SubmitedOn column spelling; submittedBy is the submitter's display name.
public record ReportDetail(
        Long id,
        String kind,
        String code,
        String title,
        String status,
        LocalDateTime createdOn,
        String createdByName,
        LocalDateTime submitedOn,
        LocalDateTime processedOn,
        String submittedBy,
        BigDecimal totalEur,
        BigDecimal vatTotal,
        List<LineView> lines) {

    public ReportDetail {
        lines = lines == null ? List.of() : List.copyOf(lines);
    }
}
