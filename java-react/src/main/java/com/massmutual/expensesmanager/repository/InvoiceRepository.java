package com.massmutual.expensesmanager.repository;

import com.massmutual.expensesmanager.domain.InvoiceEntity;
import java.time.LocalDateTime;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.NoRepositoryBean;
import org.springframework.data.repository.query.Param;

@NoRepositoryBean
public interface InvoiceRepository<I extends InvoiceEntity> extends JpaRepository<I, Long> {

    interface InvoiceMeta {
        Long getId();

        String getFilename();

        String getFiletype();

        LocalDateTime getDatetime();
    }

    // Never selects content: lazy @Lob loading needs bytecode enhancement, which this build does not use.
    @Query("select i.id as id, i.filename as filename, i.filetype as filetype, i.datetime as datetime"
            + " from #{#entityName} i where i.id in :ids")
    List<InvoiceMeta> findInfoByIds(@Param("ids") Collection<Long> ids);

    @Query("select i.id as id, i.filename as filename, i.filetype as filetype, i.datetime as datetime"
            + " from #{#entityName} i where i.id = :id")
    Optional<InvoiceMeta> findInfoById(@Param("id") Long id);
}
