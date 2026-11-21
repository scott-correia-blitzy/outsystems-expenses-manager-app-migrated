package com.massmutual.expensesmanager.service;

import com.massmutual.expensesmanager.domain.Earning;
import com.massmutual.expensesmanager.domain.EarningReport;
import com.massmutual.expensesmanager.domain.Expense;
import com.massmutual.expensesmanager.domain.ExpenseReport;
import com.massmutual.expensesmanager.domain.InvoiceEarning;
import com.massmutual.expensesmanager.domain.InvoiceEntity;
import com.massmutual.expensesmanager.domain.InvoiceExpense;
import com.massmutual.expensesmanager.domain.LineEntity;
import com.massmutual.expensesmanager.domain.ReportEntity;
import com.massmutual.expensesmanager.domain.ReportKind;
import com.massmutual.expensesmanager.repository.EarningReportRepository;
import com.massmutual.expensesmanager.repository.EarningRepository;
import com.massmutual.expensesmanager.repository.ExpenseReportRepository;
import com.massmutual.expensesmanager.repository.ExpenseRepository;
import com.massmutual.expensesmanager.repository.InvoiceEarningRepository;
import com.massmutual.expensesmanager.repository.InvoiceExpenseRepository;
import com.massmutual.expensesmanager.repository.InvoiceRepository;
import com.massmutual.expensesmanager.repository.LineRepository;
import com.massmutual.expensesmanager.repository.ReportRepository;
import org.springframework.stereotype.Component;

@Component
public class KindRepositories {

    private final ExpenseReportRepository expenseReports;
    private final EarningReportRepository earningReports;
    private final ExpenseRepository expenses;
    private final EarningRepository earnings;
    private final InvoiceExpenseRepository expenseInvoices;
    private final InvoiceEarningRepository earningInvoices;

    public KindRepositories(
            ExpenseReportRepository expenseReports,
            EarningReportRepository earningReports,
            ExpenseRepository expenses,
            EarningRepository earnings,
            InvoiceExpenseRepository expenseInvoices,
            InvoiceEarningRepository earningInvoices) {
        this.expenseReports = expenseReports;
        this.earningReports = earningReports;
        this.expenses = expenses;
        this.earnings = earnings;
        this.expenseInvoices = expenseInvoices;
        this.earningInvoices = earningInvoices;
    }

    public ReportRepository<ReportEntity> reports(ReportKind kind) {
        return switch (kind) {
            case EXPENSE -> asReports(expenseReports);
            case EARNING -> asReports(earningReports);
        };
    }

    public LineRepository<LineEntity> lines(ReportKind kind) {
        return switch (kind) {
            case EXPENSE -> asLines(expenses);
            case EARNING -> asLines(earnings);
        };
    }

    public InvoiceRepository<InvoiceEntity> invoices(ReportKind kind) {
        return switch (kind) {
            case EXPENSE -> asInvoices(expenseInvoices);
            case EARNING -> asInvoices(earningInvoices);
        };
    }

    public ReportEntity newReport(ReportKind kind) {
        return switch (kind) {
            case EXPENSE -> new ExpenseReport();
            case EARNING -> new EarningReport();
        };
    }

    public LineEntity newLine(ReportKind kind) {
        return switch (kind) {
            case EXPENSE -> new Expense();
            case EARNING -> new Earning();
        };
    }

    public InvoiceEntity newInvoice(ReportKind kind, Long lineId) {
        return switch (kind) {
            case EXPENSE -> new InvoiceExpense(lineId);
            case EARNING -> new InvoiceEarning(lineId);
        };
    }

    // Safe because entities saved through these repositories come from the same kind's repository or factory.
    @SuppressWarnings("unchecked")
    private static ReportRepository<ReportEntity> asReports(ReportRepository<? extends ReportEntity> repository) {
        return (ReportRepository<ReportEntity>) repository;
    }

    @SuppressWarnings("unchecked")
    private static LineRepository<LineEntity> asLines(LineRepository<? extends LineEntity> repository) {
        return (LineRepository<LineEntity>) repository;
    }

    @SuppressWarnings("unchecked")
    private static InvoiceRepository<InvoiceEntity> asInvoices(InvoiceRepository<? extends InvoiceEntity> repository) {
        return (InvoiceRepository<InvoiceEntity>) repository;
    }
}
