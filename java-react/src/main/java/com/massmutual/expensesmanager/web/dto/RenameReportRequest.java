package com.massmutual.expensesmanager.web.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.massmutual.expensesmanager.service.LegacyMessages;
import com.massmutual.expensesmanager.service.model.Redacted;
import jakarta.validation.constraints.NotBlank;

@JsonIgnoreProperties(ignoreUnknown = true)
public record RenameReportRequest(
        @NotBlank(message = LegacyMessages.INSERT_TITLE)
        @CreateReportRequest.SizeUnlessBlank(max = 50, message = LegacyMessages.MAX_LENGTH_50) String title) {

    @Override
    public String toString() {
        return "RenameReportRequest[title=" + Redacted.length(title) + "]";
    }
}
