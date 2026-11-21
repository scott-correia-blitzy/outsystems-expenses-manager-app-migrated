package com.massmutual.expensesmanager.service.model;

import java.time.LocalDateTime;

public record InvoiceInfo(String filename, String contentType, LocalDateTime uploadedOn) {}
