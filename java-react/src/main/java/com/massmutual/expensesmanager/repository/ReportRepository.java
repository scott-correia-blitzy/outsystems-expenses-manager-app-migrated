package com.massmutual.expensesmanager.repository;

import com.massmutual.expensesmanager.domain.ReferenceIds;
import com.massmutual.expensesmanager.domain.ReportEntity;
import jakarta.persistence.LockModeType;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.NoRepositoryBean;
import org.springframework.data.repository.query.Param;

@NoRepositoryBean
public interface ReportRepository<R extends ReportEntity> extends JpaRepository<R, Long> {

    // Scoped on SubmitedBy like the legacy list filter; ownership checks elsewhere use CreatedBy.
    // Without approver or admin scope, a separate owner-only query lets H2 use the SubmitedBy index.
    // q goes into LIKE unescaped, so % and _ stay wildcards, as in the legacy Like filters.
    default List<ReportListRow> findListRows(
            Long callerId,
            boolean approver,
            boolean admin,
            Integer statusId,
            String q,
            LocalDateTime from,
            LocalDateTime to) {
        // CreatedOn lies within years 1 to 9999; wider bounds overflow the JDBC timestamp binding and are clamped.
        if ((from != null && from.getYear() > 9999) || (to != null && to.getYear() < 1)) {
            return List.of();
        }
        LocalDateTime lower = from != null && from.getYear() < 1 ? LocalDate.of(0, 12, 31).atTime(LocalTime.MAX) : from;
        LocalDateTime upper = to != null && to.getYear() > 9999 ? LocalDate.of(9999, 12, 31).atTime(LocalTime.MAX) : to;
        if (approver || admin) {
            return findScopedListRows(callerId, approver, admin, statusId, q, lower, upper);
        }
        return findOwnListRows(callerId, statusId, q, lower, upper);
    }

    @Query("select new com.massmutual.expensesmanager.repository.ReportListRow("
            + "r.id, r.code, r.title, r.statusId, r.createdOn, r.submitedOn, u.username, u.name)"
            + " from #{#entityName} r left join AppUser u on u.id = r.submitedBy"
            + " where r.submitedBy = :callerId"
            + " and (:statusId is null or r.statusId = :statusId)"
            + " and (:q is null or lower(r.code) like concat('%', :q, '%')"
            + " or lower(r.title) like concat('%', :q, '%'))"
            + " and (:from is null or r.createdOn > :from)"
            + " and (:to is null or r.createdOn <= :to)")
    List<ReportListRow> findOwnListRows(
            @Param("callerId") Long callerId,
            @Param("statusId") Integer statusId,
            @Param("q") String q,
            @Param("from") LocalDateTime from,
            @Param("to") LocalDateTime to);

    @Query("select new com.massmutual.expensesmanager.repository.ReportListRow("
            + "r.id, r.code, r.title, r.statusId, r.createdOn, r.submitedOn, u.username, u.name)"
            + " from #{#entityName} r left join AppUser u on u.id = r.submitedBy"
            + " where (r.submitedBy = :callerId"
            + " or (:approver = true and r.statusId = " + ReferenceIds.STATUS_SUBMITTED + ")"
            + " or (:admin = true and r.statusId <> " + ReferenceIds.STATUS_DRAFT + "))"
            + " and (:statusId is null or r.statusId = :statusId)"
            + " and (:q is null or lower(r.code) like concat('%', :q, '%')"
            + " or lower(r.title) like concat('%', :q, '%'))"
            + " and (:from is null or r.createdOn > :from)"
            + " and (:to is null or r.createdOn <= :to)")
    List<ReportListRow> findScopedListRows(
            @Param("callerId") Long callerId,
            @Param("approver") boolean approver,
            @Param("admin") boolean admin,
            @Param("statusId") Integer statusId,
            @Param("q") String q,
            @Param("from") LocalDateTime from,
            @Param("to") LocalDateTime to);

    boolean existsByCreatedByAndStatusId(Long createdBy, Integer statusId);

    @Query("select r.statusId, count(r) from #{#entityName} r where r.createdBy = :callerId group by r.statusId")
    List<Object[]> countByCreatedByGroupedByStatus(@Param("callerId") Long callerId);

    default Map<Integer, Long> statusCountsForCreator(Long callerId) {
        Map<Integer, Long> counts = new HashMap<>();
        for (Object[] row : countByCreatedByGroupedByStatus(callerId)) {
            counts.put((Integer) row[0], (Long) row[1]);
        }
        return counts;
    }

    long countByStatusIdNot(Integer statusId);

    long countByStatusId(Integer statusId);

    @Query("select r.code from #{#entityName} r where r.code like :pattern")
    List<String> findCodesLike(@Param("pattern") String pattern);

    // Row lock held until commit, so a write's status and line checks cannot go stale.
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select r from #{#entityName} r where r.id = :id")
    Optional<R> findByIdForUpdate(@Param("id") Long id);
}
