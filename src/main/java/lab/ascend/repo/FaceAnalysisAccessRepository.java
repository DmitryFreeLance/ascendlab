package lab.ascend.repo;

import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

@Repository
public class FaceAnalysisAccessRepository {
    private final JdbcTemplate jdbc;

    public FaceAnalysisAccessRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public Wallet status(long telegramId) {
        return jdbc.query("""
                        SELECT credits, intro_used
                        FROM face_analysis_wallet
                        WHERE telegram_id = ?
                        """,
                rs -> rs.next()
                        ? new Wallet(rs.getInt("credits"), rs.getBoolean("intro_used"))
                        : new Wallet(0, false),
                telegramId);
    }

    @Transactional
    public boolean grant(long telegramId, String productCode, String paymentId) {
        try {
            jdbc.update("""
                            INSERT INTO face_analysis_grants (payment_id, telegram_id, product_code)
                            VALUES (?, ?, ?)
                            """,
                    paymentId, telegramId, productCode);
        } catch (DuplicateKeyException ignored) {
            return false;
        }
        int updated = jdbc.update("""
                        UPDATE face_analysis_wallet
                        SET credits = credits + 1,
                            intro_used = intro_used OR ?,
                            updated_at = CURRENT_TIMESTAMP
                        WHERE telegram_id = ?
                        """,
                "face_first".equals(productCode), telegramId);
        if (updated == 0) {
            jdbc.update("""
                            INSERT INTO face_analysis_wallet (telegram_id, credits, intro_used)
                            VALUES (?, 1, ?)
                            """,
                    telegramId, "face_first".equals(productCode));
        }
        return true;
    }

    public boolean consume(long telegramId) {
        return jdbc.update("""
                        UPDATE face_analysis_wallet
                        SET credits = credits - 1, updated_at = CURRENT_TIMESTAMP
                        WHERE telegram_id = ? AND credits > 0
                        """,
                telegramId) == 1;
    }

    public record Wallet(int credits, boolean introUsed) {
    }
}
