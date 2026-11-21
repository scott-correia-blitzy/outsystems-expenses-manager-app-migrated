package com.massmutual.expensesmanager.service;

import java.time.Clock;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.massmutual.expensesmanager.domain.BlogPost;
import com.massmutual.expensesmanager.repository.AppUserRepository;
import com.massmutual.expensesmanager.repository.BlogPostRepository;
import com.massmutual.expensesmanager.service.model.BlogPostView;
import com.massmutual.expensesmanager.service.model.FieldViolation;

@Service
public class BlogService {

    private static final int TITLE_MAX_LENGTH = 50;
    private static final int DESCRIPTION_MAX_LENGTH = 10000;

    private final BlogPostRepository blogPostRepository;
    private final AppUserRepository appUserRepository;
    private final ReportAccessPolicy policy;
    private final Clock clock;

    public BlogService(
            BlogPostRepository blogPostRepository,
            AppUserRepository appUserRepository,
            ReportAccessPolicy policy,
            Clock clock) {
        this.blogPostRepository = blogPostRepository;
        this.appUserRepository = appUserRepository;
        this.policy = policy;
        this.clock = clock;
    }

    public record PostInput(String title, String description) {
    }

    @Transactional(readOnly = true)
    public List<BlogPostView> search(Caller caller, String q) {
        Objects.requireNonNull(caller, "caller");
        String keyword = q == null || q.isBlank() ? null : q.trim().toLowerCase(Locale.ROOT);
        return toViews(blogPostRepository.search(keyword));
    }

    @Transactional(readOnly = true)
    public BlogPostView get(Caller caller, Long id) {
        Objects.requireNonNull(caller, "caller");
        return toViews(List.of(load(id))).getFirst();
    }

    @Transactional
    public BlogPostView create(Caller caller, PostInput in) {
        policy.requireAdministrator(caller);
        validate(in);
        LocalDateTime now = LocalDateTime.now(clock);
        BlogPost post = new BlogPost();
        post.setTitle(in.title());
        post.setDescription(descriptionOf(in));
        post.setCreatedBy(caller.id());
        post.setUpdatedBy(caller.id());
        post.setCreatedOn(now);
        post.setUpdatedOn(now);
        post.setIsActive(Boolean.TRUE);
        return toViews(List.of(blogPostRepository.save(post))).getFirst();
    }

    @Transactional
    public BlogPostView update(Caller caller, Long id, PostInput in) {
        BlogPost post = load(id);
        policy.requireAdministrator(caller);
        validate(in);
        post.setTitle(in.title());
        post.setDescription(descriptionOf(in));
        post.setUpdatedBy(caller.id());
        post.setUpdatedOn(LocalDateTime.now(clock));
        return toViews(List.of(blogPostRepository.save(post))).getFirst();
    }

    private BlogPost load(Long id) {
        if (id == null) {
            throw ApiException.notFound();
        }
        return blogPostRepository.findById(id).orElseThrow(ApiException::notFound);
    }

    private static void validate(PostInput in) {
        String title = in == null ? null : in.title();
        String description = in == null ? null : in.description();
        List<FieldViolation> violations = new ArrayList<>();
        if (title == null || title.isBlank()) {
            violations.add(new FieldViolation("title", LegacyMessages.FIELD_REQUIRED));
        } else if (title.length() > TITLE_MAX_LENGTH) {
            violations.add(new FieldViolation("title", LegacyMessages.MAX_LENGTH_50));
        }
        if (description != null && description.length() > DESCRIPTION_MAX_LENGTH) {
            violations.add(new FieldViolation("description", LegacyMessages.MAX_LENGTH_10000));
        }
        if (!violations.isEmpty()) {
            throw ApiException.validation(violations);
        }
    }

    private static String descriptionOf(PostInput in) {
        return in.description() == null ? "" : in.description();
    }

    private List<BlogPostView> toViews(List<BlogPost> posts) {
        Set<Long> userIds = new HashSet<>();
        for (BlogPost post : posts) {
            if (post.getCreatedBy() != null) {
                userIds.add(post.getCreatedBy());
            }
            if (post.getUpdatedBy() != null) {
                userIds.add(post.getUpdatedBy());
            }
        }
        Map<Long, String> names = appUserRepository.displayNames(userIds);
        return posts.stream()
                .map(post -> new BlogPostView(
                        post.getId(),
                        post.getTitle(),
                        post.getDescription(),
                        post.getCreatedOn(),
                        nameOf(names, post.getCreatedBy()),
                        post.getUpdatedOn(),
                        nameOf(names, post.getUpdatedBy())))
                .toList();
    }

    private static String nameOf(Map<Long, String> names, Long userId) {
        return userId == null ? null : names.get(userId);
    }
}
