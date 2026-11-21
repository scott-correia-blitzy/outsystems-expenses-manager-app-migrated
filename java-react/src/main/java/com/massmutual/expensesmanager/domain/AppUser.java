package com.massmutual.expensesmanager.domain;

import jakarta.persistence.CollectionTable;
import jakarta.persistence.Column;
import jakarta.persistence.ElementCollection;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.Table;
import java.util.Collections;
import java.util.HashSet;
import java.util.Set;

@Entity
@Table(name = "AppUser")
public class AppUser {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "Id")
    private Long id;

    @Column(name = "Username", length = 250, nullable = false, unique = true)
    private String username;

    @Column(name = "Name", length = 250)
    private String name;

    @Column(name = "PasswordHash", length = 100, nullable = false)
    private String passwordHash;

    // Eager: authentication reads the roles outside any open session.
    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(name = "AppUserRole", joinColumns = @JoinColumn(name = "UserId"))
    @Enumerated(EnumType.STRING)
    @Column(name = "Role", length = 20, nullable = false)
    private Set<Role> roles = new HashSet<>();

    protected AppUser() {
    }

    public AppUser(String username, String name, String passwordHash, Set<Role> roles) {
        this.username = username;
        this.name = name;
        this.passwordHash = passwordHash;
        this.roles.addAll(roles);
    }

    public Long getId() {
        return id;
    }

    public String getUsername() {
        return username;
    }

    public String getName() {
        return name;
    }

    public String getPasswordHash() {
        return passwordHash;
    }

    public Set<Role> getRoles() {
        return Collections.unmodifiableSet(roles);
    }
}
