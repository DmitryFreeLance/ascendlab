package lab.ascend.repo;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Map;

@Repository
public class AdminRepository {
    private final JdbcTemplate jdbc;

    public AdminRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public boolean exists(long telegramId) {
        Integer count = jdbc.queryForObject("SELECT COUNT(*) FROM admin_users WHERE telegram_id = ?", Integer.class, telegramId);
        return count != null && count > 0;
    }

    public void add(long telegramId, String note) {
        if (exists(telegramId)) {
            jdbc.update("UPDATE admin_users SET note = ? WHERE telegram_id = ?", note, telegramId);
            return;
        }
        jdbc.update("INSERT INTO admin_users (telegram_id, note) VALUES (?, ?)", telegramId, note);
    }

    public List<Map<String, Object>> admins() {
        return jdbc.query("""
                        SELECT telegram_id, note, created_at
                        FROM admin_users
                        ORDER BY created_at DESC
                        """,
                (rs, rowNum) -> Map.of(
                        "telegramId", rs.getLong("telegram_id"),
                        "note", rs.getString("note") == null ? "" : rs.getString("note"),
                        "createdAt", rs.getTimestamp("created_at").toInstant().toString()
                ));
    }

    public Map<String, Object> stats() {
        Integer users = jdbc.queryForObject("SELECT COUNT(*) FROM users", Integer.class);
        Integer activeSubscriptions = jdbc.queryForObject("""
                SELECT COUNT(*) FROM subscriptions WHERE active_until > CURRENT_TIMESTAMP
                """, Integer.class);
        Integer payments = jdbc.queryForObject("SELECT COUNT(*) FROM payments", Integer.class);
        Integer paidPayments = jdbc.queryForObject("SELECT COUNT(*) FROM payments WHERE status = 'PAID'", Integer.class);
        BigDecimal rubRevenue = jdbc.queryForObject("""
                SELECT COALESCE(SUM(CASE WHEN status = 'PAID' AND currency = 'RUB'
                    THEN CAST(amount AS DECIMAL(12, 2)) ELSE 0 END), 0)
                FROM payments
                """, BigDecimal.class);
        Integer analyses = jdbc.queryForObject("SELECT COUNT(*) FROM analysis_reports", Integer.class);
        Integer meals = jdbc.queryForObject("SELECT COUNT(*) FROM nutrition_logs", Integer.class);
        return Map.of(
                "users", users == null ? 0 : users,
                "activeSubscriptions", activeSubscriptions == null ? 0 : activeSubscriptions,
                "payments", payments == null ? 0 : payments,
                "paidPayments", paidPayments == null ? 0 : paidPayments,
                "rubRevenue", rubRevenue == null ? BigDecimal.ZERO : rubRevenue,
                "analyses", analyses == null ? 0 : analyses,
                "meals", meals == null ? 0 : meals
        );
    }

    public List<Map<String, Object>> recentPayments() {
        return jdbc.query("""
                        SELECT id, telegram_id, plan_code, provider, amount, currency, status, created_at
                        FROM payments
                        ORDER BY created_at DESC
                        LIMIT 12
                        """,
                (rs, rowNum) -> Map.of(
                        "id", rs.getString("id"),
                        "telegramId", rs.getLong("telegram_id"),
                        "planCode", rs.getString("plan_code"),
                        "provider", rs.getString("provider"),
                        "amount", rs.getString("amount"),
                        "currency", rs.getString("currency"),
                        "status", rs.getString("status"),
                        "createdAt", rs.getTimestamp("created_at").toInstant().toString()
                ));
    }

    public List<Map<String, Object>> recentUsers() {
        return jdbc.query("""
                        SELECT telegram_id, first_name, username, created_at
                        FROM users
                        ORDER BY created_at DESC
                        LIMIT 12
                        """,
                (rs, rowNum) -> Map.of(
                        "telegramId", rs.getLong("telegram_id"),
                        "firstName", rs.getString("first_name") == null ? "" : rs.getString("first_name"),
                        "username", rs.getString("username") == null ? "" : rs.getString("username"),
                        "createdAt", rs.getTimestamp("created_at").toInstant().toString()
                ));
    }
}
