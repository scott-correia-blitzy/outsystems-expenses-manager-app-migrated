package com.massmutual.expensesmanager.repository;

import com.massmutual.expensesmanager.domain.AppUser;
import java.time.LocalDateTime;

public record ReportListRow(
        Long id,
        String code,
        String title,
        Integer statusId,
        LocalDateTime createdOn,
        LocalDateTime submitedOn,
        String submittedByName) {

    public ReportListRow(Long id, String code, String title, Integer statusId, LocalDateTime createdOn,
            LocalDateTime submitedOn, String submitterUsername, String submitterName) {
        this(id, code, title, statusId, createdOn, submitedOn, AppUser.displayName(submitterUsername, submitterName));
    }
}
