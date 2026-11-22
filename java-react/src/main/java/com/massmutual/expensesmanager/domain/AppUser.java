package com.massmutual.expensesmanager.domain;

import jakarta.persistence.AttributeConverter;
import jakarta.persistence.CollectionTable;
import jakarta.persistence.Column;
import jakarta.persistence.Convert;
import jakarta.persistence.ElementCollection;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.Table;
import java.util.Arrays;
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
    @Convert(converter = RoleConverter.class)
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

    // Name is optional for provisioned users, so wherever a user is named the username stands in for a blank one.
    public static String displayName(String username, String name) {
        return name == null || name.isBlank() ? username : name;
    }

    public String getPasswordHash() {
        return passwordHash;
    }

    public Set<Role> getRoles() {
        return Collections.unmodifiableSet(roles);
    }

    // Roles are provisioned outside the app: a stored name matching no role loads as null, which Hibernate leaves out.
    static final class RoleConverter implements AttributeConverter<Role, String> {

        private static final System.Logger LOG = System.getLogger(AppUser.class.getName());
        private static final String UNKNOWN_ROLE =
                "Ignoring a role in AppUserRole that is not one of " + Arrays.toString(Role.values());

        @Override
        public String convertToDatabaseColumn(Role role) {
            return role == null ? null : role.name();
        }

        @Override
        public Role convertToEntityAttribute(String stored) {
            for (Role role : Role.values()) {
                if (role.name().equals(stored)) {
                    return role;
                }
            }
            // The stored text stays out of the log, since provisioning data may carry line breaks.
            LOG.log(System.Logger.Level.WARNING, UNKNOWN_ROLE);
            return null;
        }
    }
}
