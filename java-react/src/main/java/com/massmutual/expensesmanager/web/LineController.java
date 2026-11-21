package com.massmutual.expensesmanager.web;

import com.massmutual.expensesmanager.domain.ReportKind;
import com.massmutual.expensesmanager.service.AppUserPrincipal;
import com.massmutual.expensesmanager.service.InvoiceService;
import com.massmutual.expensesmanager.service.LineService;
import com.massmutual.expensesmanager.service.model.InvoiceFile;
import com.massmutual.expensesmanager.service.model.LineView;
import com.massmutual.expensesmanager.web.dto.LineRequest;
import jakarta.validation.Valid;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.InvalidMediaTypeException;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api")
public class LineController {

    private final LineService lineService;
    private final InvoiceService invoiceService;

    public LineController(LineService lineService, InvoiceService invoiceService) {
        this.lineService = lineService;
        this.invoiceService = invoiceService;
    }

    @PostMapping("/reports/{kind}/{id}/lines")
    public ResponseEntity<LineView> createLine(@AuthenticationPrincipal AppUserPrincipal principal,
            @PathVariable ReportKind kind, @PathVariable Long id, @Valid @RequestBody LineRequest body) {
        LineView line = lineService.create(principal.toCaller(), kind, id, toInput(kind, body));
        return ResponseEntity.status(HttpStatus.CREATED).body(line);
    }

    @PutMapping("/lines/{kind}/{id}")
    public LineView updateLine(@AuthenticationPrincipal AppUserPrincipal principal,
            @PathVariable ReportKind kind, @PathVariable Long id, @Valid @RequestBody LineRequest body) {
        return lineService.update(principal.toCaller(), kind, id, toInput(kind, body));
    }

    @DeleteMapping("/lines/{kind}/{id}")
    public ResponseEntity<Void> deleteLine(@AuthenticationPrincipal AppUserPrincipal principal,
            @PathVariable ReportKind kind, @PathVariable Long id) {
        lineService.delete(principal.toCaller(), kind, id);
        return ResponseEntity.noContent().build();
    }

    // Optional so ownership and Draft checks in InvoiceService run before the missing-file 422.
    @PutMapping("/lines/{kind}/{id}/invoice")
    public ResponseEntity<Void> uploadInvoice(@AuthenticationPrincipal AppUserPrincipal principal,
            @PathVariable ReportKind kind, @PathVariable Long id,
            @RequestPart(name = "file", required = false) MultipartFile file) throws IOException {
        invoiceService.upload(principal.toCaller(), kind, id,
                file == null ? null : file.getOriginalFilename(),
                file == null ? null : file.getContentType(),
                file == null ? null : file.getBytes());
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/lines/{kind}/{id}/invoice")
    public ResponseEntity<byte[]> downloadInvoice(@AuthenticationPrincipal AppUserPrincipal principal,
            @PathVariable ReportKind kind, @PathVariable Long id) {
        InvoiceFile invoice = invoiceService.download(principal.toCaller(), kind, id);
        byte[] content = invoice.content() == null ? new byte[0] : invoice.content();
        return ResponseEntity.ok()
                .contentType(mediaTypeOf(invoice.contentType()))
                .contentLength(content.length)
                .header(HttpHeaders.CONTENT_DISPOSITION, attachment(invoice.filename()).toString())
                .body(content);
    }

    private static LineService.LineInput toInput(ReportKind kind, LineRequest request) {
        return new LineService.LineInput(
                kind == ReportKind.EXPENSE ? request.expenseTypeId() : request.earningTypeId(),
                request.currencyId(),
                request.amount(),
                request.kilometers(),
                request.title(),
                request.description(),
                request.date());
    }

    private static ContentDisposition attachment(String filename) {
        ContentDisposition.Builder disposition = ContentDisposition.attachment();
        if (!StringUtils.hasText(filename)) {
            return disposition.build();
        }
        // A charset RFC 2047-encodes the plain filename parameter, so ASCII names are sent without one.
        if (StandardCharsets.US_ASCII.newEncoder().canEncode(filename)) {
            return disposition.filename(filename).build();
        }
        return disposition.filename(filename, StandardCharsets.UTF_8).build();
    }

    private static MediaType mediaTypeOf(String contentType) {
        if (!StringUtils.hasText(contentType)) {
            return MediaType.APPLICATION_OCTET_STREAM;
        }
        try {
            MediaType mediaType = MediaType.parseMediaType(contentType);
            return mediaType.isConcrete() ? mediaType : MediaType.APPLICATION_OCTET_STREAM;
        } catch (InvalidMediaTypeException ex) {
            return MediaType.APPLICATION_OCTET_STREAM;
        }
    }
}
