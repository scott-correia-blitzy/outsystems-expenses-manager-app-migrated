package com.massmutual.expensesmanager.repository;

import com.massmutual.expensesmanager.domain.BlogPost;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface BlogPostRepository extends JpaRepository<BlogPost, Long> {

    // The legacy Blog screen showed at most the 10 newest posts.
    @Query("select b from BlogPost b where b.isActive = true"
            + " and (:q is null or lower(b.title) like concat('%', :q, '%')"
            + " or lower(b.description) like concat('%', :q, '%'))"
            + " order by b.createdOn desc, b.id desc limit 10")
    List<BlogPost> search(@Param("q") String q);
}
