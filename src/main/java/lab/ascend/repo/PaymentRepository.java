package lab.ascend.repo;

import lab.ascend.domain.PaymentStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.UUID;

@Repository
public class PaymentRepository {
    private final JdbcTemplate jdbc;

    public PaymentRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public String create(long telegramId, String planCode, String provider, String amount, String currency, String payload) {
        String id = UUID.randomUUID().toString();
        jdbc.update("""
                        INSERT INTO payments (id, telegram_id, plan_code, provider, amount, currency, status, payload)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                id, telegramId, planCode, provider, amount, currency, PaymentStatus.PENDING.name(), payload);
        return id;
    }

    public void linkExternal(String paymentId, String externalId, String url, String payload) {
        jdbc.update("""
                        UPDATE payments
                        SET external_id = ?, url = ?, payload = ?, updated_at = CURRENT_TIMESTAMP
                        WHERE id = ?
                        """,
                fitExternalId(externalId), url, payload, paymentId);
    }

    public void markStatus(String paymentId, PaymentStatus status, String externalId, String payload) {
        jdbc.update("""
                        UPDATE payments
                        SET status = ?, external_id = COALESCE(?, external_id), payload = COALESCE(?, payload), updated_at = CURRENT_TIMESTAMP
                        WHERE id = ?
                        """,
                status.name(), fitExternalId(externalId), payload, paymentId);
    }

    public PaymentRecord findRequired(String paymentId) {
        return jdbc.queryForObject("""
                        SELECT id, telegram_id, plan_code, provider, status, external_id FROM payments WHERE id = ?
                        """,
                (rs, rowNum) -> new PaymentRecord(
                        rs.getString("id"),
                        rs.getLong("telegram_id"),
                        rs.getString("plan_code"),
                        rs.getString("provider"),
                        rs.getString("status"),
                        rs.getString("external_id")
                ),
                paymentId);
    }

    public boolean hasPaidPurchase(long telegramId) {
        Integer count = jdbc.queryForObject("""
                        SELECT COUNT(*)
                        FROM payments
                        WHERE telegram_id = ? AND status = ?
                        """,
                Integer.class,
                telegramId,
                PaymentStatus.PAID.name());
        return count != null && count > 0;
    }

    public record PaymentRecord(String id, long telegramId, String planCode, String provider, String status, String externalId) {
    }

    private static String fitExternalId(String value) {
        if (value == null || value.length() <= 1024) {
            return value;
        }
        return value.substring(0, 1024);
    }
}
