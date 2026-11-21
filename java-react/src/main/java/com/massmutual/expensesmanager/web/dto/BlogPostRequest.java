package com.massmutual.expensesmanager.web.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.massmutual.expensesmanager.service.LegacyMessages;
import com.massmutual.expensesmanager.service.model.Redacted;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

@JsonIgnoreProperties(ignoreUnknown = true)
public record BlogPostRequest(
        @NotBlank(message = LegacyMessages.FIELD_REQUIRED)
        @CreateReportRequest.SizeUnlessBlank(max = 50, message = LegacyMessages.MAX_LENGTH_50) String title,
        @Size(max = 10000, message = LegacyMessages.MAX_LENGTH_10000) String description) {

    @Override
    public String toString() {
        return "BlogPostRequest[title=" + Redacted.length(title)
                + ", description=" + Redacted.length(description) + "]";
    }
}
