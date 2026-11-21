package com.massmutual.expensesmanager.web.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.massmutual.expensesmanager.service.LegacyMessages;
import jakarta.validation.constraints.NotBlank;

// kind is a String so an unknown value fails with "Select a report type" rather than a JSON parse error.
@JsonIgnoreProperties(ignoreUnknown = true)
public record CreateReportRequest(
        @NotBlank(message = LegacyMessages.SELECT_REPORT_TYPE) String kind,
        @NotBlank(message = LegacyMessages.INSERT_TITLE)
        @SizeUnlessBlank(max = 50, message = LegacyMessages.MAX_LENGTH_50) String title) {
}
