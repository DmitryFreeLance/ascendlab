package lab.ascend.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lab.ascend.config.AppProperties;
import lab.ascend.domain.UserProfile;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.stream.Collectors;

@Service
public class TelegramInitDataService {
    private static final long MAX_INIT_DATA_AGE_SECONDS = 86_400;

    private final AppProperties properties;
    private final ObjectMapper objectMapper;

    public TelegramInitDataService(AppProperties properties, ObjectMapper objectMapper) {
        this.properties = properties;
        this.objectMapper = objectMapper;
    }

    public UserProfile authenticate(String initData) {
        if ((initData == null || initData.isBlank()) && properties.demoMode()) {
            return demoUser();
        }
        if (!properties.telegram().configured()) {
            if (properties.demoMode()) {
                return demoUser();
            }
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Telegram bot token is not configured");
        }
        Map<String, String> fields = parseQueryString(initData);
        String receivedHash = fields.remove("hash");
        fields.remove("signature");
        if (receivedHash == null || receivedHash.isBlank()) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Telegram initData hash is missing");
        }
        verifyFresh(fields);
        String checkString = fields.entrySet().stream()
                .sorted(Comparator.comparing(Map.Entry::getKey))
                .map(entry -> entry.getKey() + "=" + entry.getValue())
                .collect(Collectors.joining("\n"));
        String calculatedHash = hex(hmacSha256(
                hmacSha256("WebAppData".getBytes(StandardCharsets.UTF_8), properties.telegram().botToken().getBytes(StandardCharsets.UTF_8)),
                checkString.getBytes(StandardCharsets.UTF_8)
        ));
        if (!MessageDigest.isEqual(calculatedHash.getBytes(StandardCharsets.UTF_8), receivedHash.getBytes(StandardCharsets.UTF_8))) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Telegram initData signature is invalid");
        }
        return parseUser(fields.get("user"));
    }

    public Map<String, String> parseQueryString(String initData) {
        Map<String, String> fields = new LinkedHashMap<>();
        if (initData == null || initData.isBlank()) {
            return fields;
        }
        for (String pair : initData.split("&")) {
            int equals = pair.indexOf('=');
            if (equals <= 0) {
                continue;
            }
            String key = URLDecoder.decode(pair.substring(0, equals), StandardCharsets.UTF_8);
            String value = URLDecoder.decode(pair.substring(equals + 1), StandardCharsets.UTF_8);
            fields.put(key, value);
        }
        return fields;
    }

    private void verifyFresh(Map<String, String> fields) {
        String authDate = fields.get("auth_date");
        if (authDate == null) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Telegram auth_date is missing");
        }
        long seconds;
        try {
            seconds = Long.parseLong(authDate);
        } catch (NumberFormatException ex) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Telegram auth_date is invalid");
        }
        if (Instant.ofEpochSecond(seconds).isBefore(Instant.now().minusSeconds(MAX_INIT_DATA_AGE_SECONDS))) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Telegram initData is expired");
        }
    }

    private UserProfile parseUser(String userJson) {
        if (userJson == null || userJson.isBlank()) {
            if (properties.demoMode()) {
                return demoUser();
            }
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Telegram user payload is missing");
        }
        try {
            JsonNode user = objectMapper.readTree(userJson);
            return new UserProfile(
                    user.path("id").asLong(),
                    text(user, "first_name"),
                    text(user, "last_name"),
                    text(user, "username"),
                    text(user, "language_code"),
                    text(user, "photo_url"),
                    "male",
                    25
            );
        } catch (Exception ex) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Telegram user payload is invalid", ex);
        }
    }

    private static String text(JsonNode node, String field) {
        JsonNode value = node.get(field);
        return value == null || value.isNull() ? null : value.asText();
    }

    private static byte[] hmacSha256(byte[] key, byte[] data) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(key, "HmacSHA256"));
            return mac.doFinal(data);
        } catch (Exception ex) {
            throw new IllegalStateException("Unable to calculate HMAC-SHA-256", ex);
        }
    }

    private static String hex(byte[] bytes) {
        StringBuilder builder = new StringBuilder(bytes.length * 2);
        for (byte b : bytes) {
            builder.append(String.format("%02x", b));
        }
        return builder.toString();
    }

    private UserProfile demoUser() {
        return new UserProfile(726773708L, "Dmitry", null, "demo_ascender", "ru", null, "male", 25);
    }
}
