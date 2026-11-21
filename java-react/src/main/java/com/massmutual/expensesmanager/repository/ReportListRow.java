package com.massmutual.expensesmanager.repository;

import java.time.LocalDateTime;

public record ReportListRow(
        Long id,
        String code,
        String title,
        Integer statusId,
        LocalDateTime createdOn,
        LocalDateTime submitedOn,
        String submittedByName) {
}
