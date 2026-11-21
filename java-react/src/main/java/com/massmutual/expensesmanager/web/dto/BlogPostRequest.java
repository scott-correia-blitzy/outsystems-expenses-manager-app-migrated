package com.massmutual.expensesmanager.web.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.massmutual.expensesmanager.service.LegacyMessages;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

@JsonIgnoreProperties(ignoreUnknown = true)
public record BlogPostRequest(
        @NotBlank(message = LegacyMessages.FIELD_REQUIRED)
        @SizeUnlessBlank(max = 50, message = LegacyMessages.MAX_LENGTH_50) String title,
        @Size(max = 10000, message = LegacyMessages.MAX_LENGTH_10000) String description) {
}
