package com.massmutual.expensesmanager.web;

import com.massmutual.expensesmanager.domain.ReportKind;
import com.massmutual.expensesmanager.service.ApiException;
import com.massmutual.expensesmanager.service.AppUserPrincipal;
import com.massmutual.expensesmanager.service.LegacyMessages;
import com.massmutual.expensesmanager.service.ReportService;
import com.massmutual.expensesmanager.service.model.ReportDetail;
import com.massmutual.expensesmanager.service.model.ReportSummary;
import com.massmutual.expensesmanager.web.dto.CreateReportRequest;
import com.massmutual.expensesmanager.web.dto.DecisionRequest;
import com.massmutual.expensesmanager.web.dto.RenameReportRequest;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/reports")
public class ReportController {

    private final ReportService reportService;

    public ReportController(ReportService reportService) {
        this.reportService = reportService;
    }

    // Filters stay raw strings: ReportService owns their parsing, defaults and 422 messages.
    @GetMapping
    public List<ReportSummary> list(@AuthenticationPrincipal AppUserPrincipal principal,
            @RequestParam ReportKind kind,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String q,
            @RequestParam(required = false) String sort,
            @RequestParam(required = false) String from,
            @RequestParam(required = false) String to) {
        return reportService.list(principal.toCaller(), kind, status, q, sort, from, to);
    }

    @PostMapping
    public ResponseEntity<ReportSummary> create(@AuthenticationPrincipal AppUserPrincipal principal,
            @Valid @RequestBody CreateReportRequest body) {
        ReportKind kind = ReportKind.fromPath(body.kind().trim())
                .orElseThrow(() -> ApiException.validation("kind", LegacyMessages.SELECT_REPORT_TYPE));
        ReportSummary created = reportService.create(principal.toCaller(), kind, body.title());
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }

    @GetMapping("/{kind}/{id}")
    public ReportDetail detail(@AuthenticationPrincipal AppUserPrincipal principal,
            @PathVariable ReportKind kind, @PathVariable Long id) {
        return reportService.detail(principal.toCaller(), kind, id);
    }

    @PutMapping("/{kind}/{id}")
    public ReportSummary rename(@AuthenticationPrincipal AppUserPrincipal principal,
            @PathVariable ReportKind kind, @PathVariable Long id, @Valid @RequestBody RenameReportRequest body) {
        return reportService.rename(principal.toCaller(), kind, id, body.title());
    }

    @DeleteMapping("/{kind}/{id}")
    public ResponseEntity<Void> delete(@AuthenticationPrincipal AppUserPrincipal principal,
            @PathVariable ReportKind kind, @PathVariable Long id) {
        reportService.delete(principal.toCaller(), kind, id);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/{kind}/{id}/submit")
    public ReportSummary submit(@AuthenticationPrincipal AppUserPrincipal principal,
            @PathVariable ReportKind kind, @PathVariable Long id) {
        return reportService.submit(principal.toCaller(), kind, id);
    }

    @PostMapping("/{kind}/{id}/decision")
    public ReportSummary decide(@AuthenticationPrincipal AppUserPrincipal principal,
            @PathVariable ReportKind kind, @PathVariable Long id, @Valid @RequestBody DecisionRequest body) {
        return reportService.decide(principal.toCaller(), kind, id, body.accept());
    }
}
