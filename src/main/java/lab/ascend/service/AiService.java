package lab.ascend.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lab.ascend.config.AppProperties;
import lab.ascend.domain.UserProfile;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.io.BufferedReader;
import java.io.OutputStream;
import java.io.OutputStreamWriter;
import java.io.StringReader;
import java.math.BigDecimal;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@Service
public class AiService {
    private static final Logger log = LoggerFactory.getLogger(AiService.class);

    private static final String FREE_MESSAGE = """
            BodyGPT доступен в BodyPro. Я уже готов разобрать лицо, уход, питание и план на 60 дней. Оформи доступ, и я начну с конкретного персонального шага.
            """.trim();

    private final AppProperties properties;
    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;

    public AiService(AppProperties properties, ObjectMapper objectMapper) {
        this.properties = properties;
        this.objectMapper = objectMapper;
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(20))
                .build();
    }

    public void streamChat(UserProfile user, boolean subscribed, String message, OutputStream outputStream) {
        try (OutputStreamWriter writer = new OutputStreamWriter(outputStream, StandardCharsets.UTF_8)) {
            if (!subscribed) {
                writeSlowly(writer, FREE_MESSAGE);
                writeEvent(writer, "done", Map.of("ok", true));
                return;
            }
            if (properties.ai().configured()) {
                try {
                    streamKie(writer, user, message);
                    writeEvent(writer, "done", Map.of("ok", true));
                    return;
                } catch (Exception ex) {
                    log.warn("Kie.ai streaming failed, falling back to local assistant: {}", ex.getMessage());
                }
            }
            writeSlowly(writer, proFallback(user, message));
            writeEvent(writer, "done", Map.of("ok", true));
        } catch (Exception ex) {
            log.warn("Chat stream failed: {}", ex.getMessage());
        }
    }

    public Optional<NutritionEstimate> estimateMealWithAi(String text, String mealType) {
        if (!properties.ai().configured()) {
            return Optional.empty();
        }
        String prompt = """
                Оцени КБЖУ приема пищи. Ответь строго JSON без markdown:
                {"title":"короткое название","calories":0,"protein":0,"fat":0,"carbs":0}
                Тип приема: %s
                Описание: %s
                """.formatted(mealType, text);
        try {
            String content = complete(prompt, true);
            JsonNode json = objectMapper.readTree(stripCodeBlock(content));
            return Optional.of(new NutritionEstimate(
                    json.path("title").asText(text),
                    json.path("calories").asInt(0),
                    json.path("protein").asInt(0),
                    json.path("fat").asInt(0),
                    json.path("carbs").asInt(0)
            ));
        } catch (Exception ex) {
            log.warn("Kie.ai meal estimation failed: {}", ex.getMessage());
            return Optional.empty();
        }
    }

    public Optional<JsonNode> analyzeFaceWithAi(List<String> dataUrls, String gender, int age) {
        if (!properties.ai().configured() || dataUrls.isEmpty()) {
            return Optional.empty();
        }
        List<Map<String, Object>> content = new ArrayList<>();
        content.add(Map.of("type", "text", "text", """
                Ты эксперт по внешности, стилю, уходу за кожей и softmaxxing. 
                Проанализируй фото бережно, без медицинских формулировок и без утверждений о личности.
                Верни строго JSON:
                {"score":0,"summary":"...","metrics":[{"name":"гармония","value":0,"hint":"..."}],
                "zones":[{"name":"кожа","status":"...","advice":"..."}],
                "routine":["..."],"style":["..."],"riskNote":"..."}
                Пол: %s. Возраст: %d.
                """.formatted(gender, age)));
        for (String dataUrl : dataUrls) {
            content.add(Map.of("type", "image_url", "image_url", Map.of("url", dataUrl)));
        }
        Map<String, Object> request = Map.of(
                "model", "gemini-2.5-flash",
                "stream", false,
                "temperature", BigDecimal.valueOf(0.45),
                "messages", List.of(Map.of("role", "user", "content", content))
        );
        try {
            String response = postKie(request);
            String contentText = objectMapper.readTree(response)
                    .path("choices").path(0).path("message").path("content").asText();
            return Optional.of(objectMapper.readTree(stripCodeBlock(contentText)));
        } catch (Exception ex) {
            log.warn("Kie.ai face analysis failed: {}", ex.getMessage());
            return Optional.empty();
        }
    }

    private void streamKie(OutputStreamWriter writer, UserProfile user, String message) throws Exception {
        Map<String, Object> request = Map.of(
                "model", "gemini-2.5-flash",
                "stream", true,
                "temperature", BigDecimal.valueOf(0.72),
                "messages", List.of(
                        Map.of("role", "system", "content", """
                                Ты BodyGPT, персональный AI-ассистент BodyLab по внешности, уходу, стилю, питанию и привычкам.
                                Отвечай по-русски, конкретно, бережно и практично. Не обещай медицинский эффект.
                                Давай короткий план действий, если вопрос широкий.
                                """),
                        Map.of("role", "user", "content", List.of(Map.of(
                                "type", "text",
                                "text", "Пользователь: " + user.displayName() + ". Вопрос: " + message
                        )))
                )
        );
        HttpRequest httpRequest = HttpRequest.newBuilder()
                .uri(URI.create(properties.ai().kieApiUrl()))
                .header("Authorization", "Bearer " + properties.ai().kieApiKey())
                .header("Content-Type", "application/json")
                .timeout(Duration.ofMinutes(2))
                .POST(HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(request), StandardCharsets.UTF_8))
                .build();
        HttpResponse<java.io.InputStream> response = httpClient.send(httpRequest, HttpResponse.BodyHandlers.ofInputStream());
        if (response.statusCode() / 100 != 2) {
            throw new IllegalStateException("Kie.ai returned HTTP " + response.statusCode());
        }
        try (BufferedReader reader = new BufferedReader(new java.io.InputStreamReader(response.body(), StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) {
                if (!line.startsWith("data:")) {
                    continue;
                }
                String data = line.substring(5).trim();
                if (data.isBlank() || "[DONE]".equals(data)) {
                    continue;
                }
                String delta = extractDelta(data);
                if (!delta.isBlank()) {
                    writeEvent(writer, "delta", Map.of("text", delta));
                }
            }
        }
    }

    private String complete(String prompt, boolean jsonMode) throws Exception {
        Map<String, Object> request = Map.of(
                "model", "gemini-2.5-flash",
                "stream", false,
                "temperature", BigDecimal.valueOf(0.35),
                "messages", List.of(Map.of("role", "user", "content", prompt))
        );
        String response = postKie(request);
        return objectMapper.readTree(response).path("choices").path(0).path("message").path("content").asText();
    }

    private String postKie(Map<String, Object> request) throws Exception {
        HttpRequest httpRequest = HttpRequest.newBuilder()
                .uri(URI.create(properties.ai().kieApiUrl()))
                .header("Authorization", "Bearer " + properties.ai().kieApiKey())
                .header("Content-Type", "application/json")
                .timeout(Duration.ofMinutes(2))
                .POST(HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(request), StandardCharsets.UTF_8))
                .build();
        HttpResponse<String> response = httpClient.send(httpRequest, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
        if (response.statusCode() / 100 != 2) {
            throw new IllegalStateException("Kie.ai returned HTTP " + response.statusCode());
        }
        return response.body();
    }

    private String extractDelta(String json) {
        try {
            JsonNode delta = objectMapper.readTree(json).path("choices").path(0).path("delta").path("content");
            if (delta.isTextual()) {
                return delta.asText();
            }
            if (delta.isArray()) {
                StringBuilder builder = new StringBuilder();
                for (JsonNode item : delta) {
                    if (item.has("text")) {
                        builder.append(item.path("text").asText());
                    }
                }
                return builder.toString();
            }
        } catch (Exception ignored) {
            return "";
        }
        return "";
    }

    private void writeSlowly(OutputStreamWriter writer, String text) throws Exception {
        for (String chunk : chunks(text, 16)) {
            writeEvent(writer, "delta", Map.of("text", chunk));
            Thread.sleep(22);
        }
    }

    private void writeEvent(OutputStreamWriter writer, String event, Object payload) throws Exception {
        writer.write("event: " + event + "\n");
        writer.write("data: " + objectMapper.writeValueAsString(payload) + "\n\n");
        writer.flush();
    }

    private List<String> chunks(String text, int size) {
        List<String> chunks = new ArrayList<>();
        for (int i = 0; i < text.length(); i += size) {
            chunks.add(text.substring(i, Math.min(text.length(), i + size)));
        }
        return chunks;
    }

    private String proFallback(UserProfile user, String message) {
        return """
                %s, я бы начал с трёх шагов на ближайшие 72 часа:
                
                1. Утро: мягкое очищение, увлажнение и SPF, чтобы стабилизировать тон кожи.
                2. Внешний контур: проверь посадку стрижки у висков и объём сверху — это быстрее всего меняет восприятие лица.
                3. Режим: вода, сон и белок в каждом приёме пищи. Через неделю появится более чистая база для точных решений.
                
                По твоему вопросу "%s" я бы сделал персональный протокол после свежего анализа лица.
                """.formatted(user.displayName(), message).trim();
    }

    private static String stripCodeBlock(String content) {
        String value = content == null ? "" : content.trim();
        if (value.startsWith("```")) {
            try (BufferedReader reader = new BufferedReader(new StringReader(value))) {
                return reader.lines()
                        .filter(line -> !line.trim().startsWith("```"))
                        .collect(java.util.stream.Collectors.joining("\n"))
                        .trim();
            } catch (Exception ignored) {
                return value;
            }
        }
        return value;
    }

    public record NutritionEstimate(String title, int calories, int protein, int fat, int carbs) {
    }
}
