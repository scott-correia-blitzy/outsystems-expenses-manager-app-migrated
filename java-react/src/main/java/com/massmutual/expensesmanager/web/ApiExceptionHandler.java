package com.massmutual.expensesmanager.web;

import com.fasterxml.jackson.databind.JsonMappingException;
import com.fasterxml.jackson.databind.exc.MismatchedInputException;
import com.massmutual.expensesmanager.service.ApiException;
import com.massmutual.expensesmanager.service.LegacyMessages;
import com.massmutual.expensesmanager.service.model.FieldViolation;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.ConstraintViolation;
import jakarta.validation.ConstraintViolationException;
import jakarta.validation.Path;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.MessageSourceResolvable;
import org.springframework.core.MethodParameter;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.util.StringUtils;
import org.springframework.validation.BindingResult;
import org.springframework.validation.FieldError;
import org.springframework.web.HttpMediaTypeNotAcceptableException;
import org.springframework.web.HttpMediaTypeNotSupportedException;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.HandlerMethodValidationException;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.multipart.support.MissingServletRequestPartException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

import java.util.ArrayList;
import java.util.Collections;
import java.util.IdentityHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

@RestControllerAdvice
public class ApiExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(ApiExceptionHandler.class);

    static final String INTERNAL_ERROR = "INTERNAL_ERROR";

    @ExceptionHandler(ApiException.class)
    public ResponseEntity<ErrorResponse> handleApiException(ApiException ex) {
        return respond(ErrorResponse.from(ex));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ErrorResponse> handleInvalidBody(MethodArgumentNotValidException ex) {
        return validationFailed(violations(ex.getBindingResult()));
    }

    static List<FieldViolation> violations(BindingResult result) {
        return result.getAllErrors().stream()
                .map(error -> violation(error, error.getObjectName()))
                .toList();
    }

    @ExceptionHandler(HandlerMethodValidationException.class)
    public ResponseEntity<ErrorResponse> handleInvalidParameters(HandlerMethodValidationException ex) {
        List<FieldViolation> violations = new ArrayList<>();
        ex.getParameterValidationResults().forEach(result -> {
            String parameterName = parameterName(result.getMethodParameter());
            result.getResolvableErrors().forEach(error -> violations.add(violation(error, parameterName)));
        });
        ex.getCrossParameterValidationResults()
                .forEach(error -> violations.add(violation(error, ex.getMethod().getName())));
        return validationFailed(violations);
    }

    @ExceptionHandler(ConstraintViolationException.class)
    public ResponseEntity<ErrorResponse> handleConstraintViolation(ConstraintViolationException ex) {
        Set<ConstraintViolation<?>> constraintViolations =
                ex.getConstraintViolations() == null ? Set.of() : ex.getConstraintViolations();
        return validationFailed(constraintViolations.stream()
                .map(cv -> new FieldViolation(leafName(cv.getPropertyPath()), messageOr(cv.getMessage())))
                .toList());
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<ErrorResponse> handleUnreadableBody(HttpMessageNotReadableException ex) {
        List<FieldViolation> violations = findCause(ex, MismatchedInputException.class)
                .map(ApiExceptionHandler::jsonPath)
                .filter(path -> !path.isEmpty())
                .map(path -> List.of(new FieldViolation(path, LegacyMessages.INVALID_VALUE)))
                .orElse(List.of());
        return respond(ErrorResponse.validation(LegacyMessages.INVALID_VALUE, violations));
    }

    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    public ResponseEntity<ErrorResponse> handleTypeMismatch(MethodArgumentTypeMismatchException ex) {
        // A converter's own 422 arrives wrapped in a ConversionFailedException.
        return findCause(ex, ApiException.class)
                .map(apiException -> respond(ErrorResponse.from(apiException)))
                .orElseGet(() -> validationFailed(
                        List.of(new FieldViolation(ex.getName(), LegacyMessages.INVALID_VALUE))));
    }

    @ExceptionHandler(MissingServletRequestParameterException.class)
    public ResponseEntity<ErrorResponse> handleMissingParameter(MissingServletRequestParameterException ex) {
        return validationFailed(List.of(new FieldViolation(ex.getParameterName(), LegacyMessages.FIELD_REQUIRED)));
    }

    @ExceptionHandler(MissingServletRequestPartException.class)
    public ResponseEntity<ErrorResponse> handleMissingPart(MissingServletRequestPartException ex) {
        return validationFailed(List.of(new FieldViolation(ex.getRequestPartName(), LegacyMessages.NO_FILE_SELECTED)));
    }

    @ExceptionHandler(MaxUploadSizeExceededException.class)
    public ResponseEntity<ErrorResponse> handleUploadTooLarge() {
        return respond(ErrorResponse.of(HttpStatus.PAYLOAD_TOO_LARGE.value(),
                ApiException.PAYLOAD_TOO_LARGE, LegacyMessages.FILE_TOO_LARGE));
    }

    @ExceptionHandler(HttpMediaTypeNotSupportedException.class)
    public ResponseEntity<ErrorResponse> handleUnsupportedMediaType() {
        return respond(ErrorResponse.of(HttpStatus.UNSUPPORTED_MEDIA_TYPE.value(),
                ApiException.UNSUPPORTED_MEDIA_TYPE, LegacyMessages.INVALID_VALUE));
    }

    // A method and path pair outside the contract is as unmapped as an unknown path, so both answer 404.
    @ExceptionHandler({NoResourceFoundException.class, HttpRequestMethodNotSupportedException.class})
    public ResponseEntity<ErrorResponse> handleNotFound() {
        return respond(ErrorResponse.of(HttpStatus.NOT_FOUND.value(),
                ApiException.NOT_FOUND, LegacyMessages.NOT_FOUND));
    }

    @ExceptionHandler(AccessDeniedException.class)
    public ResponseEntity<ErrorResponse> handleAccessDenied() {
        return respond(ErrorResponse.of(HttpStatus.FORBIDDEN.value(),
                ApiException.FORBIDDEN, LegacyMessages.NO_PERMISSIONS));
    }

    // The error contract has no 406 code, so the generic body stays; a client's Accept header is not a server fault.
    @ExceptionHandler(HttpMediaTypeNotAcceptableException.class)
    public ResponseEntity<ErrorResponse> handleNotAcceptable(HttpMediaTypeNotAcceptableException ex,
            HttpServletRequest request) {
        log.warn("No acceptable representation on {} {}: {}",
                request.getMethod(), request.getRequestURI(), ex.getClass().getName());
        return internalError();
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ErrorResponse> handleUnexpected(Exception ex, HttpServletRequest request) {
        log.error("Unhandled error on {} {}", request.getMethod(), request.getRequestURI(), RedactedThrowable.of(ex));
        return internalError();
    }

    private static ResponseEntity<ErrorResponse> internalError() {
        return respond(ErrorResponse.of(HttpStatus.INTERNAL_SERVER_ERROR.value(),
                INTERNAL_ERROR, LegacyMessages.INTERNAL_ERROR));
    }

    private static ResponseEntity<ErrorResponse> validationFailed(List<FieldViolation> violations) {
        String message = violations.isEmpty() ? LegacyMessages.INVALID_VALUE : violations.getFirst().message();
        return respond(ErrorResponse.validation(message, violations));
    }

    private static ResponseEntity<ErrorResponse> respond(ErrorResponse body) {
        return ResponseEntity.status(body.status()).contentType(MediaType.APPLICATION_JSON).body(body);
    }

    private static FieldViolation violation(MessageSourceResolvable error, String defaultField) {
        String field = error instanceof FieldError fieldError ? fieldError.getField() : defaultField;
        return new FieldViolation(field, messageOr(error.getDefaultMessage()));
    }

    private static String messageOr(String message) {
        return StringUtils.hasText(message) ? message : LegacyMessages.INVALID_VALUE;
    }

    private static String parameterName(MethodParameter parameter) {
        RequestParam requestParam = parameter.getParameterAnnotation(RequestParam.class);
        if (requestParam != null && StringUtils.hasText(requestParam.name())) {
            return requestParam.name();
        }
        PathVariable pathVariable = parameter.getParameterAnnotation(PathVariable.class);
        if (pathVariable != null && StringUtils.hasText(pathVariable.name())) {
            return pathVariable.name();
        }
        return parameter.getParameterName();
    }

    private static String leafName(Path path) {
        String name = null;
        for (Path.Node node : path) {
            if (node.getName() != null) {
                name = node.getName();
            }
        }
        return name != null ? name : path.toString();
    }

    private static String jsonPath(MismatchedInputException ex) {
        return ex.getPath().stream()
                .map(JsonMappingException.Reference::getFieldName)
                .filter(Objects::nonNull)
                .collect(Collectors.joining("."));
    }

    private static <T extends Throwable> Optional<T> findCause(Throwable ex, Class<T> type) {
        Set<Throwable> seen = Collections.newSetFromMap(new IdentityHashMap<>());
        for (Throwable current = ex; current != null && seen.add(current); current = current.getCause()) {
            if (type.isInstance(current)) {
                return Optional.of(type.cast(current));
            }
        }
        return Optional.empty();
    }

    // Exception messages can echo request headers or input, so logs keep only class names and stack frames.
    private static final class RedactedThrowable extends Throwable {

        private static final long serialVersionUID = 1L;

        private RedactedThrowable(Throwable original) {
            super(original.getClass().getName());
            setStackTrace(original.getStackTrace());
        }

        static Throwable of(Throwable original) {
            return redact(original, new IdentityHashMap<>());
        }

        private static Throwable redact(Throwable original, Map<Throwable, Throwable> redacted) {
            Throwable known = redacted.get(original);
            if (known != null) {
                return known;
            }
            RedactedThrowable copy = new RedactedThrowable(original);
            redacted.put(original, copy);
            Throwable cause = original.getCause();
            if (cause != null) {
                Throwable redactedCause = redact(cause, redacted);
                if (redactedCause != copy) {
                    copy.initCause(redactedCause);
                }
            }
            for (Throwable suppressed : original.getSuppressed()) {
                copy.addSuppressed(redact(suppressed, redacted));
            }
            return copy;
        }

        @Override
        public String toString() {
            return getMessage();
        }
    }
}
