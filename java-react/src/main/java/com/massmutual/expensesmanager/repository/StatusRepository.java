package com.massmutual.expensesmanager.repository;

import com.massmutual.expensesmanager.domain.Status;
import java.util.List;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.repository.JpaRepository;

public interface StatusRepository extends JpaRepository<Status, Integer> {

    // Draft and Submitted share Order 2, so id breaks the tie.
    default List<Status> findAllByOrderByOrderAsc() {
        return findAll(Sort.by("order", "id"));
    }
}
