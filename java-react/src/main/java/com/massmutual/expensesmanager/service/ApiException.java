package com.massmutual.expensesmanager.service;

import com.massmutual.expensesmanager.service.model.FieldViolation;

import java.util.List;
import java.util.Objects;

public final class ApiException extends RuntimeException {

    private static final long serialVersionUID = 1L;

    public static final String UNAUTHENTICATED = "UNAUTHENTICATED";
    public static final String BAD_CREDENTIALS = "BAD_CREDENTIALS";
    public static final String FORBIDDEN = "FORBIDDEN";
    public static final String NOT_FOUND = "NOT_FOUND";
    public static final String NOT_DRAFT = "NOT_DRAFT";
    public static final String CODE_CONFLICT = "CODE_CONFLICT";
    public static final String PAYLOAD_TOO_LARGE = "PAYLOAD_TOO_LARGE";
    public static final String UNSUPPORTED_MEDIA_TYPE = "UNSUPPORTED_MEDIA_TYPE";
    public static final String VALIDATION_FAILED = "VALIDATION_FAILED";
    public static final String NO_LINES = "NO_LINES";
    public static final String SERVICE_UNAVAILABLE = "SERVICE_UNAVAILABLE";

    private final int status;
    private final String code;
    private final List<FieldViolation> fieldErrors;

    public ApiException(int status, String code, String message, List<FieldViolation> fieldErrors) {
        super(Objects.requireNonNull(message, "message"));
        this.status = status;
        this.code = Objects.requireNonNull(code, "code");
        this.fieldErrors = fieldErrors == null ? List.of() : List.copyOf(fieldErrors);
    }

    // Without a cause the cause stays unset, so callers can still attach one with initCause.
    public ApiException(int status, String code, String message, List<FieldViolation> fieldErrors, Throwable cause) {
        this(status, code, message, fieldErrors);
        if (cause != null) {
            initCause(cause);
        }
    }

    public int status() {
        return status;
    }

    public String code() {
        return code;
    }

    public List<FieldViolation> fieldErrors() {
        return fieldErrors;
    }

    public static ApiException notFound() {
        return notFound(LegacyMessages.NOT_FOUND);
    }

    public static ApiException notFound(String message) {
        return new ApiException(404, NOT_FOUND, message, List.of());
    }

    public static ApiException forbidden() {
        return forbidden(LegacyMessages.FORBIDDEN);
    }

    public static ApiException forbidden(String message) {
        return new ApiException(403, FORBIDDEN, message, List.of());
    }

    public static ApiException notDraft(String message) {
        return new ApiException(409, NOT_DRAFT, message, List.of());
    }

    public static ApiException validation(String field, String message) {
        return validation(field, message, null);
    }

    public static ApiException validation(String field, String message, Throwable cause) {
        return validation(List.of(new FieldViolation(field, message)), cause);
    }

    public static ApiException validation(List<FieldViolation> violations) {
        return validation(violations, null);
    }

    private static ApiException validation(List<FieldViolation> violations, Throwable cause) {
        if (violations == null || violations.isEmpty()) {
            throw new IllegalArgumentException("At least one field violation is required");
        }
        return new ApiException(422, VALIDATION_FAILED, violations.getFirst().message(), violations, cause);
    }

    public static ApiException noLines() {
        return new ApiException(422, NO_LINES, LegacyMessages.NO_LINES, List.of());
    }

    public static ApiException codeConflict() {
        return new ApiException(409, CODE_CONFLICT, LegacyMessages.GENERIC_ERROR, List.of());
    }

    public static ApiException unsupportedMediaType() {
        return new ApiException(415, UNSUPPORTED_MEDIA_TYPE, LegacyMessages.FILE_TYPE_NOT_SUPPORTED, List.of());
    }

    public static ApiException payloadTooLarge() {
        return new ApiException(413, PAYLOAD_TOO_LARGE, LegacyMessages.FILE_TOO_LARGE, List.of());
    }

    public static ApiException badCredentials(Throwable cause) {
        return new ApiException(401, BAD_CREDENTIALS, LegacyMessages.BAD_CREDENTIALS, List.of(), cause);
    }
}
