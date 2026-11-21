package com.massmutual.expensesmanager.repository;

import com.massmutual.expensesmanager.domain.ReferenceIds;
import com.massmutual.expensesmanager.domain.ReportEntity;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.NoRepositoryBean;
import org.springframework.data.repository.query.Param;

@NoRepositoryBean
public interface ReportRepository<R extends ReportEntity> extends JpaRepository<R, Long> {

    // Scoped on SubmitedBy like the legacy list filter; ownership checks elsewhere use CreatedBy.
    @Query("select new com.massmutual.expensesmanager.repository.ReportListRow("
            + "r.id, r.code, r.title, r.statusId, r.createdOn, r.submitedOn, u.name)"
            + " from #{#entityName} r left join AppUser u on u.id = r.submitedBy"
            + " where (r.submitedBy = :callerId"
            + " or (:approver = true and r.statusId = " + ReferenceIds.STATUS_SUBMITTED + ")"
            + " or (:admin = true and r.statusId <> " + ReferenceIds.STATUS_DRAFT + "))"
            + " and (:statusId is null or r.statusId = :statusId)"
            + " and (:q is null or lower(r.code) like concat('%', :q, '%')"
            + " or lower(r.title) like concat('%', :q, '%'))"
            + " and (:from is null or r.createdOn > :from)"
            + " and (:to is null or r.createdOn <= :to)")
    List<ReportListRow> findListRows(
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
}
