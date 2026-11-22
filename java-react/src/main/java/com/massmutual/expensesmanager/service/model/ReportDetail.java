package com.massmutual.expensesmanager.service.model;

import com.massmutual.expensesmanager.service.model.FieldViolation.Redacted;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

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

    @Override
    public String toString() {
        return "ReportDetail[id=" + id
                + ", kind=" + kind
                + ", code=" + code
                + ", title=" + Redacted.length(title)
                + ", status=" + status
                + ", createdOn=" + createdOn
                + ", createdByName=" + Redacted.length(createdByName)
                + ", submitedOn=" + submitedOn
                + ", processedOn=" + processedOn
                + ", submittedBy=" + Redacted.length(submittedBy)
                + ", totalEur=" + Redacted.mask(totalEur)
                + ", vatTotal=" + Redacted.mask(vatTotal)
                + ", lines=" + lines + "]";
    }
}
