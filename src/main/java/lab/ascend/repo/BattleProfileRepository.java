package lab.ascend.repo;

import lab.ascend.domain.UserProfile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.Optional;
import java.util.UUID;

@Repository
public class BattleProfileRepository {
    private final JdbcTemplate jdbc;

    public BattleProfileRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public void upsertFromFaceAnalysis(UserProfile user, int score, String contentType, byte[] photo) {
        int updated = jdbc.update("""
                        UPDATE battle_profiles
                        SET display_name = ?, score = ?, photo_content_type = ?, photo_bytes = ?,
                            score_source = 'face', updated_at = CURRENT_TIMESTAMP
                        WHERE telegram_id = ?
                        """,
                displayName(user), clamp(score), safeContentType(contentType), photo, user.telegramId());
        if (updated > 0) return;
        jdbc.update("""
                        INSERT INTO battle_profiles
                            (telegram_id, public_id, display_name, score, photo_content_type, photo_bytes, score_source)
                        VALUES (?, ?, ?, ?, ?, ?, 'face')
                        """,
                user.telegramId(), UUID.randomUUID().toString(), displayName(user), clamp(score),
                safeContentType(contentType), photo);
    }

    public void updateFromBattle(long telegramId, int score, String contentType, byte[] photo) {
        jdbc.update("""
                        UPDATE battle_profiles
                        SET score = ?, photo_content_type = ?, photo_bytes = ?,
                            score_source = 'battle', updated_at = CURRENT_TIMESTAMP
                        WHERE telegram_id = ?
                        """,
                clamp(score), safeContentType(contentType), photo, telegramId);
    }

    public int countOpponents(long excludedTelegramId) {
        Integer count = jdbc.queryForObject(
                "SELECT COUNT(*) FROM battle_profiles WHERE telegram_id <> ?",
                Integer.class,
                excludedTelegramId
        );
        return count == null ? 0 : count;
    }

    public Optional<BattleProfile> randomOpponent(long excludedTelegramId) {
        return jdbc.query("""
                        SELECT telegram_id, public_id, display_name, score, photo_content_type, photo_bytes
                        FROM battle_profiles
                        WHERE telegram_id <> ?
                        ORDER BY RAND()
                        LIMIT 1
                        """,
                (rs, rowNum) -> new BattleProfile(
                        rs.getLong("telegram_id"),
                        rs.getString("public_id"),
                        rs.getString("display_name"),
                        clamp(rs.getInt("score")),
                        rs.getString("photo_content_type"),
                        rs.getBytes("photo_bytes")
                ),
                excludedTelegramId
        ).stream().findFirst();
    }

    public Optional<StoredPhoto> photoByPublicId(String publicId) {
        return jdbc.query("""
                        SELECT photo_content_type, photo_bytes
                        FROM battle_profiles
                        WHERE public_id = ?
                        """,
                (rs, rowNum) -> new StoredPhoto(
                        rs.getString("photo_content_type"),
                        rs.getBytes("photo_bytes")
                ),
                publicId
        ).stream().findFirst();
    }

    private static String displayName(UserProfile user) {
        String name = user.displayName().trim();
        return name.isBlank() ? "Участник BodyLab" : name;
    }

    private static String safeContentType(String contentType) {
        if (contentType == null || !contentType.toLowerCase(java.util.Locale.ROOT).startsWith("image/")) {
            return "image/jpeg";
        }
        return contentType;
    }

    private static int clamp(int value) {
        return Math.max(0, Math.min(100, value));
    }

    public record BattleProfile(
            long telegramId,
            String publicId,
            String displayName,
            int score,
            String photoContentType,
            byte[] photo
    ) {
    }

    public record StoredPhoto(String contentType, byte[] bytes) {
    }
}
