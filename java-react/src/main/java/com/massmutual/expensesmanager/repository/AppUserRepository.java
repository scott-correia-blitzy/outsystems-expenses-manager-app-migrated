package com.massmutual.expensesmanager.repository;

import com.massmutual.expensesmanager.domain.AppUser;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface AppUserRepository extends JpaRepository<AppUser, Long> {

    Optional<AppUser> findByUsername(String username);

    @Query("select u.name from AppUser u where u.id = :id")
    Optional<String> findNameById(@Param("id") Long id);

    @Query("select u.id, u.name from AppUser u where u.id in :ids")
    List<Object[]> findIdAndNameByIdIn(@Param("ids") Collection<Long> ids);

    default Map<Long, String> displayNames(Collection<Long> ids) {
        Map<Long, String> names = new HashMap<>();
        if (ids == null || ids.isEmpty()) {
            return names;
        }
        for (Object[] row : findIdAndNameByIdIn(ids)) {
            names.put((Long) row[0], (String) row[1]);
        }
        return names;
    }
}
