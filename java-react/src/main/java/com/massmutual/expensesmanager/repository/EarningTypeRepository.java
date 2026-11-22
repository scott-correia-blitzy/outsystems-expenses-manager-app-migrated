package com.massmutual.expensesmanager.repository;

import com.massmutual.expensesmanager.domain.EarningType;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface EarningTypeRepository extends JpaRepository<EarningType, Integer> {

    List<EarningType> findByIsActiveTrueOrderByLabelAsc();
}
