package com.massmutual.expensesmanager.service;

import com.massmutual.expensesmanager.domain.LineEntity;
import com.massmutual.expensesmanager.domain.ReferenceIds;
import com.massmutual.expensesmanager.domain.ReportEntity;
import com.massmutual.expensesmanager.domain.ReportKind;
import com.massmutual.expensesmanager.domain.Role;
import java.util.Objects;
import org.springframework.stereotype.Component;

@Component
public class ReportAccessPolicy {

    private final KindRepositories kindRepositories;

    public ReportAccessPolicy(KindRepositories kindRepositories) {
        this.kindRepositories = kindRepositories;
    }

    public ReportEntity loadReport(ReportKind kind, Long id) {
        if (kind == null || id == null) {
            throw ApiException.notFound();
        }
        return kindRepositories.reports(kind).findById(id).orElseThrow(ApiException::notFound);
    }

    public LineEntity loadLine(ReportKind kind, Long lineId) {
        if (kind == null || lineId == null) {
            throw ApiException.notFound();
        }
        return kindRepositories.lines(kind).findById(lineId).orElseThrow(ApiException::notFound);
    }

    public ReportEntity reportOf(ReportKind kind, LineEntity line) {
        Objects.requireNonNull(line, "line");
        return loadReport(kind, line.getReportId());
    }

    public ReportEntity loadReportForWrite(ReportKind kind, Long id) {
        if (kind == null || id == null) {
            throw ApiException.notFound();
        }
        return kindRepositories.reports(kind).findByIdForUpdate(id).orElseThrow(ApiException::notFound);
    }

    // The line is read only once its report is locked, so a line deleted while waiting is not found.
    public LockedLine loadLineForWrite(ReportKind kind, Long lineId) {
        if (kind == null || lineId == null) {
            throw ApiException.notFound();
        }
        Long reportId = kindRepositories.lines(kind).findReportIdById(lineId).orElseThrow(ApiException::notFound);
        ReportEntity report = loadReportForWrite(kind, reportId);
        LineEntity line = kindRepositories.lines(kind).findById(lineId).orElseThrow(ApiException::notFound);
        return new LockedLine(line, report);
    }

    public record LockedLine(LineEntity line, ReportEntity report) {
    }

    // Holding Administrator as well grants no write access to another user's report.
    public void requireOwnerWrite(Caller caller, ReportEntity report) {
        if (!isOwningUser(caller, report)) {
            throw ApiException.forbidden();
        }
    }

    public void requireOwnerOrAdminRead(Caller caller, ReportEntity report) {
        if (!isOwningUser(caller, report) && !caller.has(Role.Administrator)) {
            throw ApiException.forbidden();
        }
    }

    public void requireAdministrator(Caller caller) {
        if (!caller.has(Role.Administrator)) {
            throw ApiException.forbidden(LegacyMessages.NO_PERMISSIONS);
        }
    }

    public void requireAnyRole(Caller caller, Role... roles) {
        if (!caller.hasAny(roles)) {
            throw ApiException.forbidden();
        }
    }

    public void requireDraft(ReportEntity report, String message) {
        if (!Objects.equals(report.getStatusId(), ReferenceIds.STATUS_DRAFT)) {
            throw ApiException.notDraft(message);
        }
    }

    private static boolean isOwningUser(Caller caller, ReportEntity report) {
        return caller.has(Role.User) && Objects.equals(report.getCreatedBy(), caller.id());
    }
}
