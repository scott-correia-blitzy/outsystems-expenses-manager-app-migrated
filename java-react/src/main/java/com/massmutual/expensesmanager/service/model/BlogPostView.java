package com.massmutual.expensesmanager.service.model;

import java.time.LocalDateTime;

public record BlogPostView(
        Long id,
        String title,
        String description,
        LocalDateTime createdOn,
        String createdByName,
        LocalDateTime updatedOn,
        String updatedByName) {
}
