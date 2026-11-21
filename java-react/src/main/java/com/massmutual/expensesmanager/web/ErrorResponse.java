package com.massmutual.expensesmanager.web;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.massmutual.expensesmanager.service.ApiException;
import com.massmutual.expensesmanager.service.model.FieldViolation;

import java.util.List;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record ErrorResponse(int status, String code, String message, List<FieldViolation> fieldErrors) {

    private static final int UNPROCESSABLE_ENTITY = 422;

    public static ErrorResponse of(int status, String code, String message) {
        return new ErrorResponse(status, code, message, null);
    }

    public static ErrorResponse validation(String message, List<FieldViolation> fieldErrors) {
        return new ErrorResponse(UNPROCESSABLE_ENTITY, ApiException.VALIDATION_FAILED, message, orEmpty(fieldErrors));
    }

    public static ErrorResponse from(ApiException ex) {
        List<FieldViolation> fieldErrors = ex.status() == UNPROCESSABLE_ENTITY ? orEmpty(ex.fieldErrors()) : null;
        return new ErrorResponse(ex.status(), ex.code(), ex.getMessage(), fieldErrors);
    }

    private static List<FieldViolation> orEmpty(List<FieldViolation> fieldErrors) {
        return fieldErrors == null ? List.of() : List.copyOf(fieldErrors);
    }
}
