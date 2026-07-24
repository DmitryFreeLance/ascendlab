package lab.ascend.repo;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
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
        Integer newUsersToday = jdbc.queryForObject("""
                SELECT COUNT(*) FROM users WHERE created_at >= DATEADD('DAY', -1, CURRENT_TIMESTAMP)
                """, Integer.class);
        Integer newUsers7d = jdbc.queryForObject("""
                SELECT COUNT(*) FROM users WHERE created_at >= DATEADD('DAY', -7, CURRENT_TIMESTAMP)
                """, Integer.class);
        Integer paidPayments7d = jdbc.queryForObject("""
                SELECT COUNT(*) FROM payments WHERE status = 'PAID' AND updated_at >= DATEADD('DAY', -7, CURRENT_TIMESTAMP)
                """, Integer.class);
        BigDecimal rubRevenue = jdbc.queryForObject("""
                SELECT COALESCE(SUM(CASE WHEN status = 'PAID' AND currency = 'RUB'
                    THEN CAST(amount AS DECIMAL(12, 2)) ELSE 0 END), 0)
                FROM payments
                """, BigDecimal.class);
        BigDecimal starsRevenue = jdbc.queryForObject("""
                SELECT COALESCE(SUM(CASE WHEN status = 'PAID' AND currency = 'XTR'
                    THEN CAST(amount AS DECIMAL(12, 2)) ELSE 0 END), 0)
                FROM payments
                """, BigDecimal.class);
        BigDecimal usdRevenue = jdbc.queryForObject("""
                SELECT COALESCE(SUM(CASE WHEN status = 'PAID' AND currency IN ('USDT', 'USD')
                    THEN CAST(amount AS DECIMAL(12, 2)) ELSE 0 END), 0)
                FROM payments
                """, BigDecimal.class);
        Integer analyses = jdbc.queryForObject("SELECT COUNT(*) FROM analysis_reports", Integer.class);
        Integer avgScore = jdbc.queryForObject("SELECT COALESCE(CAST(AVG(score) AS INT), 0) FROM analysis_reports", Integer.class);
        Integer meals = jdbc.queryForObject("SELECT COUNT(*) FROM nutrition_logs", Integer.class);
        return Map.ofEntries(
                Map.entry("users", users == null ? 0 : users),
                Map.entry("newUsersToday", newUsersToday == null ? 0 : newUsersToday),
                Map.entry("newUsers7d", newUsers7d == null ? 0 : newUsers7d),
                Map.entry("activeSubscriptions", activeSubscriptions == null ? 0 : activeSubscriptions),
                Map.entry("payments", payments == null ? 0 : payments),
                Map.entry("paidPayments", paidPayments == null ? 0 : paidPayments),
                Map.entry("paidPayments7d", paidPayments7d == null ? 0 : paidPayments7d),
                Map.entry("rubRevenue", rubRevenue == null ? BigDecimal.ZERO : rubRevenue),
                Map.entry("starsRevenue", starsRevenue == null ? BigDecimal.ZERO : starsRevenue),
                Map.entry("usdRevenue", usdRevenue == null ? BigDecimal.ZERO : usdRevenue),
                Map.entry("analyses", analyses == null ? 0 : analyses),
                Map.entry("avgScore", avgScore == null ? 0 : avgScore),
                Map.entry("meals", meals == null ? 0 : meals)
        );
    }

    public List<Map<String, Object>> providerStats() {
        return jdbc.query("""
                        SELECT provider,
                               COUNT(*) AS total_count,
                               SUM(CASE WHEN status = 'PAID' THEN 1 ELSE 0 END) AS paid_count,
                               COALESCE(SUM(CASE WHEN status = 'PAID' AND currency = 'RUB'
                                   THEN CAST(amount AS DECIMAL(12, 2)) ELSE 0 END), 0) AS rub_revenue,
                               COALESCE(SUM(CASE WHEN status = 'PAID' AND currency = 'XTR'
                                   THEN CAST(amount AS DECIMAL(12, 2)) ELSE 0 END), 0) AS stars_revenue,
                               COALESCE(SUM(CASE WHEN status = 'PAID' AND currency IN ('USDT', 'USD')
                                   THEN CAST(amount AS DECIMAL(12, 2)) ELSE 0 END), 0) AS usd_revenue
                        FROM payments
                        GROUP BY provider
                        ORDER BY paid_count DESC, total_count DESC
                        """,
                (rs, rowNum) -> Map.of(
                        "provider", rs.getString("provider"),
                        "total", rs.getInt("total_count"),
                        "paid", rs.getInt("paid_count"),
                        "rubRevenue", rs.getBigDecimal("rub_revenue"),
                        "starsRevenue", rs.getBigDecimal("stars_revenue"),
                        "usdRevenue", rs.getBigDecimal("usd_revenue")
                ));
    }

    public List<Map<String, Object>> planStats() {
        return jdbc.query("""
                        SELECT plan_code,
                               COUNT(*) AS total_count,
                               SUM(CASE WHEN status = 'PAID' THEN 1 ELSE 0 END) AS paid_count
                        FROM payments
                        GROUP BY plan_code
                        ORDER BY paid_count DESC, total_count DESC
                        """,
                (rs, rowNum) -> Map.of(
                        "planCode", rs.getString("plan_code"),
                        "total", rs.getInt("total_count"),
                        "paid", rs.getInt("paid_count")
                ));
    }

    public List<Map<String, Object>> paymentStatusStats() {
        return jdbc.query("""
                        SELECT status, COUNT(*) AS total_count
                        FROM payments
                        GROUP BY status
                        ORDER BY total_count DESC
                        """,
                (rs, rowNum) -> Map.of(
                        "status", rs.getString("status"),
                        "total", rs.getInt("total_count")
                ));
    }

    public List<Map<String, Object>> recentAnalyses() {
        return jdbc.query("""
                        SELECT a.telegram_id, a.score, u.first_name, u.username, a.created_at
                        FROM analysis_reports a
                        LEFT JOIN users u ON u.telegram_id = a.telegram_id
                        ORDER BY a.created_at DESC
                        LIMIT 8
                        """,
                (rs, rowNum) -> Map.of(
                        "telegramId", rs.getLong("telegram_id"),
                        "score", rs.getInt("score"),
                        "firstName", rs.getString("first_name") == null ? "" : rs.getString("first_name"),
                        "username", rs.getString("username") == null ? "" : rs.getString("username"),
                        "createdAt", rs.getTimestamp("created_at").toInstant().toString()
                ));
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
