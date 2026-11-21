package com.massmutual.expensesmanager.service.model;

public record InvoiceFile(String filename, String contentType, byte[] content) {
}
