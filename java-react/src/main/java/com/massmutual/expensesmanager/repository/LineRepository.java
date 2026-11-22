package com.massmutual.expensesmanager.repository;

import com.massmutual.expensesmanager.domain.LineEntity;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.NoRepositoryBean;
import org.springframework.data.repository.query.Param;

// #{#entityName}Report and #{#entityName}Type rely on the legacy entity naming pattern.
@NoRepositoryBean
public interface LineRepository<L extends LineEntity> extends JpaRepository<L, Long> {

    List<L> findByReportId(Long reportId);

    List<L> findByReportIdAndTitleContainingIgnoreCase(Long reportId, String title);

    boolean existsByReportId(Long reportId);

    @Query("select l.reportId from #{#entityName} l where l.id = :id")
    Optional<Long> findReportIdById(@Param("id") Long id);

    @Query("select coalesce(sum(l.amountInEuros), 0) from #{#entityName} l where l.reportId = :reportId")
    BigDecimal sumByReportId(@Param("reportId") Long reportId);

    @Query("select l.reportId, coalesce(sum(l.amountInEuros), 0) from #{#entityName} l"
            + " where l.reportId in :reportIds group by l.reportId")
    List<Object[]> sumByReportIds(@Param("reportIds") Collection<Long> reportIds);

    default Map<Long, BigDecimal> totalsByReportId(Collection<Long> reportIds) {
        Map<Long, BigDecimal> totals = new HashMap<>();
        if (reportIds == null || reportIds.isEmpty()) {
            return totals;
        }
        for (Object[] row : sumByReportIds(reportIds)) {
            totals.put((Long) row[0], (BigDecimal) row[1]);
        }
        return totals;
    }

    // Status is filtered by subquery because H2 plans the equivalent join as a nested loop over the status index.
    @Query("select coalesce(sum(l.amountInEuros), 0) from #{#entityName} l"
            + " where l.createdBy = :callerId"
            + " and l.reportId in (select r.id from #{#entityName}Report r where r.statusId in :statusIds)")
    BigDecimal sumForCreatorInStatuses(
            @Param("callerId") Long callerId, @Param("statusIds") Collection<Integer> statusIds);

    // The year is deliberately ignored, as in the legacy month cards.
    @Query("select coalesce(sum(l.amountInEuros), 0) from #{#entityName} l"
            + " where l.createdBy = :callerId"
            + " and l.reportId in (select r.id from #{#entityName}Report r where r.statusId in :statusIds)"
            + " and extract(month from l.date) = :month")
    BigDecimal sumForCreatorInStatusesAndMonth(
            @Param("callerId") Long callerId,
            @Param("statusIds") Collection<Integer> statusIds,
            @Param("month") int month);

    @Query("select new com.massmutual.expensesmanager.repository.TypeTotalRow("
            + "t.id, t.label, count(l.id), sum(l.amountInEuros))"
            + " from #{#entityName} l"
            + " join #{#entityName}Type t on t.id = l.typeId"
            + " where l.createdBy = :callerId"
            + " and l.reportId in (select r.id from #{#entityName}Report r where r.statusId in :statusIds)"
            + " group by t.id, t.label"
            + " order by sum(l.amountInEuros) desc, t.id")
    List<TypeTotalRow> totalsByType(
            @Param("callerId") Long callerId, @Param("statusIds") Collection<Integer> statusIds);

    @Query("select new com.massmutual.expensesmanager.repository.DatedAmountRow(l.date, l.amountInEuros)"
            + " from #{#entityName} l"
            + " where l.createdBy = :callerId and l.date >= :since"
            + " order by l.date asc")
    List<DatedAmountRow> findForCreatorSince(@Param("callerId") Long callerId, @Param("since") LocalDate since);
}
