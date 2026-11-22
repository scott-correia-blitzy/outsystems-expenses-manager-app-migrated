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

    @Query("select u.id, u.username, u.name from AppUser u where u.id in :ids")
    List<Object[]> findIdUsernameAndNameByIdIn(@Param("ids") Collection<Long> ids);

    default Optional<String> findDisplayNameById(Long id) {
        return id == null ? Optional.empty() : Optional.ofNullable(displayNames(List.of(id)).get(id));
    }

    default Map<Long, String> displayNames(Collection<Long> ids) {
        Map<Long, String> names = new HashMap<>();
        if (ids == null || ids.isEmpty()) {
            return names;
        }
        for (Object[] row : findIdUsernameAndNameByIdIn(ids)) {
            names.put((Long) row[0], AppUser.displayName((String) row[1], (String) row[2]));
        }
        return names;
    }
}
