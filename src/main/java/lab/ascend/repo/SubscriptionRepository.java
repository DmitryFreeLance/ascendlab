package lab.ascend.repo;

import lab.ascend.domain.SubscriptionStatus;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.Timestamp;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Optional;

@Repository
public class SubscriptionRepository {
    private final JdbcTemplate jdbc;

    public SubscriptionRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public SubscriptionStatus status(long telegramId) {
        try {
            return jdbc.queryForObject("""
                            SELECT plan_code, active_until FROM subscriptions WHERE telegram_id = ?
                            """,
                    (rs, rowNum) -> {
                        Instant activeUntil = rs.getTimestamp("active_until").toInstant();
                        boolean active = activeUntil.isAfter(Instant.now());
                        long days = active ? Math.max(1, ChronoUnit.DAYS.between(Instant.now(), activeUntil)) : 0;
                        return new SubscriptionStatus(active, rs.getString("plan_code"), activeUntil, days);
                    },
                    telegramId);
        } catch (EmptyResultDataAccessException ignored) {
            return new SubscriptionStatus(false, null, null, 0);
        }
    }

    public Optional<Instant> activeUntil(long telegramId) {
        SubscriptionStatus status = status(telegramId);
        return Optional.ofNullable(status.activeUntil());
    }

    public void activate(long telegramId, String planCode, int days, String source, String paymentId) {
        Instant base = activeUntil(telegramId)
                .filter(until -> until.isAfter(Instant.now()))
                .orElse(Instant.now());
        Instant activeUntil = base.plus(days, ChronoUnit.DAYS);
        if (status(telegramId).activeUntil() == null) {
            jdbc.update("""
                            INSERT INTO subscriptions (telegram_id, plan_code, active_until, source, payment_id)
                            VALUES (?, ?, ?, ?, ?)
                            """,
                    telegramId, planCode, Timestamp.from(activeUntil), source, paymentId);
        } else {
            jdbc.update("""
                            UPDATE subscriptions
                            SET plan_code = ?, active_until = ?, source = ?, payment_id = ?, updated_at = CURRENT_TIMESTAMP
                            WHERE telegram_id = ?
                            """,
                    planCode, Timestamp.from(activeUntil), source, paymentId, telegramId);
        }
    }
}
