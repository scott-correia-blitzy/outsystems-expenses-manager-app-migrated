package com.massmutual.expensesmanager.web;

import com.massmutual.expensesmanager.service.AppUserPrincipal;
import com.massmutual.expensesmanager.service.BlogService;
import com.massmutual.expensesmanager.service.model.BlogPostView;
import com.massmutual.expensesmanager.web.dto.BlogPostRequest;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/blog")
public class BlogController {

    private final BlogService blogService;

    public BlogController(BlogService blogService) {
        this.blogService = blogService;
    }

    @GetMapping
    public List<BlogPostView> search(@AuthenticationPrincipal AppUserPrincipal principal,
            @RequestParam(required = false) String q) {
        return blogService.search(principal.toCaller(), q);
    }

    @GetMapping("/{id}")
    public BlogPostView get(@AuthenticationPrincipal AppUserPrincipal principal, @PathVariable Long id) {
        return blogService.get(principal.toCaller(), id);
    }

    @PostMapping(produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<BlogPostView> create(@AuthenticationPrincipal AppUserPrincipal principal,
            @Valid @RequestBody BlogPostRequest body) {
        BlogPostView created = blogService.create(principal.toCaller(), toInput(body));
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }

    @PutMapping(path = "/{id}", produces = MediaType.APPLICATION_JSON_VALUE)
    public BlogPostView update(@AuthenticationPrincipal AppUserPrincipal principal, @PathVariable Long id,
            @Valid @RequestBody BlogPostRequest body) {
        return blogService.update(principal.toCaller(), id, toInput(body));
    }

    private static BlogService.PostInput toInput(BlogPostRequest body) {
        return new BlogService.PostInput(body.title(), body.description());
    }
}
