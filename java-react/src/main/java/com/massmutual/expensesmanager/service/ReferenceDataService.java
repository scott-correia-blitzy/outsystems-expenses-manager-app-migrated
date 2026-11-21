package com.massmutual.expensesmanager.service;

import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.massmutual.expensesmanager.domain.ReportKind;
import com.massmutual.expensesmanager.domain.StaticEntity;
import com.massmutual.expensesmanager.repository.CurrencyRepository;
import com.massmutual.expensesmanager.repository.EarningTypeRepository;
import com.massmutual.expensesmanager.repository.ExpenseTypeRepository;
import com.massmutual.expensesmanager.repository.StatusRepository;
import com.massmutual.expensesmanager.service.model.RefItem;
import com.massmutual.expensesmanager.service.model.ReferenceData;

@Service
public class ReferenceDataService {

    private final CurrencyRepository currencyRepository;
    private final StatusRepository statusRepository;
    private final ExpenseTypeRepository expenseTypeRepository;
    private final EarningTypeRepository earningTypeRepository;
    private final ExpensesProperties properties;

    // Static rows never change at runtime, so lookups share one copy instead of querying per report or line.
    private volatile StaticRows staticRows;

    public ReferenceDataService(
            CurrencyRepository currencyRepository,
            StatusRepository statusRepository,
            ExpenseTypeRepository expenseTypeRepository,
            EarningTypeRepository earningTypeRepository,
            ExpensesProperties properties) {
        this.currencyRepository = currencyRepository;
        this.statusRepository = statusRepository;
        this.expenseTypeRepository = expenseTypeRepository;
        this.earningTypeRepository = earningTypeRepository;
        this.properties = properties;
    }

    @Transactional(readOnly = true)
    public ReferenceData referenceData() {
        return new ReferenceData(
                toItems(currencyRepository.findAllByOrderByOrderAsc()),
                toItems(statusRepository.findAllByOrderByOrderAsc()),
                toItems(expenseTypeRepository.findByIsActiveTrueOrderByOrderAsc()),
                toItems(earningTypeRepository.findByIsActiveTrueOrderByLabelAsc()),
                properties.mileageReimbursement(),
                properties.dollarsToEuros(),
                properties.vatRate());
    }

    public String statusLabel(Integer statusId) {
        if (statusId == null) {
            return null;
        }
        return rows().statusLabels().get(statusId);
    }

    public Optional<Integer> statusIdForLabel(String label) {
        if (label == null || label.isBlank()) {
            return Optional.empty();
        }
        return Optional.ofNullable(rows().statusIdsByLabel().get(normalize(label)));
    }

    public String typeLabel(ReportKind kind, Integer typeId) {
        TypeRow type = type(kind, typeId);
        return type == null ? null : type.label();
    }

    public boolean isActiveType(ReportKind kind, Integer typeId) {
        TypeRow type = type(kind, typeId);
        return type != null && type.active();
    }

    public boolean currencyExists(Integer id) {
        return id != null && rows().currencyIds().contains(id);
    }

    private TypeRow type(ReportKind kind, Integer typeId) {
        if (kind == null || typeId == null) {
            return null;
        }
        StaticRows rows = rows();
        Map<Integer, TypeRow> types = switch (kind) {
            case EXPENSE -> rows.expenseTypes();
            case EARNING -> rows.earningTypes();
        };
        return types.get(typeId);
    }

    private StaticRows rows() {
        StaticRows rows = staticRows;
        return rows != null ? rows : loadRows();
    }

    private synchronized StaticRows loadRows() {
        if (staticRows == null) {
            staticRows = new StaticRows(
                    statusRepository.findAll().stream()
                            .collect(Collectors.toUnmodifiableMap(StaticEntity::getId, StaticEntity::getLabel)),
                    statusRepository.findAllByOrderByOrderAsc().stream()
                            .collect(Collectors.toUnmodifiableMap(
                                    status -> normalize(status.getLabel()),
                                    StaticEntity::getId,
                                    (first, second) -> first)),
                    typeRows(expenseTypeRepository.findAll()),
                    typeRows(earningTypeRepository.findAll()),
                    currencyRepository.findAll().stream()
                            .map(StaticEntity::getId)
                            .collect(Collectors.toUnmodifiableSet()));
        }
        return staticRows;
    }

    private static Map<Integer, TypeRow> typeRows(List<? extends StaticEntity> rows) {
        return rows.stream()
                .collect(Collectors.toUnmodifiableMap(
                        StaticEntity::getId,
                        row -> new TypeRow(row.getLabel(), Boolean.TRUE.equals(row.getIsActive()))));
    }

    private static List<RefItem> toItems(List<? extends StaticEntity> rows) {
        return rows.stream()
                .map(row -> new RefItem(row.getId(), row.getLabel(), row.getOrder(), row.getIsActive()))
                .toList();
    }

    private static String normalize(String label) {
        return label.trim().toLowerCase(Locale.ROOT);
    }

    private record TypeRow(String label, boolean active) {
    }

    private record StaticRows(
            Map<Integer, String> statusLabels,
            Map<String, Integer> statusIdsByLabel,
            Map<Integer, TypeRow> expenseTypes,
            Map<Integer, TypeRow> earningTypes,
            Set<Integer> currencyIds) {
    }
}
