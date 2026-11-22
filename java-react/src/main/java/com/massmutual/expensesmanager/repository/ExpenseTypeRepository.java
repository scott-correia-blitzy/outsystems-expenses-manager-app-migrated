package com.massmutual.expensesmanager.repository;

import com.massmutual.expensesmanager.domain.ExpenseType;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ExpenseTypeRepository extends JpaRepository<ExpenseType, Integer> {

    List<ExpenseType> findByIsActiveTrueOrderByOrderAsc();
}
