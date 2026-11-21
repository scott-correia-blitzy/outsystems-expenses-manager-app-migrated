package com.massmutual.expensesmanager.service;

import java.time.Clock;
import java.time.LocalDateTime;
import java.util.Locale;
import java.util.Map;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.massmutual.expensesmanager.domain.InvoiceEntity;
import com.massmutual.expensesmanager.domain.LineEntity;
import com.massmutual.expensesmanager.domain.ReportEntity;
import com.massmutual.expensesmanager.domain.ReportKind;
import com.massmutual.expensesmanager.service.model.InvoiceFile;

@Service
public class InvoiceService {

    public static final int MAX_BYTES = 5 * 1024 * 1024;

    private static final int MAX_FILENAME_LENGTH = 50;
    private static final String FILE_FIELD = "file";

    private static final Map<String, String> CONTENT_TYPES_BY_EXTENSION = Map.of(
            "pdf", "application/pdf",
            "png", "image/png",
            "jpg", "image/jpeg",
            "jpeg", "image/jpeg");

    private final KindRepositories kindRepositories;
    private final ReportAccessPolicy policy;
    private final Clock clock;

    public InvoiceService(KindRepositories kindRepositories, ReportAccessPolicy policy, Clock clock) {
        this.kindRepositories = kindRepositories;
        this.policy = policy;
        this.clock = clock;
    }

    @Transactional
    public void upload(Caller caller, ReportKind kind, Long lineId, String filename, String contentType, byte[] bytes) {
        LineEntity line = policy.loadLine(kind, lineId);
        ReportEntity report = policy.reportOf(kind, line);
        policy.requireOwnerWrite(caller, report);
        policy.requireDraft(report, LegacyMessages.NOT_DRAFT);

        if (filename == null || filename.isBlank()) {
            throw ApiException.validation(FILE_FIELD, LegacyMessages.NO_FILE_SELECTED);
        }
        if (bytes == null || bytes.length == 0) {
            throw ApiException.validation(FILE_FIELD, LegacyMessages.NO_FILE_UPLOADED);
        }
        // Rejected rather than shortened, so a download always carries the uploaded name.
        if (filename.length() > MAX_FILENAME_LENGTH) {
            throw ApiException.validation(FILE_FIELD, LegacyMessages.FILE_NAME_TOO_LONG);
        }
        if (bytes.length > MAX_BYTES) {
            throw ApiException.payloadTooLarge();
        }
        String filetype = acceptedContentType(filename, contentType);

        InvoiceEntity invoice = kindRepositories.invoices(kind).findById(line.getId())
                .orElseGet(() -> kindRepositories.newInvoice(kind, line.getId()));
        invoice.setContent(bytes);
        invoice.setFilename(filename);
        invoice.setFiletype(filetype);
        invoice.setDatetime(LocalDateTime.now(clock));
        kindRepositories.invoices(kind).save(invoice);
    }

    @Transactional(readOnly = true)
    public InvoiceFile download(Caller caller, ReportKind kind, Long lineId) {
        LineEntity line = policy.loadLine(kind, lineId);
        ReportEntity report = policy.reportOf(kind, line);
        policy.requireOwnerOrAdminRead(caller, report);

        InvoiceEntity invoice = kindRepositories.invoices(kind).findById(line.getId())
                .orElseThrow(() -> ApiException.notFound(LegacyMessages.NO_INVOICE));
        return new InvoiceFile(invoice.getFilename(), invoice.getFiletype(), invoice.getContent());
    }

    // The declared type must agree with the extension, since downloads are served with the stored type.
    private static String acceptedContentType(String filename, String contentType) {
        String expected = CONTENT_TYPES_BY_EXTENSION.get(extensionOf(filename));
        if (expected == null || !expected.equals(normalise(contentType))) {
            throw ApiException.unsupportedMediaType();
        }
        return expected;
    }

    private static String extensionOf(String filename) {
        int dot = filename.lastIndexOf('.');
        return dot < 0 ? "" : filename.substring(dot + 1).toLowerCase(Locale.ROOT);
    }

    private static String normalise(String contentType) {
        if (contentType == null) {
            return null;
        }
        int parameters = contentType.indexOf(';');
        String mediaType = parameters < 0 ? contentType : contentType.substring(0, parameters);
        return mediaType.trim().toLowerCase(Locale.ROOT);
    }
}
