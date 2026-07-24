package lab.ascend.repo;

import lab.ascend.domain.UserProfile;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public class UserRepository {
    private final JdbcTemplate jdbc;

    public UserRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public Optional<UserProfile> find(long telegramId) {
        try {
            return Optional.ofNullable(jdbc.queryForObject("""
                            SELECT telegram_id, first_name, last_name, username, language_code, photo_url, gender, age
                            FROM users WHERE telegram_id = ?
                            """,
                    (rs, rowNum) -> new UserProfile(
                            rs.getLong("telegram_id"),
                            rs.getString("first_name"),
                            rs.getString("last_name"),
                            rs.getString("username"),
                            rs.getString("language_code"),
                            rs.getString("photo_url"),
                            rs.getString("gender"),
                            rs.getInt("age")
                    ),
                    telegramId));
        } catch (EmptyResultDataAccessException ignored) {
            return Optional.empty();
        }
    }

    public UserProfile upsert(UserProfile user) {
        if (find(user.telegramId()).isPresent()) {
            jdbc.update("""
                            UPDATE users
                            SET first_name = ?, last_name = ?, username = ?, language_code = ?, photo_url = ?,
                                updated_at = CURRENT_TIMESTAMP
                            WHERE telegram_id = ?
                            """,
                    user.firstName(), user.lastName(), user.username(), user.languageCode(), user.photoUrl(),
                    user.telegramId());
        } else {
            jdbc.update("""
                            INSERT INTO users (telegram_id, first_name, last_name, username, language_code, photo_url, gender, age)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                            """,
                    user.telegramId(), user.firstName(), user.lastName(), user.username(), user.languageCode(), user.photoUrl(),
                    valueOr(user.gender(), "male"), user.age() <= 0 ? 25 : user.age());
        }
        return find(user.telegramId()).orElse(user);
    }

    public void updateSettings(long telegramId, String gender, int age, String languageCode) {
        jdbc.update("""
                        UPDATE users SET gender = ?, age = ?, language_code = ?, updated_at = CURRENT_TIMESTAMP
                        WHERE telegram_id = ?
                        """,
                gender, age, languageCode, telegramId);
    }

    public boolean onboardingSeen(long telegramId) {
        Boolean seen = jdbc.queryForObject("""
                        SELECT onboarded_at IS NOT NULL FROM users WHERE telegram_id = ?
                        """,
                Boolean.class,
                telegramId);
        return Boolean.TRUE.equals(seen);
    }

    public void markOnboardingSeen(long telegramId) {
        jdbc.update("""
                        UPDATE users
                        SET onboarded_at = COALESCE(onboarded_at, CURRENT_TIMESTAMP),
                            updated_at = CURRENT_TIMESTAMP
                        WHERE telegram_id = ?
                        """,
                telegramId);
    }

    private static String valueOr(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value;
    }
}
