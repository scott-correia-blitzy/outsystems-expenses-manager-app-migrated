package com.massmutual.expensesmanager.repository;

import com.massmutual.expensesmanager.domain.Currency;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CurrencyRepository extends JpaRepository<Currency, Integer> {

    List<Currency> findAllByOrderByOrderAsc();
}
