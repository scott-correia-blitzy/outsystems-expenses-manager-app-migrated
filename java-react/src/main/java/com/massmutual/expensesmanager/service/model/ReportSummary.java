package com.massmutual.expensesmanager.service.model;

import com.massmutual.expensesmanager.service.model.FieldViolation.Redacted;

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

    @Override
    public String toString() {
        return "ReportSummary[id=" + id
                + ", code=" + code
                + ", title=" + Redacted.length(title)
                + ", status=" + status
                + ", createdOn=" + createdOn
                + ", submitedOn=" + submitedOn
                + ", totalEur=" + Redacted.mask(totalEur)
                + ", submittedBy=" + Redacted.length(submittedBy) + "]";
    }
}
