package lab.ascend.service;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;

@Service
public class ChatUsageService {
    private static final int DAILY_LIMIT = 100;
    private static final ZoneId MOSCOW = ZoneId.of("Europe/Moscow");
    private static final DateTimeFormatter DAY_FORMAT = DateTimeFormatter.ISO_LOCAL_DATE;

    private final JdbcTemplate jdbc;

    public ChatUsageService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public ChatUsage status(long telegramId) {
        String dayKey = dayKey();
        Integer used = jdbc.queryForObject("""
                SELECT COALESCE(MAX(message_count), 0)
                FROM chat_usage
                WHERE telegram_id = ? AND day_key = ?
                """, Integer.class, telegramId, dayKey);
        int count = used == null ? 0 : used;
        return new ChatUsage(DAILY_LIMIT, count, Math.max(0, DAILY_LIMIT - count), dayKey);
    }

    public ChatUsage reserve(long telegramId) {
        ChatUsage current = status(telegramId);
        if (current.remaining() <= 0) {
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,
                    "Лимит BodyGPT на сегодня исчерпан: 100 сообщений. Новый лимит откроется после 04:00 МСК.");
        }
        int updated = jdbc.update("""
                UPDATE chat_usage
                SET message_count = message_count + 1, updated_at = CURRENT_TIMESTAMP
                WHERE telegram_id = ? AND day_key = ?
                """, telegramId, current.dayKey());
        if (updated == 0) {
            jdbc.update("""
                    INSERT INTO chat_usage (telegram_id, day_key, message_count)
                    VALUES (?, ?, 1)
                    """, telegramId, current.dayKey());
        }
        return status(telegramId);
    }

    private String dayKey() {
        return Instant.now().atZone(MOSCOW).minusHours(4).format(DAY_FORMAT);
    }

    public record ChatUsage(int limit, int used, int remaining, String dayKey) {
    }
}
