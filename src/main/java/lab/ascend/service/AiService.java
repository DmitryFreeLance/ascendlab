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

    public void streamChat(UserProfile user, boolean subscribed, String message, List<ChatMessage> history, OutputStream outputStream) {
        try (OutputStreamWriter writer = new OutputStreamWriter(outputStream, StandardCharsets.UTF_8)) {
            if (!subscribed) {
                writeSlowly(writer, FREE_MESSAGE);
                writeEvent(writer, "done", Map.of("ok", true));
                return;
            }
            if (properties.ai().configured()) {
                try {
                    streamKie(writer, user, message, history);
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

    public Optional<NutritionEstimate> estimateMealPhotoWithAi(String dataUrl, String text, String mealType) {
        if (!properties.ai().configured() || dataUrl == null || dataUrl.isBlank()) {
            return Optional.empty();
        }
        List<Map<String, Object>> content = new ArrayList<>();
        content.add(Map.of("type", "text", "text", """
                Определи еду и примерный размер порции по фотографии тарелки.
                Учитывай видимые соусы, масло, напитки и гарниры. Не изображай точность весов:
                выбери реалистичную центральную оценку и не занижай скрытые калории.
                Если еда не видна или фото непригодно, верни photoValid=false.
                Ответь строго JSON без markdown:
                {"photoValid":true,"title":"короткое название","calories":0,
                "protein":0,"fat":0,"carbs":0,"confidence":0,"assumptions":["..."]}
                Тип приёма: %s. Комментарий пользователя: %s
                """.formatted(mealType, text == null ? "" : text)));
        content.add(Map.of("type", "image_url", "image_url", Map.of("url", dataUrl)));
        Map<String, Object> request = Map.of(
                "model", "gemini-2.5-flash",
                "stream", false,
                "temperature", BigDecimal.valueOf(0.1),
                "messages", List.of(Map.of("role", "user", "content", content))
        );
        try {
            String response = postKie(request);
            String contentText = objectMapper.readTree(response)
                    .path("choices").path(0).path("message").path("content").asText();
            JsonNode json = objectMapper.readTree(stripCodeBlock(contentText));
            if (!json.path("photoValid").asBoolean(false)) {
                throw new IllegalStateException("На фото не удалось уверенно распознать тарелку с едой.");
            }
            return Optional.of(new NutritionEstimate(
                    json.path("title").asText(text == null || text.isBlank() ? "Приём пищи" : text),
                    json.path("calories").asInt(0),
                    json.path("protein").asInt(0),
                    json.path("fat").asInt(0),
                    json.path("carbs").asInt(0)
            ));
        } catch (IllegalStateException ex) {
            throw ex;
        } catch (Exception ex) {
            log.warn("Kie.ai meal photo estimation failed: {}", ex.getMessage());
            return Optional.empty();
        }
    }

    public Optional<JsonNode> analyzeFaceWithAi(List<String> dataUrls, String gender, int age) {
        if (!properties.ai().configured() || dataUrls.isEmpty()) {
            return Optional.empty();
        }
        List<Map<String, Object>> content = new ArrayList<>();
        content.add(Map.of("type", "text", "text", """
                Ты нейтральный визуальный аналитик внешности BodyLab. Сначала проверь пригодность фото.
                Лицо должно быть достаточно крупным, открытым, без фильтра, сильного размытия, маски,
                закрывающей черты руки или экстремального ракурса. Если это зеркало в полный рост,
                лицо слишком мало или его нельзя оценить, верни photoValid=false и короткую rejectReason.
                Первое изображение считай анфас, второе — дополнительным профилем. Если на двух
                изображениях разные люди или второй кадр не помогает анализу лица, верни photoValid=false.
                Анализируй только видимое, бережно, без медицинских выводов и утверждений о личности.
                Не добавляй одежду, гардероб и социальную подачу как метрики.
                Верни строго JSON без markdown:
                {"photoValid":true,"photoType":"face","qualityScore":0,"rejectReason":"",
                "score":0,"summary":"конкретный честный вывод",
                "metrics":[
                {"id":"harmony","name":"Гармония","value":0,"hint":"...","details":"...","actions":["..."]},
                {"id":"proportions","name":"Пропорции и симметрия","value":0,"hint":"...","details":"...","actions":["..."]},
                {"id":"eyes","name":"Зона глаз","value":0,"hint":"...","details":"...","actions":["..."]},
                {"id":"brows","name":"Брови","value":0,"hint":"...","details":"...","actions":["..."]},
                {"id":"midface","name":"Средняя треть и нос","value":0,"hint":"...","details":"...","actions":["..."]},
                {"id":"lips","name":"Губы","value":0,"hint":"...","details":"...","actions":["..."]},
                {"id":"jaw","name":"Челюсть","value":0,"hint":"...","details":"...","actions":["..."]},
                {"id":"chin","name":"Подбородок и профиль","value":0,"hint":"...","details":"...","actions":["..."]},
                {"id":"bone_structure","name":"Костная структура","value":0,"hint":"...","details":"...","actions":["..."]},
                {"id":"skin","name":"Кожа","value":0,"hint":"...","details":"...","actions":["..."]},
                {"id":"hair","name":"Прическа","value":0,"hint":"...","details":"...","actions":["..."]},
                {"id":"contour","name":"Контур лица","value":0,"hint":"...","details":"...","actions":["..."]},
                {"id":"freshness","name":"Свежесть","value":0,"hint":"...","details":"...","actions":["..."]},
                {"id":"photo_quality","name":"Качество фото","value":0,"hint":"...","details":"...","actions":["..."]}
                ],"zones":[{"name":"...","status":"сильная сторона или фокус","advice":"..."}],
                "routine":["..."]}
                Шкала строгая и калиброванная: 50 — обычная нейтральная база; 60–69 — заметно сильнее
                средней базы; 70–79 — сильный результат; 80–89 — редкий очень сильный результат;
                90+ — только исключительный кадр без существенных слабых зон. Не ставь высокий балл
                за один удачный свет. Значения опираются только на видимые признаки, одинаковое фото
                должно получать максимально близкий результат.
                Пол: %s. Возраст: %d.
                """.formatted(gender, age)));
        for (String dataUrl : dataUrls) {
            content.add(Map.of("type", "image_url", "image_url", Map.of("url", dataUrl)));
        }
        Map<String, Object> request = Map.of(
                "model", "gemini-2.5-flash",
                "stream", false,
                "temperature", BigDecimal.valueOf(0.15),
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

    public Optional<JsonNode> analyzeBodyWithAi(String dataUrl,
                                                int height,
                                                int weight,
                                                int waist,
                                                String goal,
                                                String gender,
                                                int age) {
        if (!properties.ai().configured() || dataUrl == null || dataUrl.isBlank()) {
            return Optional.empty();
        }
        List<Map<String, Object>> content = new ArrayList<>();
        content.add(Map.of("type", "text", "text", """
                Ты нейтральный визуальный аналитик формы тела BodyLab. Сначала проверь фото.
                Для оценки должны быть видны контуры корпуса минимум от плеч до бёдер, без пуховика,
                пальто, оверсайз-одежды, сильного зеркального искажения и скрывающей позы.
                Спортивная или прилегающая одежда допустима. Если контуры скрыты, верни
                photoValid=false и понятную rejectReason — не придумывай балл.
                Верни строго JSON без markdown:
                {"photoValid":true,"photoType":"body","qualityScore":0,"rejectReason":"",
                "score":0,"title":"...","summary":"...",
                "metrics":[{"name":"Силуэт","value":0,"hint":"..."},
                {"name":"Пропорции","value":0,"hint":"..."},
                {"name":"Мышечный тонус","value":0,"hint":"..."},
                {"name":"Осанка","value":0,"hint":"..."},
                {"name":"Качество фото","value":0,"hint":"..."}]}
                Оцени только видимое. 50 — обычная база, 70 — заметно сильная форма,
                80 — редкая очень сильная, 90+ — исключительная. Одежда или свет не должны
                искусственно повышать результат. Данные пользователя нужны для контекста,
                но не заменяют визуальный анализ: рост %d, вес %d, талия %d, цель %s,
                пол %s, возраст %d.
                """.formatted(height, weight, waist, goal, gender, age)));
        content.add(Map.of("type", "image_url", "image_url", Map.of("url", dataUrl)));
        Map<String, Object> request = Map.of(
                "model", "gemini-2.5-flash",
                "stream", false,
                "temperature", BigDecimal.valueOf(0.1),
                "messages", List.of(Map.of("role", "user", "content", content))
        );
        try {
            String response = postKie(request);
            String contentText = objectMapper.readTree(response)
                    .path("choices").path(0).path("message").path("content").asText();
            return Optional.of(objectMapper.readTree(stripCodeBlock(contentText)));
        } catch (Exception ex) {
            log.warn("Kie.ai body analysis failed: {}", ex.getMessage());
            return Optional.empty();
        }
    }

    public Optional<JsonNode> analyzeBattleWithAi(String ownDataUrl, String opponentDataUrl) {
        if (!properties.ai().configured() || ownDataUrl == null || opponentDataUrl == null) {
            return Optional.empty();
        }
        List<Map<String, Object>> content = new ArrayList<>();
        content.add(Map.of("type", "text", "text", """
                Ты — нейтральный визуальный аналитик BodyLab. Сравни два фото по одной и той же шкале.
                Первое изображение — «Твоё фото», второе — «Фото соперника».
                Оцени только то, что реально видно: качество кадра, свет, свежесть, ухоженность,
                гармонию видимых черт и общий визуальный контур. Не делай выводов о личности,
                здоровье, этничности или социальном статусе. Не завышай и не занижай балл случайно.
                Верни строго JSON без markdown:
                {"ownPhotoValid":true,"ownQualityScore":0,"rejectReason":"",
                "ownScore":0,"opponentScore":0,
                "ownMetrics":[{"name":"гармония","value":0},{"name":"ухоженность","value":0},
                {"name":"свежесть","value":0},{"name":"качество кадра","value":0}],
                "opponentMetrics":[{"name":"гармония","value":0},{"name":"ухоженность","value":0},
                {"name":"свежесть","value":0},{"name":"качество кадра","value":0}],
                "summary":"одно конкретное сравнение с формулировками Твоё фото и Фото соперника",
                "ownStrengths":["..."],"opponentStrengths":["..."],"focus":["..."]}
                Если первое фото не показывает лицо достаточно крупно и открыто, верни
                ownPhotoValid=false и rejectReason вместо выдуманного сравнения.
                В summary никогда не пиши «первое фото», «второе фото», «первый кадр» или
                «второй кадр» — используй только «Твоё фото» и «Фото соперника».
                Шкала: 50 — обычная база, 70 — заметно сильный результат, 80 — редкий,
                90+ — исключительный. Баллы должны быть согласованы с метриками и отличаться
                только при видимой разнице.
                """));
        content.add(Map.of("type", "image_url", "image_url", Map.of("url", ownDataUrl)));
        content.add(Map.of("type", "image_url", "image_url", Map.of("url", opponentDataUrl)));
        Map<String, Object> request = Map.of(
                "model", "gemini-2.5-flash",
                "stream", false,
                "temperature", BigDecimal.valueOf(0.15),
                "messages", List.of(Map.of("role", "user", "content", content))
        );
        try {
            String response = postKie(request);
            String contentText = objectMapper.readTree(response)
                    .path("choices").path(0).path("message").path("content").asText();
            return Optional.of(objectMapper.readTree(stripCodeBlock(contentText)));
        } catch (Exception ex) {
            log.warn("Kie.ai battle analysis failed: {}", ex.getMessage());
            return Optional.empty();
        }
    }

    public Optional<JsonNode> analyzeToolWithAi(String title,
                                                String text,
                                                List<String> metricNames,
                                                List<String> tasks,
                                                List<String> dataUrls,
                                                String gender,
                                                int age) {
        if (!properties.ai().configured() || dataUrls.isEmpty()) {
            return Optional.empty();
        }
        List<Map<String, Object>> content = new ArrayList<>();
        content.add(Map.of("type", "text", "text", """
                Ты эксперт BodyLab по внешности, стилю, фото, уходу и привычкам.
                Раздел: %s.
                Что оцениваем: %s
                Метрики: %s
                Базовые действия: %s
                Проанализируй фото бережно, конкретно и без медицинских формулировок.
                Верни строго JSON без markdown:
                {"photoValid":true,"qualityScore":0,"rejectReason":"","score":0,
                "title":"...","headline":"...","summary":"...",
                "metrics":[{"name":"...","value":0,"hint":"..."}],
                "tasks":["..."],"planText":"..."}
                Если нужная для раздела зона не видна, кадр размыт, закрыт одеждой или предметом,
                верни photoValid=false вместо придуманного результата.
                Шкала: 50 — обычная база, 70 — заметно сильный результат, 80 — редкий,
                90+ — исключительный. Не повышай балл только за свет, фильтр или ракурс.
                Пол: %s. Возраст: %d.
                """.formatted(title, text, String.join(", ", metricNames), String.join("; ", tasks), gender, age)));
        for (String dataUrl : dataUrls) {
            content.add(Map.of("type", "image_url", "image_url", Map.of("url", dataUrl)));
        }
        Map<String, Object> request = Map.of(
                "model", "gemini-2.5-flash",
                "stream", false,
                "temperature", BigDecimal.valueOf(0.15),
                "messages", List.of(Map.of("role", "user", "content", content))
        );
        try {
            String response = postKie(request);
            String contentText = objectMapper.readTree(response)
                    .path("choices").path(0).path("message").path("content").asText();
            return Optional.of(objectMapper.readTree(stripCodeBlock(contentText)));
        } catch (Exception ex) {
            log.warn("Kie.ai tool analysis failed: {}", ex.getMessage());
            return Optional.empty();
        }
    }

    private void streamKie(OutputStreamWriter writer, UserProfile user, String message, List<ChatMessage> history) throws Exception {
        List<Map<String, Object>> messages = new ArrayList<>();
        messages.add(Map.of("role", "system", "content", """
                Ты BodyGPT, персональный AI-ассистент BodyLab по внешности, уходу, стилю, питанию и привычкам.
                Отвечай по-русски, конкретно, бережно и практично.
                Не используй markdown, звёздочки, жирный текст и списки со звёздочками. Для списков используй короткие строки с дефисом.
                Не обещай медицинский эффект.
                Давай короткий план действий, если вопрос широкий.
                """));
        for (ChatMessage item : safeHistory(history)) {
            String role = "assistant".equals(item.role()) ? "assistant" : "user";
            messages.add(Map.of("role", role, "content", stripMarkdown(item.text())));
        }
        messages.add(Map.of("role", "user", "content", List.of(Map.of(
                "type", "text",
                "text", "Пользователь: " + user.displayName() + ". Вопрос: " + message
        ))));
        Map<String, Object> request = Map.of(
                "model", "gemini-2.5-flash",
                "stream", true,
                "temperature", BigDecimal.valueOf(0.72),
                "messages", messages
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

    private List<ChatMessage> safeHistory(List<ChatMessage> history) {
        if (history == null || history.isEmpty()) {
            return List.of();
        }
        return history.stream()
                .filter(item -> item != null && item.text() != null && !item.text().isBlank())
                .skip(Math.max(0, history.size() - 8))
                .map(item -> new ChatMessage(item.role(), clip(stripMarkdown(item.text()), 700)))
                .toList();
    }

    private String stripMarkdown(String value) {
        return value == null ? "" : value
                .replace("**", "")
                .replace("*", "")
                .trim();
    }

    private String clip(String value, int maxLength) {
        return value.length() <= maxLength ? value : value.substring(0, maxLength);
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

    public record ChatMessage(String role, String text) {
    }
}
